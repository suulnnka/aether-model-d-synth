/**
 * 交互系统(INT-1 ~ INT-12)
 * raycast 命中优先于相机手势;手势状态机:idle / drag-knob / drag-wheel /
 * press-keys / drag-hinge / selector-click / selector-drag。
 */
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ParamStore, ParamDef } from "../state/params";
import type { Synth, KeyInfo } from "../model/synth";
import type { SynthEngine } from "../audio/engine";
import { PARAM_DEF_MAP } from "../state/params";

type Gesture = "idle" | "drag-knob" | "drag-wheel" | "press-keys" | "drag-hinge" | "selector-click" | "selector-drag";

export interface InteractionCallbacks {
  toggleView: () => void;
  toggleHinge: () => void;
  toggleHelp: () => void;
}

/* ---------- §7 电脑键盘映射 ---------- */
const KEY_ROW_UPPER: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ";": 16, "'": 17,
};
const KEY_ROW_LOWER: Record<string, number> = {
  z: 0, x: 2, c: 4, v: 5, b: 7, n: 9, m: 11, ",": 12, ".": 14, "/": 16,
};
const MIDI_MIN = 41;
const MIDI_MAX = 84;

export class InteractionManager {
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private gesture: Gesture = "idle";
  private gestureControlId: string | null = null;
  private startY = 0;
  private startVal = 0;
  private startDeg = 0;
  private moved = false;
  private pressedByPointer = new Set<number>();
  private keyboardHeld = new Map<string, number>();
  private octaveShift = 0;
  private tweens: { obj: THREE.Object3D; prop: "rotation.x" | "rotation.y"; from: number; to: number; t: number; dur: number }[] = [];
  private hoverId: string | null = null;
  private hoverKind: "control" | "key" | "wheel" | "hinge" | null = null;
  private hoverMidi: number | null = null;
  private origEmissive = new Map<THREE.Mesh, number>();
  private keyMeshByMidi: Map<number, KeyInfo>;
  private lastHingeDeg = 50;
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(
    private canvas: HTMLCanvasElement,
    private store: ParamStore,
    private synth: Synth,
    private engine: SynthEngine,
    private controls: OrbitControls,
    private tooltip: HTMLDivElement,
    private cb: InteractionCallbacks
  ) {
    this.keyMeshByMidi = new Map(synth.keys.map((k) => [k.midi, k]));
    this.prepHighlightMaterials();

    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    canvas.addEventListener("pointermove", (e) => this.onMove(e));
    canvas.addEventListener("pointerup", (e) => this.onUp(e));
    canvas.addEventListener("pointerleave", () => this.clearHover());
    canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener("dblclick", (e) => this.onDblClick(e));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.onKeyUp(e));
    window.addEventListener("blur", () => this.engine.panic());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.engine.panic();
    });
  }

  /* ---------- 高亮材质预克隆(INT-7) ---------- */
  private prepHighlightMaterials() {
    for (const b of this.synth.bindings) {
      b.hit.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const mat = o.material as THREE.MeshStandardMaterial;
          this.origEmissive.set(o as THREE.Mesh, mat.emissiveIntensity);
        }
      });
    }
  }

  private setHighlight(kind: string | null, id: string | number | null) {
    // 清除旧高亮
    if (this.hoverId !== null) {
      const old = this.findGroup(this.hoverId);
      old?.traverse((o) => {
        if (o instanceof THREE.Mesh && this.origEmissive.has(o)) {
          (o.material as THREE.MeshStandardMaterial).emissiveIntensity = this.origEmissive.get(o)!;
        }
      });
    }
    (this.synth.hingeHandle.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
    this.hoverId = null;
    this.hoverKind = null;
    this.hoverMidi = null;

    if (kind === "control" && typeof id === "string") {
      const g = this.findGroup(id);
      g?.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const mat = o.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.25;
          this.hoverId = id;
        }
      });
      this.hoverKind = "control";
    } else if (kind === "hinge") {
      (this.synth.hingeHandle.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
      this.hoverKind = "hinge";
    } else if (kind === "key" && typeof id === "number") {
      this.hoverKind = "key";
      this.hoverMidi = id;
    } else if (kind === "wheel" && typeof id === "string") {
      this.hoverKind = "wheel";
      this.hoverId = id;
      this.setHighlightWheel(id, true);
    }
    this.canvas.style.cursor =
      this.hoverKind === null ? "default" : this.hoverKind === "key" ? "pointer" : "grab";
  }

  private setHighlightWheel(id: string, on: boolean) {
    const wheelMesh = this.findWheel(id);
    wheelMesh?.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mat = o.material as THREE.MeshStandardMaterial;
        mat.emissive = mat.emissive || new THREE.Color(0xe08a3c);
        mat.emissiveIntensity = on ? 0.25 : 0;
      }
    });
  }

  private findGroup(id: string): THREE.Object3D | null {
    // 面板控件在 hingeGroup 内
    for (const b of this.synth.bindings) {
      if (b.id === id) return b.hit.parent;
    }
    return null;
  }

  private findWheel(id: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    this.synth.root.traverse((o) => {
      if (!found && o instanceof THREE.Mesh && o.userData.wheelId === id) found = o.parent;
    });
    return found;
  }

  private clearHover() {
    this.setHighlight(null, null);
    this.tooltip.style.display = "none";
    if (this.gesture === "idle") this.canvas.style.cursor = "default";
  }

  /* ---------- 射线 ---------- */

  /** 由 main 注入相机(避免循环依赖) */
  static cameraRef: { camera: THREE.Camera } = { camera: null as unknown as THREE.Camera };

  private pick(e: PointerEvent | WheelEvent | MouseEvent): { kind: "control" | "key" | "wheel" | "hinge" | null; id: string | number | null } {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.ray.setFromCamera(this.pointer, InteractionManager.cameraRef.camera);
    const hits = this.ray.intersectObject(this.synth.root, true);
    for (const h of hits) {
      const o = h.object as THREE.Mesh;
      if (o.userData.isHingeHandle) return { kind: "hinge", id: null };
      if (typeof o.userData.keyMidi === "number") return { kind: "key", id: o.userData.keyMidi as number };
      if (typeof o.userData.wheelId === "string") return { kind: "wheel", id: o.userData.wheelId as string };
      if (typeof o.userData.controlId === "string") return { kind: "control", id: o.userData.controlId as string };
    }
    return { kind: null, id: null };
  }

  /* ---------- Tooltip(INT-7) ---------- */

  private showTooltip(e: PointerEvent | MouseEvent, kind: string | null, id: string | number | null) {
    let text = "";
    if (kind === "control" && typeof id === "string") {
      const def = PARAM_DEF_MAP.get(id as string)!;
      const v = this.store.get(id as string);
      const fmt = def.format ? def.format(v) : def.kind === "switch" ? (v ? "On" : "Off") : def.steps ? def.steps[v] : v.toFixed(1);
      text = `${def.label} · ${fmt}`;
    } else if (kind === "key" && typeof id === "number") {
      text = `琴键 · ${midiName(id)}`;
    } else if (kind === "wheel" && typeof id === "string") {
      const def = PARAM_DEF_MAP.get(id as string)!;
      text = `${def.label} · ${def.format!(this.store.get(id as string))}`;
    } else if (kind === "hinge") {
      text = `面板角度 · 拖动调节(0–60°)`;
    }
    if (!text) {
      this.tooltip.style.display = "none";
      return;
    }
    this.tooltip.textContent = text;
    this.tooltip.style.display = "block";
    this.tooltip.style.left = `${e.clientX + 14}px`;
    this.tooltip.style.top = `${e.clientY + 12}px`;
  }

  /* ---------- 指针事件 ---------- */

  private onDown(e: PointerEvent) {
    if (e.button !== 0 && e.button !== 2) return;
    const hit = this.pick(e);
    this.canvas.setPointerCapture(e.pointerId);
    this.moved = false;

    switch (hit.kind) {
      case "control": {
        const id = hit.id as string;
        const def = PARAM_DEF_MAP.get(id)!;
        this.controls.enabled = false; // VIEW-4:控件命中优先于相机
        if (def.kind === "switch") {
          // INT-3:单击切换,立即翻转到目标姿态
          const target = this.store.get(id) >= 0.5 ? 0 : 1;
          this.store.set(id, target);
          this.animateSwitch(id, target);
        } else if (def.kind === "selector") {
          this.gesture = "selector-click";
          this.gestureControlId = id;
          this.startY = e.clientY;
        } else {
          this.gesture = "drag-knob";
          this.gestureControlId = id;
          this.startY = e.clientY;
          this.startVal = this.store.get(id);
        }
        break;
      }
      case "key": {
        this.controls.enabled = false;
        this.gesture = "press-keys";
        this.noteOnVisual(hit.id as number);
        this.pressedByPointer.add(hit.id as number);
        this.engine.noteOn(hit.id as number);
        break;
      }
      case "wheel": {
        this.controls.enabled = false;
        this.gesture = "drag-wheel";
        this.gestureControlId = hit.id as string;
        this.startY = e.clientY;
        this.startVal = this.store.get(hit.id as string);
        break;
      }
      case "hinge": {
        this.controls.enabled = false;
        this.gesture = "drag-hinge";
        this.startY = e.clientY;
        this.startDeg = this.currentHingeDeg();
        break;
      }
      default:
        break; // 相机手势交给 OrbitControls
    }
  }

  private onMove(e: PointerEvent) {
    const dxTotal = 0;
    void dxTotal;
    if (this.gesture === "idle") {
      const hit = this.pick(e);
      this.setHighlight(hit.kind, hit.id);
      this.showTooltip(e, hit.kind, hit.id);
      // 悬停在可交互控件上时禁用相机手势(VIEW-4)
      this.controls.enabled = hit.kind === null;
      return;
    }
    if (Math.abs(e.clientY - this.startY) > 2 || Math.abs(e.movementX) > 2) this.moved = true;
    const dy = this.startY - e.clientY; // 上拖为增(INT-1)

    switch (this.gesture) {
      case "drag-knob": {
        const def = PARAM_DEF_MAP.get(this.gestureControlId!)!;
        const range = def.max! - def.min!;
        const speed = e.shiftKey ? 0.001 : 0.01; // Shift = ×0.1 精调
        this.store.set(this.gestureControlId!, this.startVal + dy * speed * range / 10);
        this.showTooltip(e, "control", this.gestureControlId);
        break;
      }
      case "drag-wheel": {
        const def = PARAM_DEF_MAP.get(this.gestureControlId!)!;
        const range = def.max! - def.min!;
        this.store.set(this.gestureControlId!, this.startVal + (dy / 140) * range);
        break;
      }
      case "drag-hinge": {
        const deg = Math.min(60, Math.max(0, this.startDeg + dy / 1.1));
        this.setLiveHinge(deg);
        this.lastHingeDeg = deg;
        break;
      }
      case "selector-click": {
        if (this.moved) {
          this.gesture = "selector-drag";
          this.dragSelector(e);
        }
        break;
      }
      case "selector-drag": {
        this.dragSelector(e);
        break;
      }
      case "press-keys": {
        // 滑奏(INT-4):按住滑过相邻键
        const hit = this.pick(e);
        if (hit.kind === "key" && !this.pressedByPointer.has(hit.id as number)) {
          for (const midi of this.pressedByPointer) {
            this.engine.noteOff(midi);
            this.noteOffVisual(midi);
          }
          this.pressedByPointer.clear();
          this.pressedByPointer.add(hit.id as number);
          this.noteOnVisual(hit.id as number);
          this.engine.noteOn(hit.id as number);
        }
        break;
      }
    }
  }

  private dragSelector(e: PointerEvent) {
    // 圆弧方向换档(INT-2):以控件屏幕投影中心计算角度
    const id = this.gestureControlId!;
    const def = PARAM_DEF_MAP.get(id)!;
    const group = this.findGroup(id);
    if (!group) return;
    const center = group.getWorldPosition(new THREE.Vector3()).project(InteractionManager.cameraRef.camera as THREE.PerspectiveCamera);
    const rect = this.canvas.getBoundingClientRect();
    const sx = ((center.x + 1) / 2) * rect.width + rect.left;
    const sy = (1 - (center.y + 1) / 2) * rect.height + rect.top;
    const ang = Math.atan2(e.clientX - sx, e.clientY - sy); // 0 = 朝上
    const n = def.steps!.length;
    const step = Math.round(((ang + (135 * Math.PI) / 180) / ((270 * Math.PI) / 180)) * (n - 1));
    this.store.set(id, Math.min(n - 1, Math.max(0, step)));
    this.showTooltip(e, "control", id);
  }

  private onUp(e: PointerEvent) {
    if (this.gesture === "selector-click" && !this.moved) {
      // INT-2:单击循环进档
      this.store.cycle(this.gestureControlId!, 1);
    }
    if (this.gesture === "press-keys") {
      for (const midi of this.pressedByPointer) {
        this.engine.noteOff(midi);
        this.noteOffVisual(midi);
      }
      this.pressedByPointer.clear();
    }
    if (this.gesture === "drag-wheel" && this.gestureControlId === "pitchWheel") {
      // INT-5:音高轮弹簧回中
      this.springPitchWheel();
    }
    this.gesture = "idle";
    this.gestureControlId = null;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    const hit = this.pick(e);
    this.controls.enabled = hit.kind === null;
  }

  private onWheel(e: WheelEvent) {
    if (this.hoverKind === "control") {
      e.preventDefault();
      e.stopPropagation();
      const id = this.hoverId as string;
      const def = PARAM_DEF_MAP.get(id)!;
      const range = def.max! - def.min!;
      const fine = e.shiftKey ? 0.2 : 1;
      this.store.set(id, this.store.get(id) - Math.sign(e.deltaY) * (range / 40) * fine);
      this.showTooltip(e, "control", id);
    }
    // 其余滚轮交给相机缩放;2D 模式旋转/平移已被禁用,仅缩放(VIEW-3)
  }

  private onDblClick(e: MouseEvent) {
    const hit = this.pick(e);
    if (hit.kind === "control") {
      const id = hit.id as string;
      const def = PARAM_DEF_MAP.get(id)!;
      if (def.kind === "knob") {
        this.store.reset(id); // INT-1:双击恢复默认
      }
    }
  }

  /* ---------- 铰链 ---------- */

  private currentHingeDeg(): number {
    return this.lastHingeDeg;
  }
  private setLiveHinge(deg: number) {
    this.synth.setHinge(deg);
  }
  /** 供外部(快捷键/按钮)立起/放平 */
  setHingeTarget(deg: number, animate = true) {
    this.lastHingeDeg = deg;
    if (!animate || this.reducedMotion) {
      this.synth.setHinge(deg);
      return;
    }
    const from = this.readHingeAngle();
    const t0 = performance.now();
    const dur = 500; // HINGE-2:约 0.5s
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.synth.setHinge(from + (deg - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  private readHingeAngle(): number {
    return THREE.MathUtils.radToDeg(this.synth.hingeGroup.rotation.x);
  }
  get rememberedHingeDeg(): number {
    return this.lastHingeDeg;
  }
  set rememberedHingeDeg(v: number) {
    this.lastHingeDeg = v;
    this.synth.setHinge(v);
  }

  /* ---------- 开关 80ms 翻转动画(INT-3) ---------- */

  private animateSwitch(id: string, target: number) {
    const group = this.findGroup(id);
    if (!group) return;
    const lever = group.children.find((c) => c.type === "Group") as THREE.Group | undefined;
    const rot = lever ?? group;
    const on = target >= 0.5;
    if (this.reducedMotion) {
      rot.rotation.x = on ? -0.38 : 0.38;
      return;
    }
    this.tweens.push({
      obj: rot, prop: "rotation.x",
      from: rot.rotation.x,
      to: on ? -0.38 : 0.38,
      t: 0, dur: 0.08,
    });
  }

  /** 逐帧驱动补间(main 循环调用) */
  tick(dt: number) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.obj.rotation.x = tw.from + (tw.to - tw.from) * k;
      if (k >= 1) this.tweens.splice(i, 1);
    }
    // 音高轮弹簧回中
    if (this.pitchSpringing) {
      const cur = this.store.get("pitchWheel");
      const next = cur * Math.pow(0.0001, dt);
      if (Math.abs(next) < 1) {
        this.store.set("pitchWheel", 0);
        this.pitchSpringing = false;
      } else {
        this.store.set("pitchWheel", next);
      }
    }
  }

  private pitchSpringing = false;
  private springPitchWheel() {
    this.pitchSpringing = true;
  }

  /* ---------- 琴键视觉 ---------- */

  noteOnVisual(midi: number) {
    const k = this.keyMeshByMidi.get(midi);
    if (k) k.targetY = k.restY - (k.white ? 0.0035 : 0.003);
  }
  noteOffVisual(midi: number) {
    const k = this.keyMeshByMidi.get(midi);
    if (k) k.targetY = k.restY;
  }
  releaseAllVisual() {
    for (const k of this.synth.keys) k.targetY = k.restY;
  }

  /* ---------- 电脑键盘演奏(INT-8 / §7) ---------- */

  private onKeyDown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const key = e.key.toLowerCase();

    if (key === " ") {
      e.preventDefault();
      this.engine.allNotesOff();
      this.releaseAllVisual();
      this.pressedByPointer.clear();
      return;
    }
    if (key === "v") { e.preventDefault(); this.cb.toggleView(); return; }
    if (key === "h") { e.preventDefault(); this.cb.toggleHinge(); return; }
    if (e.key === "?" || (e.shiftKey && key === "/")) { e.preventDefault(); this.cb.toggleHelp(); return; }
    if (key === "=" || key === "+") { this.octaveShift = Math.min(2, this.octaveShift + 1); return; }
    if (key === "-") { this.octaveShift = Math.max(-3, this.octaveShift - 1); return; }

    if (e.repeat) return;
    let midi: number | null = null;
    if (key in KEY_ROW_UPPER) {
      midi = 60 + this.octaveShift * 12 + KEY_ROW_UPPER[key];
    } else if (key in KEY_ROW_LOWER) {
      midi = 60 + (this.octaveShift - 1) * 12 + KEY_ROW_LOWER[key];
    }
    if (midi === null) return;
    midi = Math.min(MIDI_MAX, Math.max(MIDI_MIN, midi));
    if (this.keyboardHeld.has(key)) return;
    e.preventDefault();
    this.keyboardHeld.set(key, midi);
    this.noteOnVisual(midi);
    this.engine.noteOn(midi);
  }

  private onKeyUp(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    const midi = this.keyboardHeld.get(key);
    if (midi === undefined) return;
    this.keyboardHeld.delete(key);
    this.engine.noteOff(midi);
    this.noteOffVisual(midi);
  }
}

/* ---------- 工具 ---------- */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function midiName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
