/**
 * 交互系统(PRD §9):raycast 命中 + 指针手势状态机。
 * 控件命中优先于相机手势;左键永远不旋转相机;相机操作仅右键旋转 /
 * 中键或 Shift+右键平移 / 滚轮缩放。含 hover 高亮 + tooltip(INT-7)。
 */
import * as THREE from "three";
import type { Stage } from "../scene/stage";
import type { CameraRig } from "../scene/cameraRig";
import type { HingeController } from "../scene/hinge";
import type { SynthModel } from "../model/synth";
import type { ParamStore, Spec } from "../state/paramStore";
import { WAVE_LABEL } from "../state/paramStore";
import type { SynthEngine } from "../audio/engine";

interface PickHit {
  kind: "knob" | "selector" | "switch" | "button" | "wheel";
  paramId: string;
  handle?: import("../model/controls").ControlHandle;
}

type DragState =
  | { type: "none" }
  | { type: "camera-rotate"; lastX: number; lastY: number }
  | { type: "camera-pan"; lastX: number; lastY: number }
  | { type: "knob"; pick: PickHit; spec: Spec; startY: number; startVal: number }
  | { type: "selector"; pick: PickHit; spec: Spec; startX: number; lastStep: number }
  | { type: "wheel"; pick: PickHit; spec: Spec; startY: number; startVal: number }
  | {
      type: "key";
      pointerId: number;
      midi: number;
    }
  | { type: "panel"; startY: number; startAngle: number };

export class Interactions {
  private stage: Stage;
  private rig: CameraRig;
  private hinge: HingeController;
  private model: SynthModel;
  private store: ParamStore;
  private engine: SynthEngine;
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private drag: DragState = { type: "none" };
  private hoverPick: PickHit | null = null;
  private tooltip: HTMLDivElement;
  /** 多点触控:每个指针的琴键 */
  private pointerKeys = new Map<number, number>();

  constructor(
    stage: Stage,
    rig: CameraRig,
    hinge: HingeController,
    model: SynthModel,
    store: ParamStore,
    engine: SynthEngine,
  ) {
    this.stage = stage;
    this.rig = rig;
    this.hinge = hinge;
    this.model = model;
    this.store = store;
    this.engine = engine;

    this.tooltip = document.createElement("div");
    this.tooltip.className = "tooltip";
    this.tooltip.style.display = "none";
    document.body.appendChild(this.tooltip);

    const dom = stage.renderer.domElement;
    dom.style.touchAction = "none";
    dom.addEventListener("contextmenu", (e) => e.preventDefault()); // INT-11
    dom.addEventListener("pointerdown", this.onPointerDown);
    dom.addEventListener("pointermove", this.onPointerMove);
    dom.addEventListener("pointerup", this.onPointerUp);
    dom.addEventListener("pointercancel", this.onPointerUp);
    dom.addEventListener("wheel", this.onWheel, { passive: false });
    dom.addEventListener("dblclick", this.onDoubleClick);
  }

  /* ===================== 拾取 ===================== */

  private updateNdc(e: PointerEvent | WheelEvent | MouseEvent): void {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycastControls(): { pick: PickHit | null; keyMidi: number | null; lip: boolean } {
    this.raycaster.setFromCamera(this.pointerNdc, this.stage.camera);
    const root = this.model.root;
    const hits = this.raycaster.intersectObject(root, true);
    for (const hit of hits) {
      // 沿父链找 pick 标记
      let o: THREE.Object3D | null = hit.object;
      while (o && o !== root) {
        const pick = o.userData.pick as PickHit | undefined;
        if (pick) {
          const handle = this.model.handles.get(pick.paramId);
          return { pick: { ...pick, handle }, keyMidi: null, lip: false };
        }
        if (o.userData.pickKeys) {
          const kb = o.userData.pickKeys as import("../model/keys").KeyboardModel;
          const k = kb.keyByInstance(hit.object as THREE.InstancedMesh, hit.instanceId!);
          if (k) return { pick: null, keyMidi: k.midi, lip: false };
        }
        if (o.userData.panelLip) {
          return { pick: null, keyMidi: null, lip: true };
        }
        o = o.parent;
      }
    }
    return { pick: null, keyMidi: null, lip: false };
  }

  /* ===================== 指针事件 ===================== */

  private onPointerDown = (e: PointerEvent): void => {
    const dom = this.stage.renderer.domElement;
    dom.setPointerCapture(e.pointerId); // INT-11
    this.updateNdc(e);
    const { pick, keyMidi, lip } = this.raycastControls();
    const powered = this.store.bool("power");

    if (e.button === 0) {
      if (pick && (powered || pick.paramId === "power")) {
        switch (pick.kind) {
          case "knob":
            this.drag = {
              type: "knob",
              pick,
              spec: this.store.spec(pick.paramId),
              startY: e.clientY,
              startVal: this.store.num(pick.paramId),
            };
            return;
          case "selector":
            this.drag = {
              type: "selector",
              pick,
              spec: this.store.spec(pick.paramId),
              startX: e.clientX,
              lastStep: 0,
            };
            return;
          case "wheel":
            this.drag = {
              type: "wheel",
              pick,
              spec: this.store.spec(pick.paramId),
              startY: e.clientY,
              startVal: this.store.num(pick.paramId),
            };
            return;
          case "switch":
          case "button":
            // pointerup 时在同一控件上才触发
            this.drag = { type: "none" };
            (this.drag as { pendingSwitch?: PickHit }).pendingSwitch = pick;
            return;
        }
      }
      if (keyMidi !== null) {
        this.pressKey(e.pointerId, keyMidi);
        this.drag = { type: "key", pointerId: e.pointerId, midi: keyMidi };
        return;
      }
      if (lip && this.rig.mode === "3d") {
        this.drag = {
          type: "panel",
          startY: e.clientY,
          startAngle: this.hinge.current,
        };
        return;
      }
      // 左键未命中控件:不产生任何视角运动(§9)
      this.drag = { type: "none" };
      return;
    }

    if (e.button === 2) {
      if (e.shiftKey) {
        this.drag = { type: "camera-pan", lastX: e.clientX, lastY: e.clientY };
      } else {
        this.drag = { type: "camera-rotate", lastX: e.clientX, lastY: e.clientY };
      }
      return;
    }

    if (e.button === 1) {
      e.preventDefault();
      this.drag = { type: "camera-pan", lastX: e.clientX, lastY: e.clientY };
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.updateNdc(e);
    switch (this.drag.type) {
      case "camera-rotate": {
        this.rig.rotate(e.clientX - this.drag.lastX, e.clientY - this.drag.lastY);
        this.drag.lastX = e.clientX;
        this.drag.lastY = e.clientY;
        return;
      }
      case "camera-pan": {
        this.rig.pan(e.clientX - this.drag.lastX, e.clientY - this.drag.lastY);
        this.drag.lastX = e.clientX;
        this.drag.lastY = e.clientY;
        return;
      }
      case "knob": {
        const { spec } = this.drag;
        const range = spec.max! - spec.min!;
        const scale = e.shiftKey ? 0.1 : 1; // Shift 精调(INT-1)
        const dv = (-(e.clientY - this.drag.startY) / 160) * range * scale;
        this.store.set(this.drag.pick.paramId, this.drag.startVal + dv);
        this.showTooltipFor(this.drag.pick, e.clientX, e.clientY);
        return;
      }
      case "selector": {
        const dx = e.clientX - this.drag.startX;
        const step = Math.round(dx / 26); // 圆弧方向近似:左右拖动换档(INT-2)
        if (step !== this.drag.lastStep) {
          this.cycleSelector(this.drag.pick, this.drag.spec, step - this.drag.lastStep);
          this.drag.lastStep = step;
          this.showTooltipFor(this.drag.pick, e.clientX, e.clientY);
        }
        return;
      }
      case "wheel": {
        const { spec } = this.drag;
        const range = spec.max! - spec.min!;
        const dv = (-(e.clientY - this.drag.startY) / 90) * range;
        this.store.set(this.drag.pick.paramId, this.drag.startVal + dv);
        this.showTooltipFor(this.drag.pick, e.clientX, e.clientY);
        return;
      }
      case "key": {
        // 滑奏 glissando(INT-4)
        const { keyMidi } = this.raycastControls();
        if (keyMidi !== null && keyMidi !== this.drag.midi) {
          this.engine.noteOff(this.drag.midi);
          this.pressKey(this.drag.pointerId, keyMidi);
          this.drag.midi = keyMidi;
        }
        return;
      }
      case "panel": {
        const dy = e.clientY - this.drag.startY;
        this.hinge.dragTo(this.drag.startAngle - dy * 0.35); // 上拖 = 立起
        return;
      }
      default:
        break;
    }
    // 悬停(未拖拽时)
    if (this.drag.type === "none" || (this.drag as { pendingSwitch?: unknown }).pendingSwitch) {
      this.updateHover(e.clientX, e.clientY);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const pending = (this.drag as { pendingSwitch?: PickHit }).pendingSwitch;
    if (pending) {
      this.updateNdc(e);
      const { pick } = this.raycastControls();
      if (pick && pick.paramId === pending.paramId) {
        if (this.store.bool("power") || pick.paramId === "power") {
          this.store.set(pick.paramId, !this.store.bool(pick.paramId));
        }
      }
    }
    if (this.drag.type === "selector" && this.drag.lastStep === 0) {
      // 单击(未拖动)循环进档(INT-2)
      this.cycleSelector(this.drag.pick, this.drag.spec, 1);
    }
    if (this.drag.type === "key") {
      this.releaseKey(e.pointerId);
    }
    this.drag = { type: "none" };
    this.updateHover(e.clientX, e.clientY);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.updateNdc(e);
    const { pick } = this.raycastControls();
    if (pick && pick.kind === "knob" && (this.store.bool("power") || pick.paramId === "power")) {
      const spec = this.store.spec(pick.paramId);
      const range = spec.max! - spec.min!;
      const dv = Math.sign(e.deltaY) * range * (e.shiftKey ? 0.01 : 0.04);
      this.store.set(pick.paramId, this.store.num(pick.paramId) - dv);
      this.showTooltipFor(pick, e.clientX, e.clientY);
      return;
    }
    this.rig.wheelGesture(e); // 旋钮之外:触摸板双指滑动=旋转 / 捏合或鼠标滚轮=缩放
  };

  private onDoubleClick = (e: MouseEvent): void => {
    this.updateNdc(e);
    const { pick } = this.raycastControls();
    if (pick && (pick.kind === "knob" || pick.kind === "selector" || pick.kind === "wheel")) {
      const spec = this.store.spec(pick.paramId);
      this.store.set(pick.paramId, spec.def); // 双击恢复默认(INT-1)
    }
  };

  /* ===================== 琴键 ===================== */

  private pressKey(pointerId: number, midi: number): void {
    this.engine.noteOn(midi);
    this.model.keyboard.setPressed(midi, true);
    this.pointerKeys.set(pointerId, midi);
  }

  private releaseKey(pointerId: number): void {
    const midi = this.pointerKeys.get(pointerId);
    if (midi === undefined) return;
    this.pointerKeys.delete(pointerId);
    // 仍被其它指针按住则保持
    let heldElsewhere = false;
    for (const m of this.pointerKeys.values()) {
      if (m === midi) heldElsewhere = true;
    }
    if (!heldElsewhere) {
      this.engine.noteOff(midi);
      this.model.keyboard.setPressed(midi, false);
    }
  }

  /** 电脑键盘触发的外观同步(INT-9) */
  setKeyVisual(midi: number, pressed: boolean): void {
    this.model.keyboard.setPressed(midi, pressed);
  }

  releaseAllKeys(): void {
    for (const [, midi] of this.pointerKeys) {
      this.engine.noteOff(midi);
      this.model.keyboard.setPressed(midi, false);
    }
    this.pointerKeys.clear();
  }

  /* ===================== 档位循环 ===================== */

  private cycleSelector(pick: PickHit, spec: Spec, dir: number): void {
    const steps = spec.steps!;
    const idx = steps.indexOf(this.store.str(pick.paramId));
    const next = ((idx + dir) % steps.length + steps.length) % steps.length;
    this.store.set(pick.paramId, steps[next]);
  }

  /* ===================== 悬停 + tooltip ===================== */

  private updateHover(cx: number, cy: number): void {
    const { pick, keyMidi } = this.raycastControls();
    const dom = this.stage.renderer.domElement;

    if (this.hoverPick?.handle) this.hoverPick.handle.setHover(false);
    this.hoverPick = pick;

    let cursor = "default";
    if (pick) {
      const powered = this.store.bool("power") || pick.paramId === "power";
      cursor = powered
        ? pick.kind === "knob" || pick.kind === "selector" || pick.kind === "wheel"
          ? "ns-resize"
          : "pointer"
        : "not-allowed";
      if (powered) pick.handle?.setHover(true);
      this.showTooltipFor(pick, cx, cy);
    } else if (keyMidi !== null) {
      cursor = "pointer";
      const note = midiName(keyMidi);
      this.tooltip.style.display = "block";
      this.tooltip.innerHTML = `<b>${note}</b><span>琴键 · 单音 last-note priority</span>`;
      this.positionTooltip(cx, cy);
    } else {
      this.tooltip.style.display = "none";
    }
    dom.style.cursor = cursor;
  }

  private showTooltipFor(pick: PickHit, cx: number, cy: number): void {
    const spec = this.store.spec(pick.paramId);
    if (!spec) return;
    const value = this.store.get(pick.paramId);
    let valueText: string;
    if (spec.kind === "selector") {
      const v = String(value);
      valueText = v.startsWith("pulse") || ["triangle", "sawtooth", "rev-saw", "square"].includes(v)
        ? WAVE_LABEL[v] ?? v
        : v;
    } else if (spec.kind === "wheel" || spec.kind === "knob") {
      valueText = spec.fmt ? spec.fmt(Number(value)) : String(Number(value).toFixed(2));
    } else {
      valueText = value ? "ON" : "OFF";
    }
    this.tooltip.style.display = "block";
    this.tooltip.innerHTML = `<b>${spec.label}</b><em>${valueText}</em><span>${spec.tip ?? ""}</span>`;
    this.positionTooltip(cx, cy);
  }

  private positionTooltip(cx: number, cy: number): void {
    const pad = 14;
    const rect = this.tooltip.getBoundingClientRect();
    let x = cx + pad;
    let y = cy + pad;
    if (x + rect.width > window.innerWidth - 8) x = cx - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = cy - rect.height - pad;
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  hideTooltip(): void {
    this.tooltip.style.display = "none";
  }

  dispose(): void {
    const dom = this.stage.renderer.domElement;
    dom.removeEventListener("pointerdown", this.onPointerDown);
    dom.removeEventListener("pointermove", this.onPointerMove);
    dom.removeEventListener("pointerup", this.onPointerUp);
    dom.removeEventListener("pointercancel", this.onPointerUp);
    dom.removeEventListener("wheel", this.onWheel);
    dom.removeEventListener("dblclick", this.onDoubleClick);
    this.tooltip.remove();
  }
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function midiName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
