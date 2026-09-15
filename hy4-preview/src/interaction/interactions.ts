/**
 * 交互层(interaction/interactions.ts)
 * ------------------------------------------------------------------
 * raycast + 指针手势状态机(INT-1..13 / VIEW-2 / HINGE-3)。
 * 命中优先级:控件 > 琴键 > 面板(拖拽调角)> 相机手势;
 * **左键永不旋转相机**(VIEW-2):左键未命中任何物体时不做任何事。
 */
import * as THREE from "three";
import type { SceneView } from "../scene/scene";
import type { SynthModel } from "../model/synth";
import { CONTROL_BY_ID, params, type ControlSpec } from "../state/params";
import { engine } from "../audio/engine";
import { DIM } from "../model/layout";

export type HoverInfo = { id: string; x: number; y: number };

export interface InteractionHooks {
  /** 悬停变化(供 tooltip);id 为 null 时隐藏 */
  onHover(info: HoverInfo | null): void;
  /** 任意用户手势(用于首次上电 / 启动音频 / 跳过运镜) */
  onGesture(): void;
  /** 参数被用户改动(供持久化与 UI 回显) */
  onChange(id: string): void;
  /** 外部输入开关打开时请求麦克风授权 */
  onExternalRequest(): void;
  /** 面板角度被拖拽改变(HINGE-3),返回角度(度) */
  onPanelAngle(deg: number): void;
}

export interface Interactions {
  noteOn(midi: number): void;
  noteOff(midi: number): void;
  allNotesOff(): void;
  /** 电源关闭时禁用全部演奏与控件操作(INT-8) */
  setPower(on: boolean): void;
  /** 引导进行中可临时挂起 3D 交互 */
  setSuspended(on: boolean): void;
  dispose(): void;
}

type DragMode =
  | { kind: "none" }
  | { kind: "knob"; id: string; lastY: number }
  | { kind: "selector"; id: string; cx: number; cy: number; acc: number; lastA: number }
  | { kind: "wheel"; id: string; lastY: number }
  | { kind: "key"; midi: number }
  | { kind: "panel"; lastY: number; startAngle: number }
  | { kind: "orbit" }
  | { kind: "pan" };

const FULL_TRAVEL_PX = 190; // 旋钮/滑轮全量程所需拖动像素
const WHEEL_STEP = 0.02; // 滚轮微调步进(归一化量程)
/**
 * 触摸板双指滑动 → 旋转/平移的灵敏度。
 * scene.rotate/pan 的参数单位是「像素」,而 wheel 的 delta 本身就是像素量级,
 * 因此这里只在 1.0 附近微调(略大于 1 让手势更跟手)。
 */
const TRACKPAD_GAIN = 1.35;

/** 控件 id → 参数 id(A-440 按钮与 ON 拨杆共用 tunerOn) */
const paramIdOf = (id: string): string => (id === "tunerButton" ? "tunerOn" : id);

function specOf(id: string): ControlSpec | undefined {
  return CONTROL_BY_ID[paramIdOf(id)];
}

function rangeOf(spec: ControlSpec): { min: number; max: number } {
  const s = spec as { min?: number; max?: number };
  return { min: s.min ?? 0, max: s.max ?? 1 };
}

export function createInteractions(
  scene: SceneView,
  model: SynthModel,
  hooks: InteractionHooks
): Interactions {
  const canvas = scene.canvas;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  let powerOn = true;
  let suspended = false;
  let drag: DragMode = { kind: "none" };
  let activePointer: number | null = null;
  let hoverId: string | null = null;
  let downX = 0;
  let downY = 0;

  const heldKeys = new Set<number>();

  // ── 拾取 ─────────────────────────────────────────────────────────
  type Pick =
    | { type: "control"; id: string }
    | { type: "key"; midi: number }
    | { type: "panel"; v: number }
    | null;

  const setNdc = (ev: PointerEvent | WheelEvent | MouseEvent): void => {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  };

  const pick = (): Pick => {
    raycaster.setFromCamera(ndc, scene.camera);
    // 1) 控件
    const ctlHits = raycaster.intersectObjects(model.pickables, false);
    if (ctlHits.length) {
      const id = ctlHits[0].object.userData.controlId as string | undefined;
      if (id) return { type: "control", id };
    }
    // 2) 琴键
    const keyHits = raycaster.intersectObjects(model.keybed.hits, false);
    if (keyHits.length) {
      const h = keyHits[0];
      const midi = model.keybed.midiOf(h.object, h.instanceId ?? 0);
      if (midi !== null) return { type: "key", midi };
    }
    // 3) 铰链面板(HINGE-3)
    const panelHits = raycaster.intersectObject(model.cabinet.panelFaceMesh, false);
    if (panelHits.length) {
      const local = model.cabinet.panelFaceMesh.worldToLocal(panelHits[0].point.clone());
      return { type: "panel", v: -local.z };
    }
    return null;
  };

  const isInteractive = (id: string): boolean => {
    const ctl = model.controls.get(id);
    return !!ctl && ctl.interactive;
  };

  const kindOf = (id: string): string => model.controls.get(id)?.kind ?? "knob";

  // ── 控件写入 ─────────────────────────────────────────────────────
  /** deltaNorm:归一化量程增量;selector 时按档步进(取符号) */
  const nudge = (id: string, deltaNorm: number): void => {
    const spec = specOf(id);
    if (!spec) return;
    const pid = paramIdOf(id);
    if (spec.kind === "selector") {
      if (deltaNorm === 0) return;
      params.set(pid, params.get(pid) + Math.sign(deltaNorm));
    } else {
      const { min, max } = rangeOf(spec);
      params.set(pid, params.get(pid) + deltaNorm * (max - min));
    }
    hooks.onChange(pid);
  };

  const resetToDefault = (id: string): void => {
    const spec = specOf(id);
    if (!spec) return;
    params.set(paramIdOf(id), spec.def);
    hooks.onChange(paramIdOf(id));
  };

  // ── 指针事件 ─────────────────────────────────────────────────────
  const onPointerDown = (ev: PointerEvent): void => {
    hooks.onGesture();
    if (suspended) return;
    scene.skipIntro();
    downX = ev.clientX;
    downY = ev.clientY;

    // ── 相机手势:右键旋转 / 中键或 Shift+右键平移(VIEW-2)
    if (ev.button === 2) {
      drag = ev.shiftKey ? { kind: "pan" } : { kind: "orbit" };
      beginCapture(ev);
      return;
    }
    if (ev.button === 1) {
      drag = { kind: "pan" };
      beginCapture(ev);
      return;
    }
    if (ev.button !== 0) return;

    const hit = powerOn ? pick() : null;
    if (!hit) return; // 左键未命中:不做任何事(不旋转相机)

    if (hit.type === "control") {
      if (!isInteractive(hit.id)) return;
      const kind = kindOf(hit.id);
      if (kind === "led") return;

      if (kind === "switch" || kind === "rocker" || kind === "button") {
        const pid = paramIdOf(hit.id);
        params.toggle(pid); // INT-3 单击切换
        hooks.onChange(pid);
        if (pid === "externalOn" && params.getBool("externalOn")) hooks.onExternalRequest();
        return;
      }

      beginCapture(ev);
      if (kind === "selector") {
        // INT-2:按下即记录圆心,抬起时若未拖动则单击进一档
        drag = { kind: "selector", id: hit.id, cx: ev.clientX, cy: ev.clientY, acc: 0, lastA: 0 };
      } else if (kind === "wheel") {
        drag = { kind: "wheel", id: hit.id, lastY: ev.clientY };
      } else {
        drag = { kind: "knob", id: hit.id, lastY: ev.clientY };
      }
      return;
    }

    if (hit.type === "key") {
      beginCapture(ev);
      drag = { kind: "key", midi: hit.midi };
      noteOn(hit.midi);
      return;
    }

    if (hit.type === "panel") {
      // 仅前缘区域可拖拽调角,避免误触(HINGE-3)
      if (hit.v > DIM.PANEL_D * 0.55) {
        beginCapture(ev);
        drag = { kind: "panel", lastY: ev.clientY, startAngle: scene.getPanelAngle() };
      }
    }
  };

  const beginCapture = (ev: PointerEvent): void => {
    activePointer = ev.pointerId;
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch {
      /* 某些环境不支持捕获,忽略 */
    }
  };

  const endCapture = (ev: PointerEvent): void => {
    if (activePointer === ev.pointerId) {
      try {
        canvas.releasePointerCapture(ev.pointerId);
      } catch {
        /* noop */
      }
      activePointer = null;
    }
  };

  const onPointerMove = (ev: PointerEvent): void => {
    setNdc(ev);

    if (drag.kind === "orbit" || drag.kind === "pan") {
      const dx = ev.clientX - downX;
      const dy = ev.clientY - downY;
      downX = ev.clientX;
      downY = ev.clientY;
      if (drag.kind === "orbit") scene.rotate(dx, dy);
      else scene.pan(dx, dy);
      return;
    }

    if (drag.kind === "knob" || drag.kind === "wheel") {
      const dy = ev.clientY - drag.lastY;
      drag.lastY = ev.clientY;
      const k = ev.shiftKey ? 0.1 : 1; // INT-1 Shift 精调
      nudge(drag.id, (-dy / FULL_TRAVEL_PX) * k);
      return;
    }

    if (drag.kind === "selector") {
      // INT-2 沿圆弧拖动换档:以按下点为圆心累积角度
      const a = Math.atan2(ev.clientY - drag.cy, ev.clientX - drag.cx);
      let d = a - drag.lastA;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      drag.lastA = a;
      drag.acc += d;
      const spec = specOf(drag.id);
      const n = spec && spec.kind === "selector" ? spec.options.length : 6;
      const step = (Math.PI * 2) / (n * 1.5);
      while (drag.acc > step) {
        drag.acc -= step;
        nudge(drag.id, 1);
      }
      while (drag.acc < -step) {
        drag.acc += step;
        nudge(drag.id, -1);
      }
      return;
    }

    if (drag.kind === "key") {
      // INT-4 滑奏:拖过的相邻琴键依次发声
      const hit = pick();
      if (hit && hit.type === "key" && hit.midi !== drag.midi) {
        noteOff(drag.midi);
        drag = { kind: "key", midi: hit.midi };
        noteOn(hit.midi);
      }
      return;
    }

    if (drag.kind === "panel") {
      const dy = ev.clientY - drag.lastY;
      drag.lastY = ev.clientY;
      scene.setPanelAngle(drag.startAngle + dy * 0.16, false);
      hooks.onPanelAngle(scene.getPanelAngle());
      return;
    }

    // ── 悬停(INT-7)
    if (suspended || !powerOn) {
      setHover(null, ev);
      return;
    }
    const hit = pick();
    if (hit && hit.type === "control") setHover({ id: hit.id, x: ev.clientX, y: ev.clientY }, ev);
    else setHover(null, ev);
  };

  const setHover = (info: HoverInfo | null, ev: PointerEvent): void => {
    const id = info ? info.id : null;
    const active = id && isInteractive(id) ? id : null;
    if (active !== hoverId) {
      hoverId = active;
      model.setHighlight(active);
      canvas.style.cursor = active ? "pointer" : "default";
    }
    hooks.onHover(info ? { id: info.id, x: ev.clientX, y: ev.clientY } : null);
  };

  const onPointerUp = (ev: PointerEvent): void => {
    if (drag.kind === "key") {
      noteOff(drag.midi);
    } else if (drag.kind === "wheel") {
      const spec = specOf(drag.id);
      if (spec && spec.kind === "wheel" && spec.spring) {
        params.set(drag.id, spec.def); // INT-5 弯音轮弹簧回中
        hooks.onChange(drag.id);
      }
    } else if (drag.kind === "selector" && Math.abs(drag.acc) < 0.02) {
      nudge(drag.id, 1); // 单击循环进档(INT-2)
    }
    if (activePointer !== null) endCapture(ev);
    drag = { kind: "none" };
  };

  /**
   * 区分「鼠标滚轮」与「触摸板双指滑动」(VIEW-2 / 触摸板两指拖动旋转):
   *  - deltaMode !== 0(行/页滚动)一定是鼠标滚轮;
   *  - 带横向分量、或增量带小数、或短时间内连续事件流 → 触摸板;
   *  - 增量恰为 100/120 的整数倍且 ≥100 → 典型鼠标滚轮步进。
   */
  const wheelTimes: number[] = [];
  const isTrackpad = (ev: WheelEvent): boolean => {
    if (ev.deltaMode !== 0) return false;
    const now = performance.now();
    while (wheelTimes.length && now - wheelTimes[0] > 350) wheelTimes.shift();
    wheelTimes.push(now);
    if (wheelTimes.length >= 3) return true; // 连续事件流 = 触摸板惯性滚动
    const ax = Math.abs(ev.deltaX);
    const ay = Math.abs(ev.deltaY);
    if (ax > 0.5) return true;
    const m = Math.max(ax, ay);
    if (m === 0) return false;
    if (Number.isInteger(m) && m >= 100 && (m % 100 === 0 || m % 120 === 0)) return false;
    return true;
  };

  const onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    setNdc(ev);

    // 捏合(浏览器以 ctrlKey 标记)= 缩放
    if (ev.ctrlKey) {
      scene.dolly(ev.deltaY);
      return;
    }

    if (powerOn && !suspended) {
      const hit = pick();
      if (hit && hit.type === "control" && isInteractive(hit.id)) {
        const kind = kindOf(hit.id);
        if (kind === "knob" || kind === "selector" || kind === "wheel") {
          // INT-1 滚轮微调(悬停在控件上时优先)
          const dir = ev.deltaY > 0 ? -1 : 1;
          const unit = kind === "selector" ? 1 : WHEEL_STEP * (ev.shiftKey ? 0.1 : 1);
          nudge(hit.id, dir * unit);
          return;
        }
      }
    }

    if (!isTrackpad(ev)) {
      scene.dolly(ev.deltaY); // 鼠标滚轮 = 缩放(VIEW-2)
      return;
    }

    // 触摸板两指滑动:2D 视角锁定旋转,退化为缩放;Shift = 平移
    if (scene.isLocked()) {
      scene.dolly(ev.deltaY);
      return;
    }
    if (ev.shiftKey) scene.pan(ev.deltaX * TRACKPAD_GAIN, -ev.deltaY * TRACKPAD_GAIN);
    else scene.rotate(ev.deltaX * TRACKPAD_GAIN, -ev.deltaY * TRACKPAD_GAIN);
  };

  const onDoubleClick = (ev: MouseEvent): void => {
    if (!powerOn || suspended) return;
    setNdc(ev);
    const hit = pick();
    if (!hit || hit.type !== "control") return;
    const kind = kindOf(hit.id);
    if (kind === "switch" || kind === "rocker" || kind === "button" || kind === "led") return;
    resetToDefault(hit.id); // INT-1 双击恢复默认值
  };

  const onContextMenu = (ev: MouseEvent): void => ev.preventDefault();

  const onPointerLeave = (): void => {
    if (drag.kind === "none") {
      hoverId = null;
      model.setHighlight(null);
      hooks.onHover(null);
    }
  };

  // ── 演奏(鼠标 / QWERTY / MIDI 共用同一通道) ───────────────────────
  function noteOn(midi: number): void {
    if (!powerOn) return;
    if (heldKeys.has(midi)) return;
    heldKeys.add(midi);
    model.keybed.setPressed(midi, true);
    engine.noteOn(midi);
  }

  function noteOff(midi: number): void {
    if (!heldKeys.has(midi)) return;
    heldKeys.delete(midi);
    model.keybed.setPressed(midi, false);
    engine.noteOff(midi);
  }

  function allNotesOff(): void {
    for (const m of [...heldKeys]) noteOff(m);
    heldKeys.clear();
    engine.allNotesOff();
  }

  // INT-10 失焦 / 切标签自动 All Notes Off
  const onBlur = (): void => allNotesOff();
  const onVisibility = (): void => {
    if (document.hidden) allNotesOff();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDoubleClick);
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibility);

  return {
    noteOn,
    noteOff,
    allNotesOff,
    setPower(on) {
      powerOn = on;
      if (!on) {
        allNotesOff();
        drag = { kind: "none" };
        model.setHighlight(null);
        hooks.onHover(null);
      }
    },
    setSuspended(on) {
      suspended = on;
      if (on) {
        drag = { kind: "none" };
        model.setHighlight(null);
        hooks.onHover(null);
      }
    },
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
