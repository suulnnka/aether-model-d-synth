/**
 * Pointer gesture state machine (PRD 5.5, INT-1..INT-12).
 *
 * One pointer, one gesture at a time, decided on pointer-down by what was hit:
 *
 *   knob      vertical drag, Shift = fine, double click = reset, wheel = trim
 *   selector  click cycles; dragging around the arc steps through detents
 *   switch    click toggles (a drag away cancels)
 *   key       press to sound; dragging across keys glissandos
 *   wheel     vertical drag; the pitch wheel springs back on release
 *   panel     drag the front edge to set the hinge angle
 *   otherwise camera orbit / pan
 *
 * Precedence (PRD VIEW-4): anything the raycast recognises claims the pointer,
 * and while it is claimed the camera never moves. The canvas gets pointer
 * capture so a drag that leaves the element still ends cleanly (PRD INT-10).
 */

import * as THREE from 'three';
import { DIAL_SPAN_DEG, HINGE_MAX_DEG, HINGE_MIN_DEG } from '../model/layout.ts';
import type { ControlView } from '../model/controls.ts';
import type { KeyboardParts } from '../model/keyboard.ts';
import { toValue } from '../state/range.ts';
import type { CameraRig } from '../scene/cameraRig.ts';
import {
  KNOB_GESTURE,
  SELECTOR_GESTURE,
  SWITCH_GESTURE,
  knobText,
  spec,
  type SelectorSpec,
} from '../state/specs.ts';
import type { ParamStore } from '../state/ParamStore.ts';
import type { Picker } from './picker.ts';

/** Everything the gesture layer needs from the outside world. */
export interface NoteSink {
  noteOn(midi: number): void;
  noteOff(midi: number): void;
  panic(): void;
}

export interface HingeSink {
  get(): number;
  set(deg: number): void;
}

export interface HoverInfo {
  readonly controlId: string;
  readonly text: string;
  readonly value: string;
  readonly hint: string;
}

export interface InteractionEvents {
  /**
   * Hover changed. `hover` is null when the pointer left every control; the
   * coordinates are CSS pixels so the tooltip can be positioned without the
   * overlay needing its own pointer listener.
   */
  onHover(hover: HoverInfo | null, clientX: number, clientY: number): void;
  onActivity(): void;
  /** Panel angle changed by dragging, so the UI can show a readout. */
  onPanelAngle(deg: number, clientX: number, clientY: number): void;
}

/** Vertical pixels for a knob's full travel. */
const KNOB_TRAVEL_PX = 210;
const FINE_FACTOR = 0.1;
const WHEEL_TRAVEL_PX = 150;
/** Degrees of panel rotation per pixel of vertical drag (PRD HINGE-3). */
const HINGE_DEG_PER_PX = 0.28;
/** Movement under which a press counts as a click rather than a drag. */
const CLICK_SLOP_PX = 5;
/** Wheel trim per notch when the pointer is over a knob. */
const KNOB_WHEEL_STEP = 0.008;
/** Spring constants for the pitch wheel's return to centre. */
const SPRING_STIFFNESS = 260;
const SPRING_DAMPING = 26;

const WHEEL_CONTROL_IDS = new Set(['pitchWheel', 'modWheel']);

type Gesture =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'camera-orbit';
      readonly pointerId: number;
      lastX: number;
      lastY: number;
      lastTime: number;
    }
  | {
      readonly kind: 'camera-pan';
      readonly pointerId: number;
      lastX: number;
      lastY: number;
    }
  | {
      readonly kind: 'knob';
      readonly pointerId: number;
      readonly id: string;
      readonly startY: number;
      readonly startPos: number;
      moved: boolean;
    }
  | {
      readonly kind: 'selector';
      readonly pointerId: number;
      readonly id: string;
      readonly startIndex: number;
      readonly centre: THREE.Vector2;
      lastAngle: number;
      accumulated: number;
      moved: boolean;
    }
  | {
      readonly kind: 'switch';
      readonly pointerId: number;
      readonly id: string;
      readonly startX: number;
      readonly startY: number;
      moved: boolean;
    }
  | { readonly kind: 'key'; readonly pointerId: number; midi: number | null }
  | {
      readonly kind: 'wheel';
      readonly pointerId: number;
      readonly id: string;
      readonly spring: boolean;
      readonly startY: number;
      readonly startPos: number;
    }
  | {
      readonly kind: 'panel';
      readonly pointerId: number;
      readonly startY: number;
      readonly startAngle: number;
      moved: boolean;
    };

export interface PointerDeps {
  readonly canvas: HTMLCanvasElement;
  readonly camera: THREE.Camera;
  readonly picker: Picker;
  readonly store: ParamStore;
  readonly views: ReadonlyMap<string, ControlView>;
  readonly keyboard: KeyboardParts;
  readonly keyOutline: THREE.Mesh;
  readonly rig: CameraRig;
  readonly notes: NoteSink;
  readonly hinge: HingeSink;
  readonly events: InteractionEvents;
}

export class PointerController {
  private gesture: Gesture = { kind: 'none' };
  private hoverId: string | null = null;

  // Pitch-wheel spring state (PRD INT-5: a released wheel centres itself).
  private springActive = false;
  private springPos = 0.5;
  private springVel = 0;

  private readonly projection = new THREE.Vector3();
  private readonly worldScratch = new THREE.Vector3();
  private readonly disposers: (() => void)[] = [];

  constructor(private readonly deps: PointerDeps) {
    this.bind();
  }

  /* ==================================================================== */
  /* Frame update                                                          */
  /* ==================================================================== */

  /**
   * Runs the pitch-wheel spring. The spring writes the *stored value*, so the
   * audio parameter and the 3D pose return to centre together.
   */
  update(dt: number): void {
    if (!this.springActive) return;
    this.springVel += (0.5 - this.springPos) * SPRING_STIFFNESS * dt;
    this.springVel -= this.springVel * Math.min(1, SPRING_DAMPING * dt);
    this.springPos += this.springVel * dt;
    if (Math.abs(0.5 - this.springPos) < 1e-3 && Math.abs(this.springVel) < 1e-2) {
      this.springPos = 0.5;
      this.springVel = 0;
      this.springActive = false;
    }
    this.deps.store.setPos('pitchWheel', this.springPos);
  }

  /** True while a panel control — not the camera — owns the pointer. */
  get isEngaged(): boolean {
    return this.gesture.kind !== 'none' && this.gesture.kind !== 'camera-orbit';
  }

  /** True while any gesture at all is in flight. */
  get isDragging(): boolean {
    return this.gesture.kind !== 'none';
  }

  /** Cancel everything and release any sounding key. */
  cancel(): void {
    const gesture = this.gesture;
    if (gesture.kind === 'key' && gesture.midi !== null) {
      this.deps.keyboard.setPressed(gesture.midi, false);
      this.deps.notes.noteOff(gesture.midi);
    }
    if (gesture.kind === 'camera-orbit') this.deps.rig.endOrbit();
    this.gesture = { kind: 'none' };
    this.deps.keyboard.showOutline(null, this.deps.keyOutline);
  }

  dispose(): void {
    for (const off of this.disposers) off();
    this.disposers.length = 0;
  }

  /* ==================================================================== */
  /* Wiring                                                                */
  /* ==================================================================== */

  private bind(): void {
    const el = this.deps.canvas;
    const add = (
      type: string,
      fn: (event: Event) => void,
      options?: AddEventListenerOptions,
    ): void => {
      el.addEventListener(type, fn, options);
      this.disposers.push(() => el.removeEventListener(type, fn));
    };

    add('pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    add('pointermove', (e) => this.onPointerMove(e as PointerEvent));
    add('pointerup', (e) => this.onPointerUp(e as PointerEvent));
    add('pointercancel', (e) => this.onPointerUp(e as PointerEvent));
    add('pointerleave', () => this.clearHover());
    add('dblclick', (e) => this.onDoubleClick(e as MouseEvent));
    // PRD INT-10: the canvas owns these gestures.
    add('contextmenu', (e) => e.preventDefault());
    add('wheel', (e) => this.onWheel(e as WheelEvent), { passive: false });
  }

  private rect(): DOMRect {
    return this.deps.canvas.getBoundingClientRect();
  }

  /* ==================================================================== */
  /* Pointer down                                                          */
  /* ==================================================================== */

  private onPointerDown(event: PointerEvent): void {
    this.deps.events.onActivity();

    if (event.button === 2 || event.button === 1) {
      this.gesture = {
        kind: 'camera-pan',
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      this.capture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;

    const hit = this.deps.picker.pick(event.clientX, event.clientY, this.rect());

    if (!hit) {
      this.gesture = {
        kind: 'camera-orbit',
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: event.timeStamp,
      };
      this.deps.rig.beginOrbit();
      this.capture(event.pointerId);
      return;
    }

    if (hit.kind === 'key' && hit.midi !== null) {
      this.gesture = { kind: 'key', pointerId: event.pointerId, midi: hit.midi };
      this.press(hit.midi);
      this.capture(event.pointerId);
      return;
    }

    if (hit.kind === 'panel-edge') {
      this.gesture = {
        kind: 'panel',
        pointerId: event.pointerId,
        startY: event.clientY,
        startAngle: this.deps.hinge.get(),
        moved: false,
      };
      this.capture(event.pointerId);
      return;
    }

    const id = hit.controlId;
    if (!id) return;
    const control = spec(id);

    if (WHEEL_CONTROL_IDS.has(id)) {
      this.springActive = false;
      this.gesture = {
        kind: 'wheel',
        pointerId: event.pointerId,
        id,
        spring: id === 'pitchWheel',
        startY: event.clientY,
        startPos: this.deps.store.pos(id),
      };
      this.capture(event.pointerId);
      return;
    }

    if (control.kind === 'knob') {
      this.gesture = {
        kind: 'knob',
        pointerId: event.pointerId,
        id,
        startY: event.clientY,
        startPos: this.deps.store.pos(id),
        moved: false,
      };
      this.capture(event.pointerId);
      return;
    }

    if (control.kind === 'selector') {
      const centre = this.projectControlCentre(id);
      this.gesture = {
        kind: 'selector',
        pointerId: event.pointerId,
        id,
        startIndex: Math.max(0, this.deps.store.index(id)),
        centre,
        lastAngle: Math.atan2(event.clientY - centre.y, event.clientX - centre.x),
        accumulated: 0,
        moved: false,
      };
      this.capture(event.pointerId);
      return;
    }

    if (control.kind === 'switch') {
      this.gesture = {
        kind: 'switch',
        pointerId: event.pointerId,
        id,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      this.capture(event.pointerId);
    }
  }

  /* ==================================================================== */
  /* Pointer move                                                          */
  /* ==================================================================== */

  private onPointerMove(event: PointerEvent): void {
    const gesture = this.gesture;

    switch (gesture.kind) {
      case 'none':
        this.updateHover(event);
        return;

      case 'camera-orbit': {
        const dt = Math.max(1, event.timeStamp - gesture.lastTime) / 1000;
        this.deps.rig.orbitBy(
          event.clientX - gesture.lastX,
          event.clientY - gesture.lastY,
          dt,
        );
        gesture.lastX = event.clientX;
        gesture.lastY = event.clientY;
        gesture.lastTime = event.timeStamp;
        this.deps.events.onActivity();
        return;
      }

      case 'camera-pan':
        this.deps.rig.panBy(
          event.clientX - gesture.lastX,
          event.clientY - gesture.lastY,
        );
        gesture.lastX = event.clientX;
        gesture.lastY = event.clientY;
        this.deps.events.onActivity();
        return;

      case 'knob': {
        const dy = gesture.startY - event.clientY;
        const factor = event.shiftKey ? FINE_FACTOR : 1;
        this.deps.store.setPos(
          gesture.id,
          gesture.startPos + (dy / KNOB_TRAVEL_PX) * factor,
        );
        if (Math.abs(dy) > CLICK_SLOP_PX) gesture.moved = true;
        this.emitTooltip(gesture.id, event.clientX, event.clientY);
        return;
      }

      case 'selector': {
        const angle = Math.atan2(
          event.clientY - gesture.centre.y,
          event.clientX - gesture.centre.x,
        );
        let delta = angle - gesture.lastAngle;
        // Unwrap so crossing the -pi/pi seam does not fire a spurious step.
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        gesture.lastAngle = angle;
        gesture.accumulated += delta;

        const selector = spec(gesture.id) as SelectorSpec;
        const detents = Math.max(1, selector.options.length - 1);
        const stepAngle = (DIAL_SPAN_DEG * Math.PI) / 180 / detents;
        const steps = Math.round(gesture.accumulated / stepAngle);
        if (steps !== 0) {
          gesture.moved = true;
          this.deps.store.setOptionIndex(
            gesture.id,
            Math.min(detents, Math.max(0, gesture.startIndex + steps)),
          );
        }
        this.emitTooltip(gesture.id, event.clientX, event.clientY);
        return;
      }

      case 'switch':
        if (
          Math.abs(event.clientX - gesture.startX) > CLICK_SLOP_PX ||
          Math.abs(event.clientY - gesture.startY) > CLICK_SLOP_PX
        ) {
          gesture.moved = true;
        }
        return;

      case 'key': {
        // Glissando: sliding across the keyboard retriggers (PRD INT-4).
        const hit = this.deps.picker.pick(event.clientX, event.clientY, this.rect());
        const nextMidi = hit?.kind === 'key' ? hit.midi : null;
        if (nextMidi !== gesture.midi) {
          if (gesture.midi !== null) this.release(gesture.midi);
          gesture.midi = nextMidi;
          if (nextMidi !== null) this.press(nextMidi);
        }
        return;
      }

      case 'wheel':
        this.deps.store.setPos(
          gesture.id,
          gesture.startPos + (gesture.startY - event.clientY) / WHEEL_TRAVEL_PX,
        );
        this.emitTooltip(gesture.id, event.clientX, event.clientY);
        return;

      case 'panel': {
        const next =
          gesture.startAngle + (gesture.startY - event.clientY) * HINGE_DEG_PER_PX;
        const clamped = Math.min(HINGE_MAX_DEG, Math.max(HINGE_MIN_DEG, next));
        this.deps.hinge.set(clamped);
        gesture.moved = true;
        this.deps.events.onPanelAngle(clamped, event.clientX, event.clientY);
        return;
      }

      default:
        return;
    }
  }

  /* ==================================================================== */
  /* Pointer up                                                            */
  /* ==================================================================== */

  private onPointerUp(event: PointerEvent): void {
    const gesture = this.gesture;
    this.gesture = { kind: 'none' };
    this.releaseCapture(event.pointerId);

    switch (gesture.kind) {
      case 'camera-orbit':
        this.deps.rig.endOrbit();
        break;

      case 'switch':
        // A drag cancels the toggle, so a mis-press while aiming cannot flip it.
        if (!gesture.moved) this.deps.store.toggle(gesture.id);
        break;

      case 'selector':
        // A press that never moved is a click: step one detent (PRD INT-2).
        if (!gesture.moved) this.deps.store.cycleOption(gesture.id, 1);
        break;

      case 'key':
        if (gesture.midi !== null) this.release(gesture.midi);
        break;

      case 'wheel':
        if (gesture.spring) {
          this.springPos = this.deps.store.pos(gesture.id);
          this.springVel = 0;
          this.springActive = true;
        }
        break;

      case 'panel':
        this.deps.events.onPanelAngle(
          this.deps.hinge.get(),
          event.clientX,
          event.clientY,
        );
        break;

      default:
        break;
    }
  }

  /* ==================================================================== */
  /* Wheel, hover, double click                                            */
  /* ==================================================================== */

  private onWheel(event: WheelEvent): void {
    this.deps.events.onActivity();
    const hit = this.deps.picker.pick(event.clientX, event.clientY, this.rect());

    if (hit?.kind === 'control' && hit.controlId) {
      const control = spec(hit.controlId);
      // PRD INT-1: the wheel trims a knob when the pointer is over one.
      if (control.kind === 'knob') {
        event.preventDefault();
        const dir = event.deltaY > 0 ? -1 : 1;
        this.deps.store.nudge(
          hit.controlId,
          dir * KNOB_WHEEL_STEP * (event.shiftKey ? FINE_FACTOR : 1),
        );
        this.emitTooltip(hit.controlId, event.clientX, event.clientY);
        return;
      }
      if (control.kind === 'selector') {
        event.preventDefault();
        this.deps.store.cycleOption(hit.controlId, event.deltaY > 0 ? -1 : 1);
        this.emitTooltip(hit.controlId, event.clientX, event.clientY);
        return;
      }
    }

    // Otherwise the wheel belongs to the camera (PRD VIEW-2).
    event.preventDefault();
    this.deps.rig.dolly(this.deps.rig.wheelZoomFactor(event.deltaY));
  }

  private onDoubleClick(event: MouseEvent): void {
    const hit = this.deps.picker.pick(event.clientX, event.clientY, this.rect());
    if (hit?.kind !== 'control' || !hit.controlId) return;
    const control = spec(hit.controlId);
    // PRD INT-1: double click restores the factory value.
    switch (control.kind) {
      case 'selector':
        this.deps.store.setOptionIndex(hit.controlId, control.defaultIndex);
        break;
      case 'switch':
        this.deps.store.set(hit.controlId, control.default);
        break;
      default:
        this.deps.store.resetToDefault(hit.controlId);
        break;
    }
    this.emitTooltip(hit.controlId, event.clientX, event.clientY);
  }

  private updateHover(event: PointerEvent): void {
    const hit = this.deps.picker.pick(event.clientX, event.clientY, this.rect());

    if (hit?.kind === 'key' && hit.midi !== null) {
      this.setHover(null);
      this.deps.keyboard.showOutline(hit.midi, this.deps.keyOutline);
      this.deps.events.onHover(null, event.clientX, event.clientY);
      this.deps.canvas.style.cursor = 'pointer';
      return;
    }
    this.deps.keyboard.showOutline(null, this.deps.keyOutline);

    if (hit?.kind === 'control' && hit.controlId) {
      this.emitTooltip(hit.controlId, event.clientX, event.clientY);
      this.deps.canvas.style.cursor = controlCursor(hit.controlId);
      return;
    }

    this.setHover(null);
    this.deps.events.onHover(null, event.clientX, event.clientY);
    this.deps.canvas.style.cursor =
      hit?.kind === 'panel-edge' ? 'ns-resize' : 'grab';
  }

  private clearHover(): void {
    this.setHover(null);
    this.deps.keyboard.showOutline(null, this.deps.keyOutline);
    this.deps.events.onHover(null, 0, 0);
  }

  private setHover(id: string | null): void {
    if (id === this.hoverId) return;
    if (this.hoverId) this.deps.views.get(this.hoverId)?.setHover(false);
    this.hoverId = id;
    if (id) this.deps.views.get(id)?.setHover(true);
  }

  private emitTooltip(id: string, clientX: number, clientY: number): void {
    const control = spec(id);
    let value: string;
    let secondary: string | undefined;

    switch (control.kind) {
      case 'knob': {
        const pos = this.deps.store.pos(id);
        value = knobText(id, pos);
        secondary = control.secondary?.(toValue(control.range, pos));
        break;
      }
      case 'selector': {
        const index = Math.max(0, this.deps.store.index(id));
        value = control.options[index]?.label ?? '';
        break;
      }
      case 'switch':
        value = this.deps.store.flag(id) ? control.onLabel : control.offLabel;
        break;
      case 'wheel': {
        const pos = this.deps.store.pos(id);
        value = control.text(pos);
        secondary = control.secondary?.(pos);
        break;
      }
      default:
        value = '';
        break;
    }

    this.setHover(id);
    this.deps.events.onHover(
      {
        controlId: id,
        text: control.name,
        value: secondary ? `${value} · ${secondary}` : value,
        hint: gestureHint(id),
      },
      clientX,
      clientY,
    );
  }

  /* ==================================================================== */
  /* Helpers                                                               */
  /* ==================================================================== */

  private press(midi: number): void {
    this.deps.keyboard.setPressed(midi, true);
    this.deps.notes.noteOn(midi);
  }

  private release(midi: number): void {
    this.deps.keyboard.setPressed(midi, false);
    this.deps.notes.noteOff(midi);
  }

  /** Project a control's origin to CSS pixels, for the selector's arc maths. */
  private projectControlCentre(id: string): THREE.Vector2 {
    const view = this.deps.views.get(id);
    const rect = this.rect();
    if (!view) {
      return new THREE.Vector2(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    view.root.getWorldPosition(this.worldScratch);
    this.projection.copy(this.worldScratch).project(this.deps.camera);
    return new THREE.Vector2(
      rect.left + ((this.projection.x + 1) / 2) * rect.width,
      rect.top + ((1 - this.projection.y) / 2) * rect.height,
    );
  }

  private capture(pointerId: number): void {
    try {
      this.deps.canvas.setPointerCapture(pointerId);
    } catch {
      /* not capturable — the gesture still works without capture */
    }
  }

  private releaseCapture(pointerId: number): void {
    try {
      if (this.deps.canvas.hasPointerCapture(pointerId)) {
        this.deps.canvas.releasePointerCapture(pointerId);
      }
    } catch {
      /* nothing to release */
    }
  }
}

function controlCursor(id: string): string {
  const control = spec(id);
  return control.kind === 'knob' || control.kind === 'wheel'
    ? 'ns-resize'
    : 'pointer';
}

function gestureHint(id: string): string {
  switch (spec(id).kind) {
    case 'knob':
      return KNOB_GESTURE;
    case 'selector':
      return SELECTOR_GESTURE;
    case 'switch':
      return SWITCH_GESTURE;
    case 'wheel':
      return '垂直拖动 · 松手回中';
    default:
      return '';
  }
}
