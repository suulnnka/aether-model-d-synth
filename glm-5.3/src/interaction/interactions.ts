import * as THREE from "three";
import type { ControlVisual } from "../model/controls";
import type { SynthModel } from "../model/synth";
import { midiToName } from "../model/dimensions";
import type { ParamStore } from "../state/paramStore";
import { formatValue, PARAM_MAP } from "../state/params";
import type { CameraRig } from "../scene/cameraRig";
import type { HingeController } from "../scene/hinge";
import type { SynthEngine } from "../audio/engine";

/**
 * 指针交互状态机(§5.5):raycast 命中优先于相机手势(INT-10/VIEW-4)。
 * 旋钮:垂直拖动 / Shift 精调 / 双击复位 / 滚轮微调(INT-1)
 * 档位:单击循环 / 圆弧拖动换档(INT-2)
 * 开关:单击切换,~80ms 翻转动画(INT-3)
 * 琴键:按住滑奏(INT-4);轮:垂直拖,音高轮弹簧回中(INT-5)
 * 面板前缘拖拽调角(HINGE-3);hover 高亮 + tooltip(INT-7)
 */

type GestureState =
  | { kind: "idle" }
  | { kind: "camera-orbit"; x: number; y: number }
  | { kind: "camera-pan"; x: number; y: number }
  | { kind: "knob"; id: string; startN: number; startY: number }
  | { kind: "selector"; id: string; lastAngle: number; acc: number; moved: boolean }
  | { kind: "key"; midi: number }
  | { kind: "wheel"; which: "pitch" | "mod"; startY: number; startVal: number }
  | { kind: "hinge"; startY: number; startDeg: number };

interface SwitchAnim {
  id: string;
  from: number;
  to: number;
  t: number;
}

export interface InteractionCallbacks {
  onNoteOn(midi: number): void;
  onNoteOff(midi: number): void;
  onHingeChanged(deg: number): void;
}

export class Interactions {
  private raycaster = new THREE.Raycaster();
  private state: GestureState = { kind: "idle" };
  private pointerId: number | null = null;
  private switchAnims: SwitchAnim[] = [];
  private wheelSpring: { which: "pitch"; from: number; t: number } | null = null;
  private hoveredId: string | null = null;
  private hoveredMidi: number | null = null;
  private canvas: HTMLCanvasElement;
  private reducedMotion: boolean;

  constructor(
    canvas: HTMLCanvasElement,
    private model: SynthModel,
    private store: ParamStore,
    private rig: CameraRig,
    private hinge: HingeController,
    private getEngine: () => SynthEngine | null,
    private tooltip: TooltipHandle,
    private cb: InteractionCallbacks,
    opts: { reducedMotion: boolean }
  ) {
    this.canvas = canvas;
    this.reducedMotion = opts.reducedMotion;
  }

  private lastHoverTime = 0;

  attach(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("dblclick", this.onDblClick);
    window.addEventListener("blur", this.onWindowBlur);
  }

  detach(): void {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("dblclick", this.onDblClick);
    window.removeEventListener("blur", this.onWindowBlur);
  }

  private onWindowBlur = (): void => {
    // 拖拽中断/窗口失焦:清理手势(INT-9 由 app 层 panic 处理)
    this.state = { kind: "idle" };
    this.clearHover();
  };

  // ---------- raycast ----------
  private pick(e: { clientX: number; clientY: number }): { hit: ReturnType<SynthModel["resolveHit"]>; x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    const hits = this.raycaster.intersectObject(this.model.root, true);
    if (hits.length === 0) return { hit: null, x: e.clientX, y: e.clientY };
    return { hit: this.model.resolveHit(hits[0].object), x: e.clientX, y: e.clientY };
  }

  private knobScreenCenter(id: string): { x: number; y: number } | null {
    const v = this.model.controls.get(id);
    if (!v) return null;
    const p = v.group.getWorldPosition(new THREE.Vector3());
    p.project(this.rig.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((p.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - p.y) / 2) * rect.height,
    };
  }

  // ---------- 事件 ----------
  private onDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) return; // 单指针策略
    this.pointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId); // 拖出画布仍能结束拖拽(INT-10)
    } catch {
      /* 合成事件等无捕获场景 */
    }
    const { hit, x, y } = this.pick(e);
    const mode2d = this.rig.mode === "2d";

    if (hit) {
      switch (hit.type) {
        case "control": {
          const def = PARAM_MAP.get(hit.id)!;
          const v = this.model.controls.get(hit.id)!;
          if (def.kind === "switch") {
            this.toggleSwitch(hit.id);
            this.state = { kind: "idle" };
          } else if (def.kind === "selector") {
            this.state = { kind: "selector", id: hit.id, lastAngle: this.angleAt(e, hit.id), acc: 0, moved: false };
          } else {
            this.state = { kind: "knob", id: hit.id, startN: this.store.getNormalized(hit.id), startY: e.clientY };
          }
          void v;
          this.tooltip.showAt(x, y, this.tooltipTextFor(hit.id));
          return;
        }
        case "key": {
          this.cb.onNoteOn(hit.midi);
          this.state = { kind: "key", midi: hit.midi };
          return;
        }
        case "wheel": {
          this.wheelSpring = null;
          this.state = {
            kind: "wheel",
            which: hit.kind,
            startY: e.clientY,
            startVal: this.model.wheelValues[hit.kind],
          };
          return;
        }
        case "hinge": {
          if (!mode2d) {
            this.state = { kind: "hinge", startY: e.clientY, startDeg: this.hinge.deg };
            return;
          }
          break;
        }
        case "power": {
          const cur = this.store.get("power");
          this.store.set("power", cur >= 0.5 ? 0 : 1);
          this.state = { kind: "idle" };
          return;
        }
      }
    }
    // 相机手势(空白处;2D 态锁定旋转/平移,VIEW-3)
    if (mode2d) {
      this.state = { kind: "idle" };
    } else if (e.button === 2 || e.button === 1) {
      this.state = { kind: "camera-pan", x: e.clientX, y: e.clientY };
    } else {
      this.state = { kind: "camera-orbit", x: e.clientX, y: e.clientY };
    }
  };

  private angleAt(e: PointerEvent, id: string): number {
    const c = this.knobScreenCenter(id)!;
    return Math.atan2(e.clientY - c.y, e.clientX - c.x);
  }

  private onMove = (e: PointerEvent): void => {
    const st = this.state;
    switch (st.kind) {
      case "idle": {
        this.updateHover(e);
        return;
      }
      case "camera-orbit": {
        this.rig.orbit((st.x - e.clientX) * 0.0052, (st.y - e.clientY) * 0.0052);
        st.x = e.clientX;
        st.y = e.clientY;
        return;
      }
      case "camera-pan": {
        this.rig.pan(st.x - e.clientX, e.clientY - st.y);
        st.x = e.clientX;
        st.y = e.clientY;
        return;
      }
      case "knob": {
        const fine = e.shiftKey ? 0.1 : 1;
        const dn = ((st.startY - e.clientY) / 260) * fine;
        this.store.setNormalized(st.id, st.startN + dn);
        this.tooltip.showAt(e.clientX, e.clientY, this.tooltipTextFor(st.id));
        return;
      }
      case "selector": {
        const a = this.angleAt(e, st.id);
        let d = a - st.lastAngle;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        st.acc += d;
        st.lastAngle = a;
        if (Math.abs(st.acc) > 0.5) {
          this.store.step(st.id, st.acc > 0 ? 1 : -1);
          st.acc = 0;
          st.moved = true;
          this.tooltip.showAt(e.clientX, e.clientY, this.tooltipTextFor(st.id));
        }
        return;
      }
      case "key": {
        // 滑奏(INT-4)
        const { hit } = this.pick(e);
        if (hit?.type === "key" && hit.midi !== st.midi) {
          this.cb.onNoteOff(st.midi);
          this.cb.onNoteOn(hit.midi);
          st.midi = hit.midi;
        }
        return;
      }
      case "wheel": {
        const range = st.which === "pitch" ? 130 : 150;
        let v = st.startVal + (st.startY - e.clientY) / range;
        v = Math.min(1, Math.max(-1, v));
        if (st.which === "mod") v = Math.max(0, v);
        this.applyWheel(st.which, v);
        return;
      }
      case "hinge": {
        const deg = st.startDeg + (st.startY - e.clientY) * 0.18;
        this.hinge.setDeg(deg);
        this.cb.onHingeChanged(this.hinge.deg);
        return;
      }
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (this.pointerId !== e.pointerId) return;
    this.pointerId = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const st = this.state;
    if (st.kind === "key") {
      this.cb.onNoteOff(st.midi);
    } else if (st.kind === "wheel") {
      if (st.which === "pitch") {
        // 弹簧回中(INT-5)
        this.wheelSpring = { which: "pitch", from: this.model.wheelValues.pitch, t: 0 };
      }
    } else if (st.kind === "selector") {
      // 未拖动 = 单击进档(INT-2)
      if (!st.moved) this.store.step(st.id, 1);
    }
    this.state = { kind: "idle" };
  };

  private onDblClick = (e: MouseEvent): void => {
    const { hit } = this.pick(e);
    if (hit?.type === "control") {
      const def = PARAM_MAP.get(hit.id);
      if (def && def.kind === "knob") this.store.set(hit.id, def.default);
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault(); // 画布上禁用滚轮默认行为(INT-10)
    const { hit } = this.pick(e);
    if (hit?.type === "control") {
      const def = PARAM_MAP.get(hit.id);
      if (def?.kind === "knob") {
        const step = (e.shiftKey ? 0.002 : 0.012) * (e.deltaY > 0 ? -1 : 1);
        this.store.setNormalized(hit.id, this.store.getNormalized(hit.id) + step);
        return;
      }
      if (def?.kind === "selector") {
        this.store.step(hit.id, e.deltaY > 0 ? -1 : 1);
        return;
      }
    }
    this.rig.zoom(Math.exp(e.deltaY * 0.0011));
  };

  // ---------- hover + tooltip(INT-7)----------
  private updateHover(e: PointerEvent): void {
    const now = performance.now();
    if (now - this.lastHoverTime < 16) return;
    this.lastHoverTime = now;
    const { hit, x, y } = this.pick(e);
    this.setHoverVisuals(hit);
    if (hit?.type === "control") {
      this.tooltip.showAt(x, y, this.tooltipTextFor(hit.id));
      this.canvas.style.cursor = "pointer";
    } else if (hit?.type === "key") {
      this.tooltip.showAt(x, y, `琴键 · ${midiToName(hit.midi)}`);
      this.canvas.style.cursor = "pointer";
    } else if (hit?.type === "wheel") {
      this.tooltip.showAt(x, y, hit.kind === "pitch" ? "音高轮(松手回中)" : "调制轮");
      this.canvas.style.cursor = "ns-resize";
    } else if (hit?.type === "hinge") {
      this.tooltip.showAt(x, y, "拖拽调整面板角度");
      this.canvas.style.cursor = "ns-resize";
    } else if (hit?.type === "power") {
      this.tooltip.showAt(x, y, `电源 · ${this.store.isOn("power") ? "On" : "Off"}`);
      this.canvas.style.cursor = "pointer";
    } else {
      this.tooltip.hide();
      this.canvas.style.cursor = "default";
    }
  }

  private setHoverVisuals(hit: ReturnType<SynthModel["resolveHit"]>): void {
    const cid = hit?.type === "control" ? hit.id : null;
    const mid = hit?.type === "key" ? hit.midi : null;
    if (cid !== this.hoveredId) {
      if (this.hoveredId) {
        const v = this.model.controls.get(this.hoveredId);
        if (v) v.halo.visible = false;
      }
      this.hoveredId = cid;
      if (cid) {
        const v = this.model.controls.get(cid);
        if (v) v.halo.visible = true;
      }
    }
    if (mid !== this.hoveredMidi) {
      if (this.hoveredMidi !== null) {
        const k = this.model.keys.get(this.hoveredMidi);
        if (k) k.halo.visible = false;
      }
      this.hoveredMidi = mid;
      if (mid !== null) {
        const k = this.model.keys.get(mid);
        if (k) k.halo.visible = true;
      }
    }
  }

  private clearHover(): void {
    this.setHoverVisuals(null);
    this.tooltip.hide();
  }

  private tooltipTextFor(id: string): string {
    const def = PARAM_MAP.get(id)!;
    return `${def.label} · ${formatValue(def, this.store.get(id))}`;
  }

  // ---------- 开关动画(INT-3:约 80ms 翻转)----------
  private toggleSwitch(id: string): void {
    const cur = this.store.get(id);
    const next = cur >= 0.5 ? 0 : 1;
    this.switchAnims.push({ id, from: cur, to: next, t: 0 });
    this.store.set(id, next);
  }

  private applyWheel(which: "pitch" | "mod", v: number): void {
    this.model.setWheel(which, v);
    const eng = this.getEngine();
    if (which === "pitch") eng?.setPitchBend(v * 240);
    else eng?.setModWheel(v);
  }

  // ---------- 帧更新:开关翻转动画 + 音高轮弹簧 ----------
  update(dt: number): void {
    if (this.switchAnims.length) {
      const speed = this.reducedMotion ? 8 : 12.5; // ≈80ms
      this.switchAnims = this.switchAnims.filter((a) => {
        a.t = Math.min(1, a.t + dt * speed);
        const v = this.model.controls.get(a.id);
        if (v) setPoseLerp(v, a.from, a.to, a.t);
        return a.t < 1;
      });
    }
    if (this.wheelSpring) {
      const s = this.wheelSpring;
      s.t = Math.min(1, s.t + dt / 0.18);
      const k = 1 - Math.pow(1 - s.t, 3);
      const v = s.from * (1 - k);
      this.model.setWheel("pitch", v);
      this.getEngine()?.setPitchBend(v * 240);
      if (s.t >= 1) this.wheelSpring = null;
    }
  }
}

function setPoseLerp(v: ControlVisual, from: number, to: number, t: number): void {
  if (!v.rocker) return;
  const a0 = from >= 0.5 ? -0.42 : 0.42;
  const a1 = to >= 0.5 ? -0.42 : 0.42;
  const a = a0 + (a1 - a0) * t;
  if (v.kind === "switch-v") v.rocker.rotation.x = a;
  else v.rocker.rotation.z = a;
}

export interface TooltipHandle {
  showAt(x: number, y: number, text: string): void;
  hide(): void;
}
