/**
 * Raycast picking (PRD 5.5: "所有 3D 控件交互基于 raycast 命中").
 *
 * The picker owns the set of things a pointer can address and resolves a screen
 * position into a single hit with a *kind*, so the gesture machine can decide
 * precedence without knowing anything about the scene graph. Control hits come
 * back first because that is what makes PRD VIEW-4 work: a press on a knob must
 * never be stolen by the camera orbit.
 */

import * as THREE from 'three';

export type HitKind = 'control' | 'key' | 'panel-edge';

export interface PickHit {
  readonly kind: HitKind;
  /** Present for `control` hits. */
  readonly controlId: string | null;
  /** Present for `key` hits. */
  readonly midi: number | null;
  readonly point: THREE.Vector3;
  readonly distance: number;
}

export interface PickerSource {
  readonly controlTargets: readonly { object: THREE.Object3D; controlId: string }[];
  readonly keyTargets: readonly THREE.Object3D[];
  midiForHit(object: THREE.Object3D, instanceId: number | undefined): number | null;
  /** Invisible strip along the panel's front edge (PRD HINGE-3). */
  readonly panelEdge: THREE.Object3D | null;
}

export class Picker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly hits: THREE.Intersection[] = [];

  constructor(
    private readonly camera: THREE.Camera,
    private readonly source: PickerSource,
  ) {}

  /** Resolve client coordinates (CSS pixels) to a scene hit, or null. */
  pick(clientX: number, clientY: number, rect: DOMRect): PickHit | null {
    if (rect.width === 0 || rect.height === 0) return null;
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    return this.pickNdc(this.ndc);
  }

  /**
   * Same, from already-normalised device coordinates — used by the keyboard
   * driver and by tests.
   */
  pickNdc(ndc: THREE.Vector2): PickHit | null {
    this.raycaster.setFromCamera(ndc, this.camera);

    const objects: THREE.Object3D[] = [];
    for (const target of this.source.controlTargets) objects.push(target.object);
    for (const target of this.source.keyTargets) objects.push(target);
    if (this.source.panelEdge) objects.push(this.source.panelEdge);

    this.hits.length = 0;
    this.raycaster.intersectObjects(objects, false, this.hits);
    if (this.hits.length === 0) return null;

    // The list is sorted by distance; the nearest recognised target wins.
    for (const hit of this.hits) {
      const controlId = this.controlIdFor(hit.object);
      if (controlId) {
        return {
          kind: 'control',
          controlId,
          midi: null,
          point: hit.point.clone(),
          distance: hit.distance,
        };
      }

      const midi = this.source.midiForHit(hit.object, hit.instanceId);
      if (midi !== null) {
        return {
          kind: 'key',
          controlId: null,
          midi,
          point: hit.point.clone(),
          distance: hit.distance,
        };
      }

      if (hit.object === this.source.panelEdge) {
        return {
          kind: 'panel-edge',
          controlId: null,
          midi: null,
          point: hit.point.clone(),
          distance: hit.distance,
        };
      }
    }
    return null;
  }

  private controlIdFor(object: THREE.Object3D): string | null {
    for (const target of this.source.controlTargets) {
      if (target.object === object) return target.controlId;
    }
    return null;
  }
}
