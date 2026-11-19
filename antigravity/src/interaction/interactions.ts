import * as THREE from "three";
import type { SynthEngine } from "../audio/engine.ts";
import type { SynthModel } from "../model/synth.ts";
import type { CameraRig } from "../scene/cameraRig.ts";
import type { Stage } from "../scene/stage.ts";
import type { ParamStore } from "../state/paramStore.ts";
import { SPEC_BY_ID } from "../state/specs.ts";
import type { ControlId } from "../state/types.ts";

export interface HoverInfo {
  id: ControlId;
  x: number;
  y: number;
}

export interface InteractionCallbacks {
  onFirstGesture?: () => void;
  onHover?: (info: HoverInfo | null) => void;
  onDragChange?: (info: { id: ControlId; value: number; x: number; y: number } | null) => void;
  onControlEdited?: (id: ControlId, value: number) => void;
  onExternalEnabledRequest?: () => Promise<boolean>;
}

export class Interactions {
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private activeControl: {
    id: ControlId;
    startY: number;
    startVal: number;
    moved: boolean;
  } | null = null;
  private activeKeyMidi: number | null = null;
  private hoveredId: ControlId | null = null;

  constructor(
    private readonly stage: Stage,
    private readonly rig: CameraRig,
    private readonly model: SynthModel,
    private readonly store: ParamStore,
    private readonly engine: SynthEngine,
    private readonly cb: InteractionCallbacks = {},
  ) {
    const dom = this.stage.renderer.domElement;
    dom.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    dom.addEventListener("dblclick", this.onDoubleClick);
  }

  private updateNdc(e: PointerEvent | MouseEvent): void {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private pickControl(e: PointerEvent | MouseEvent): ControlId | null {
    this.updateNdc(e);
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    const hits = this.raycaster.intersectObjects(this.model.interactiveMeshes, false);
    if (hits.length === 0) return null;
    const id = hits[0].object.userData.controlId as ControlId | undefined;
    return id ?? null;
  }

  private pickKey(e: PointerEvent | MouseEvent): number | null {
    this.updateNdc(e);
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    const hits = this.raycaster.intersectObjects(this.model.keyMeshes, false);
    if (hits.length === 0) return null;
    const midi = hits[0].object.userData.midi as number | undefined;
    return typeof midi === "number" ? midi : null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.cb.onFirstGesture?.();

    const ctrlId = this.pickControl(e);
    if (ctrlId) {
      this.rig.setOrbitEnabled(false);
      const spec = SPEC_BY_ID[ctrlId];
      if (spec.kind === "switch") {
        const nextVal = this.store.getBool(ctrlId) ? 0 : 1;
        this.applyControlChange(ctrlId, nextVal);
        this.activeControl = null;
        this.rig.setOrbitEnabled(true);
        return;
      }

      this.activeControl = {
        id: ctrlId,
        startY: e.clientY,
        startVal: this.store.get(ctrlId),
        moved: false,
      };
      this.cb.onDragChange?.({
        id: ctrlId,
        value: this.store.get(ctrlId),
        x: e.clientX,
        y: e.clientY,
      });
      return;
    }

    const midi = this.pickKey(e);
    if (midi !== null) {
      this.rig.setOrbitEnabled(false);
      this.triggerKeyDown(midi);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.activeControl) {
      const { id, startY, startVal } = this.activeControl;
      const spec = SPEC_BY_ID[id];
      const dy = startY - e.clientY;
      if (Math.abs(dy) > 3) {
        this.activeControl.moved = true;
      }
      const sensitivity = e.shiftKey ? 560 : 170;
      const span = spec.max - spec.min;
      const raw = startVal + (dy / sensitivity) * span;
      const stepped =
        spec.kind === "step"
          ? Math.round(raw)
          : Math.round(raw / spec.step) * spec.step;
      this.applyControlChange(id, stepped);
      this.cb.onDragChange?.({
        id,
        value: this.store.get(id),
        x: e.clientX,
        y: e.clientY,
      });
      return;
    }

    if (this.activeKeyMidi !== null) {
      const midi = this.pickKey(e);
      if (midi !== null && midi !== this.activeKeyMidi) {
        const prev = this.activeKeyMidi;
        this.triggerKeyDown(midi);
        this.triggerKeyUp(prev);
      }
      return;
    }

    // Idle hover inspection
    const ctrlId = this.pickControl(e);
    const keyMidi = ctrlId ? null : this.pickKey(e);
    const dom = this.stage.renderer.domElement;

    if (ctrlId !== this.hoveredId) {
      this.hoveredId = ctrlId;
      this.model.setHovered(ctrlId);
    }

    if (ctrlId) {
      const spec = SPEC_BY_ID[ctrlId];
      dom.style.cursor = spec.kind === "switch" ? "pointer" : "ns-resize";
      this.cb.onHover?.({ id: ctrlId, x: e.clientX, y: e.clientY });
    } else if (keyMidi !== null) {
      dom.style.cursor = "pointer";
      this.cb.onHover?.(null);
    } else {
      dom.style.cursor = "grab";
      this.cb.onHover?.(null);
    }
  };

  private onPointerUp = (): void => {
    if (this.activeControl) {
      const { id, moved } = this.activeControl;
      const spec = SPEC_BY_ID[id];
      if (!moved && spec.kind === "step") {
        // Click advances step selector cyclically
        const cur = Math.round(this.store.get(id));
        const next = cur >= spec.max ? spec.min : cur + 1;
        this.applyControlChange(id, next);
      }
      if (id === "pitchWheel") {
        // Spring-return pitch bend wheel smoothly back to center (50)
        this.applyControlChange("pitchWheel", 50);
      }
      this.activeControl = null;
      this.cb.onDragChange?.(null);
    }

    if (this.activeKeyMidi !== null) {
      this.triggerKeyUp(this.activeKeyMidi);
      this.activeKeyMidi = null;
    }

    this.rig.setOrbitEnabled(true);
  };

  private onDoubleClick = (e: MouseEvent): void => {
    const ctrlId = this.pickControl(e);
    if (!ctrlId) return;
    const spec = SPEC_BY_ID[ctrlId];
    if (spec.kind === "knob" || spec.kind === "wheel") {
      this.applyControlChange(ctrlId, spec.defaultValue);
    }
  };

  private applyControlChange(id: ControlId, val: number): void {
    const changed = this.store.set(id, val);
    if (id === "extEnabled" && changed) {
      const on = this.store.getBool("extEnabled");
      if (on && this.cb.onExternalEnabledRequest) {
        void this.cb.onExternalEnabledRequest().then((ok) => {
          if (!ok) {
            this.store.set("extEnabled", 0);
          }
        });
      } else if (!on) {
        void this.engine.toggleExternalInput(false);
      }
    }
    this.cb.onControlEdited?.(id, this.store.get(id));
  }

  triggerKeyDown(midi: number): void {
    this.activeKeyMidi = midi;
    this.model.setKeyPressed(midi, true);
    this.engine.noteOn(midi);
  }

  triggerKeyUp(midi: number): void {
    this.model.setKeyPressed(midi, false);
    this.engine.noteOff(midi);
  }

  dispose(): void {
    const dom = this.stage.renderer.domElement;
    dom.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    dom.removeEventListener("dblclick", this.onDoubleClick);
  }
}
