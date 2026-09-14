/**
 * HTML overlay (PRD UI-1..UI-5).
 *
 * All chrome is real DOM, focusable and keyboard reachable (PRD UI-4). The
 * overlay owns no application state: it renders what it is told and reports
 * intent through callbacks, so `main.ts` stays the only place that decides what
 * "toggle the view" means.
 *
 * The help sheet's control reference is generated from the same §6 registry the
 * instrument is built from, which means the documentation cannot drift from the
 * hardware.
 */

import {
  CONTROL_SPECS,
  SECTION_ORDER,
  SECTION_TITLES,
  SWITCH_GESTURE,
  KNOB_GESTURE,
  SELECTOR_GESTURE,
  defaultPosOf,
  type AnySpec,
} from '../state/specs.ts';
import { formatValue, toValue } from '../state/range.ts';
import { noteName } from '../util/notes.ts';
import type { ViewMode } from '../scene/cameraRig.ts';

/* ===========================================================================
 * Tiny DOM helper
 * ========================================================================= */

type Props = Record<string, string | number | boolean | EventListener | undefined>;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props,
  children?: (Node | string | null | undefined)[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === false) continue;
      if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === 'text') {
        node.textContent = String(value);
      } else if (value === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children ?? []) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/* ===========================================================================
 * Public shape
 * ========================================================================= */

export interface OverlayHandlers {
  onSetView(mode: ViewMode): void;
  onTogglePanel(): void;
  onResetView(): void;
  onToggleAutoRotate(on: boolean): void;
  onRestoreFactory(): void;
  onToggleBloom(on: boolean): void;
  onUnlock(): void;
  onOnboardingDone(): void;
}

export interface OverlayOptions {
  readonly host: HTMLElement;
  readonly handlers: OverlayHandlers;
  readonly reducedMotion: boolean;
}

export interface Overlay {
  readonly tipElement: HTMLElement;
  setView(mode: ViewMode): void;
  setTransitioning(busy: boolean): void;
  setPanelRaised(raised: boolean): void;
  setAutoRotate(on: boolean): void;
  setBloom(on: boolean): void;
  setPanelAngle(deg: number | null, clientX?: number, clientY?: number): void;
  setReadout(noteMidi: number | null, mode: ViewMode, usingWorklet: boolean): void;
  setKeyboardBase(midi: number): void;
  setKeyboardMap(rows: readonly { code: string; midi: number }[]): void;
  showTooltip(info: { text: string; value: string; hint: string } | null, x: number, y: number): void;
  openHelp(): void;
  closeSheets(): void;
  toggleHelp(): void;
  get sheetsOpen(): boolean;
  showOnboarding(): void;
  showUnlock(): void;
  hideUnlock(): void;
  setFilterMode(label: string): void;
  dispose(): void;
}

/* ===========================================================================
 * Static copy
 * ========================================================================= */

const GESTURE_ROWS: readonly (readonly [string, string])[] = [
  ['旋钮', KNOB_GESTURE],
  ['档位旋钮', SELECTOR_GESTURE],
  ['开关', SWITCH_GESTURE],
  ['琴键', '按住发声 · 滑过相邻琴键滑奏（glissando）'],
  ['音高轮', '垂直拖动弯音 · 松手弹簧回中'],
  ['调制轮', '垂直拖动 · 松手保持'],
  ['铰链面板', '拖动面板前缘 · 或点右上角「立起 / 放平」'],
  ['视角', '空白处左键拖动环绕 · 右键拖动平移 · 滚轮缩放'],
];

const SHORTCUT_ROWS: readonly (readonly [string, string])[] = [
  ['Q', '切换 3D / 2D 视角'],
  ['R', '铰链面板 立起 / 放平'],
  ['?', '打开 / 关闭本帮助'],
  ['空格', 'All Notes Off（全部停音）'],
  ['- / =', '演奏基准八度 下移 / 上移'],
];

/** Human summary of a control's range, for the reference table. */
function rangeText(spec: AnySpec): string {
  switch (spec.kind) {
    case 'knob': {
      const value = toValue(spec.range, defaultPosOf(spec));
      return `${formatValue(spec.range, spec.range.min)} – ${formatValue(spec.range, spec.range.max)}｜默认 ${formatValue(spec.range, value)}`;
    }
    case 'selector':
      return `${spec.options.map((o) => o.short).join(' / ')}｜默认 ${spec.options[spec.defaultIndex]?.short ?? ''}`;
    case 'switch':
      return `开关｜默认 ${spec.default ? spec.onLabel : spec.offLabel}`;
    case 'wheel':
      return `轮｜默认 ${spec.text(spec.defaultPos)}`;
    default:
      return '';
  }
}

/* ===========================================================================
 * Builder
 * ========================================================================= */

export function createOverlay(options: OverlayOptions): Overlay {
  const { host, handlers } = options;

  /* ------------------------------------------------------------- HUD */

  const seg3d = el('button', {
    class: 'seg__opt',
    type: 'button',
    'aria-pressed': 'true',
    text: '3D',
    title: '自由环绕视角（Q）',
  });
  const seg2d = el('button', {
    class: 'seg__opt',
    type: 'button',
    'aria-pressed': 'false',
    text: '2D',
    title: '平面视角（Q）',
  });
  seg3d.addEventListener('click', () => handlers.onSetView('3d'));
  seg2d.addEventListener('click', () => handlers.onSetView('2d'));
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': '视角' }, [seg3d, seg2d]);

  const panelBtn = el('button', {
    class: 'o-btn',
    type: 'button',
    'aria-pressed': 'true',
    title: '立起 / 放平面板（R）',
  }, [
    el('span', { text: '面板' }),
    el('span', { class: 'o-btn__key', text: 'R' }),
  ]);
  panelBtn.addEventListener('click', () => handlers.onTogglePanel());

  const rotateBtn = el('button', {
    class: 'o-btn',
    type: 'button',
    'aria-pressed': 'false',
    title: '无操作 15 秒后缓慢自转展示',
    text: '自转',
  });
  rotateBtn.addEventListener('click', () => {
    const next = rotateBtn.getAttribute('aria-pressed') !== 'true';
    rotateBtn.setAttribute('aria-pressed', String(next));
    handlers.onToggleAutoRotate(next);
  });

  const resetBtn = el('button', {
    class: 'o-btn',
    type: 'button',
    text: '复位视角',
    title: '把相机恢复到默认机位',
  });
  resetBtn.addEventListener('click', () => handlers.onResetView());

  const hud = el('div', { class: 'hud' }, [
    el('div', { class: 'hud__row' }, [seg]),
    el('div', { class: 'hud__row' }, [panelBtn, rotateBtn, resetBtn]),
  ]);

  /* --------------------------------------------------- bottom-left cluster */

  const helpBtn = el('button', {
    class: 'o-btn',
    type: 'button',
    text: '帮助 ?',
    title: '手势 · 键位 · 控件总表',
  });
  helpBtn.addEventListener('click', () => toggleHelpSheet());

  const optionsBtn = el('button', {
    class: 'o-btn',
    type: 'button',
    text: '选项',
    title: '画面与出厂设置',
  });
  optionsBtn.addEventListener('click', () => openOptionsSheet());

  const hudBl = el('div', { class: 'hud-bl' }, [helpBtn, optionsBtn]);

  /* -------------------------------------------------------------- readout */

  const readoutNote = el('span', { class: 'readout__note', text: '—' });
  const readoutBase = el('span', { text: '基准 C4' });
  const readoutMode = el('span', { class: 'readout__mode', text: '3D' });
  const readout = el('div', { class: 'readout', 'data-silent': '1', role: 'status' }, [
    readoutNote,
    el('span', { class: 'readout__sep' }),
    readoutBase,
    el('span', { class: 'readout__sep' }),
    readoutMode,
  ]);

  /* -------------------------------------------------------------- tooltip */

  const tipName = el('span', { class: 'tip__name' });
  const tipValue = el('span', { class: 'tip__value' });
  const tipHint = el('span', { class: 'tip__hint' });
  const tip = el('div', { class: 'tip', role: 'tooltip' }, [tipName, tipValue, tipHint]);

  /* ----------------------------------------------------------- angle pill */

  const anglePill = el('div', { class: 'angle-pill' });

  /* ---------------------------------------------------------------- sheets */

  const helpBody = buildHelpBody();
  const helpSheet = buildSheet('帮助', '鼠标手势 · 电脑键盘映射 · 快捷键 · 控件总表', helpBody);

  const optBody = buildOptionsBody();
  const optSheet = buildSheet('选项', '画面与出厂设置', optBody);

  /* --------------------------------------------------------------- toasts */

  const toastStack = el('div', { class: 'toast-stack' });

  /* --------------------------------------------------------------- unlock */

  const unlock = el('button', { class: 'unlock', type: 'button', 'data-open': '0' }, [
    el('div', { class: 'unlock__inner' }, [
      el('div', { class: 'unlock__pulse' }, [el('span', { text: '♪' })]),
      el('div', { class: 'unlock__title', text: '点击任意处开启声音' }),
      el('div', {
        class: 'unlock__sub',
        text: '浏览器要求先有一次用户操作，音频引擎才能启动',
      }),
    ]),
  ]);
  unlock.addEventListener('click', () => handlers.onUnlock());

  const overlay = el('div', { class: 'overlay' }, [
    hud,
    hudBl,
    readout,
    anglePill,
    helpSheet.root,
    optSheet.root,
    toastStack,
    unlock,
  ]);

  host.appendChild(overlay);
  host.appendChild(tip);

  /* ------------------------------------------------------------ behaviour */

  function toggleHelpSheet(): void {
    const open = helpSheet.root.getAttribute('data-open') === '1';
    closeSheets();
    if (!open) {
      helpSheet.root.setAttribute('data-open', '1');
      helpSheet.closeButton.focus();
    }
  }

  function openOptionsSheet(): void {
    closeSheets();
    optSheet.root.setAttribute('data-open', '1');
    optSheet.closeButton.focus();
  }

  function closeSheets(): void {
    helpSheet.root.setAttribute('data-open', '0');
    optSheet.root.setAttribute('data-open', '0');
  }

  let baseMidi = 60;
  let keyboardRows: readonly { code: string; midi: number }[] = [];
  let viewMode: ViewMode = '3d';
  let transitioning = false;

  /** The panel control only exists in 3D, and never mid-transition. */
  function syncPanelButton(): void {
    panelBtn.disabled = transitioning || viewMode === '2d';
  }

  function buildKeyboardTable(): void {
    const table = helpBody.querySelector('[data-role="keymap"]');
    if (!table) return;
    table.textContent = '';
    const chromatic = keyboardRows.slice(0, 18);
    const white = keyboardRows.slice(18);

    const rowFor = (label: string, rows: readonly { code: string; midi: number }[]): void => {
      const keys = rows
        .map((r) => `${codeLabel(r.code)} → ${noteName(r.midi)}`)
        .join('　');
      table.appendChild(
        el('div', { class: 'kv__row' }, [
          el('span', { class: 'kv__k', text: label }),
          el('span', { class: 'kv__v', text: keys || '—' }),
        ]),
      );
    };
    rowFor('半音行', chromatic);
    rowFor('下排白键', white);
  }

  function buildHelpBody(): HTMLElement {
    const gestureKv = el('div', { class: 'kv' });
    for (const [key, value] of GESTURE_ROWS) {
      gestureKv.appendChild(
        el('div', { class: 'kv__row' }, [
          el('span', { class: 'kv__k', text: key }),
          el('span', { class: 'kv__v', text: value }),
        ]),
      );
    }

    const shortcutKv = el('div', { class: 'kv' });
    for (const [key, value] of SHORTCUT_ROWS) {
      shortcutKv.appendChild(
        el('div', { class: 'kv__row' }, [
          el('span', { class: 'kv__k', text: key }),
          el('span', { class: 'kv__v', text: value }),
        ]),
      );
    }

    const keymapKv = el('div', { class: 'kv', 'data-role': 'keymap' });

    const controlGroups: Node[] = [];
    for (const section of SECTION_ORDER) {
      const specs = CONTROL_SPECS.filter((s) => s.section === section);
      if (!specs.length) continue;
      const kv = el('div', { class: 'kv' });
      for (const spec of specs) {
        kv.appendChild(
          el('div', { class: 'kv__row' }, [
            el('span', { class: 'kv__k', text: spec.name }),
            el('span', { class: 'kv__v', text: rangeText(spec) }),
          ]),
        );
      }
      controlGroups.push(
        el('div', {}, [
          el('h3', { class: 'sheet__h', text: `${SECTION_TITLES[section].label} · ${SECTION_TITLES[section].name}` }),
          kv,
        ]),
      );
    }

    return el('div', { class: 'sheet__grid' }, [
      el('div', {}, [
        el('h3', { class: 'sheet__h', text: '鼠标手势' }),
        gestureKv,
      ]),
      el('div', {}, [
        el('h3', { class: 'sheet__h', text: '电脑键盘演奏' }),
        keymapKv,
        el('h3', { class: 'sheet__h', text: '快捷键', style: 'margin-top:18px' }),
        shortcutKv,
      ]),
      ...controlGroups,
      el('p', {
        class: 'sheet__note',
        text:
          '注：PRD §7 同时把 V / H 列为演奏键与视角/面板快捷键，二者冲突。' +
          '演奏键（含 V = F、H = A）优先保留，视角与面板快捷键改绑 Q / R；' +
          '两个动作在右上角也都有常驻按钮。',
      }),
    ]);
  }

  function buildOptionsBody(): HTMLElement {
    const autoRotate = el('input', { type: 'checkbox' });
    autoRotate.addEventListener('change', () => {
      handlers.onToggleAutoRotate(autoRotate.checked);
    });

    const bloom = el('input', { type: 'checkbox', checked: true });
    bloom.addEventListener('change', () => handlers.onToggleBloom(bloom.checked));

    const factory = el('button', { class: 'o-btn', type: 'button', text: '恢复出厂设置' });
    factory.addEventListener('click', () => {
      handlers.onRestoreFactory();
      closeSheets();
    });

    return el('div', { class: 'opt-list' }, [
      el('label', { class: 'opt' }, [
        autoRotate,
        el('span', {}, [
          el('span', { text: '无操作 15 秒后缓慢自转' }),
          el('small', { text: '任何鼠标或键盘操作立即中断' }),
        ]),
      ]),
      el('label', { class: 'opt' }, [
        bloom,
        el('span', {}, [
          el('span', { text: '启用轻微 Bloom' }),
          el('small', { text: '仅作用于电源指示灯等自发光元素' }),
        ]),
      ]),
      el('div', {
        class: 'sheet__note',
        text: options.reducedMotion
          ? '已检测到系统「减少动态效果」偏好：相机与面板动画已自动缩短。'
          : '系统未开启「减少动态效果」，动画按完整时长播放。',
      }),
      el('div', { style: 'margin-top:18px' }, [factory]),
    ]);
  }

  /* --------------------------------------------------------------- return */

  return {
    tipElement: tip,

    setView(mode): void {
      viewMode = mode;
      seg3d.setAttribute('aria-pressed', String(mode === '3d'));
      seg2d.setAttribute('aria-pressed', String(mode === '2d'));
      readoutMode.textContent = mode === '3d' ? '3D' : '2D';
      syncPanelButton();
    },

    setTransitioning(busy): void {
      transitioning = busy;
      seg3d.disabled = busy;
      seg2d.disabled = busy;
      syncPanelButton();
    },

    setPanelRaised(raised): void {
      panelBtn.setAttribute('aria-pressed', String(raised));
      const label = panelBtn.firstElementChild;
      if (label) label.textContent = raised ? '放平' : '立起';
    },

    setAutoRotate(on): void {
      rotateBtn.setAttribute('aria-pressed', String(on));
      const box = optBody.querySelector('input[type="checkbox"]');
      if (box instanceof HTMLInputElement) box.checked = on;
    },

    setBloom(on): void {
      const boxes = optBody.querySelectorAll('input[type="checkbox"]');
      const box = boxes[1];
      if (box instanceof HTMLInputElement) box.checked = on;
    },

    setPanelAngle(deg, clientX, clientY): void {
      if (deg === null) {
        anglePill.setAttribute('data-show', '0');
        return;
      }
      anglePill.textContent = `${deg.toFixed(0)}°`;
      if (clientX !== undefined && clientY !== undefined) {
        anglePill.style.left = `${clientX}px`;
        anglePill.style.top = `${clientY - 26}px`;
      }
      anglePill.setAttribute('data-show', '1');
    },

    setReadout(noteMidi, mode, usingWorklet): void {
      const silent = noteMidi === null;
      readout.setAttribute('data-silent', silent ? '1' : '0');
      readoutNote.textContent = silent ? '—' : noteName(noteMidi);
      readoutBase.textContent = `基准 ${noteName(baseMidi)}`;
      readoutMode.textContent = `${mode === '3d' ? '3D' : '2D'} · ${usingWorklet ? '梯形滤波' : '兼容模式'}`;
    },

    setKeyboardBase(midi): void {
      baseMidi = midi;
      buildKeyboardTable();
    },

    setKeyboardMap(rows): void {
      keyboardRows = rows;
      buildKeyboardTable();
    },

    showTooltip(info, x, y): void {
      if (!info) {
        tip.setAttribute('data-show', '0');
        return;
      }
      tipName.textContent = info.text;
      tipValue.textContent = info.value;
      tipHint.textContent = info.hint;
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
      tip.setAttribute('data-show', '1');
    },

    openHelp: toggleHelpSheet,
    closeSheets,
    toggleHelp: toggleHelpSheet,

    get sheetsOpen(): boolean {
      return (
        helpSheet.root.getAttribute('data-open') === '1' ||
        optSheet.root.getAttribute('data-open') === '1'
      );
    },

    showOnboarding(): void {
      toastStack.textContent = '';
      const steps: readonly (readonly [string, string, string])[] = [
        ['1', '先开启声音', '点击画面任意处，浏览器才会允许音频引擎启动。'],
        ['2', '转旋钮、按琴键', '在旋钮上垂直拖动，或直接用电脑键盘演奏。'],
        ['3', '换个角度看', '右上角切换 3D / 2D，或掀开铰链面板看看内部。'],
      ];
      steps.forEach(([idx, title, text], i) => {
        const skip = el('button', { class: 'toast__skip', type: 'button', text: '知道了' });
        skip.addEventListener('click', () => {
          toastStack.textContent = '';
          handlers.onOnboardingDone();
        });
        toastStack.appendChild(
          el('div', { class: 'toast', style: `animation-delay:${i * 90}ms` }, [
            el('div', { class: 'toast__idx', text: idx }),
            el('div', { class: 'toast__body' }, [
              el('div', { class: 'toast__title', text: title }),
              el('p', { class: 'toast__text', text }),
              i === steps.length - 1
                ? el('div', { class: 'toast__actions' }, [skip])
                : null,
            ]),
          ]),
        );
      });
    },

    showUnlock(): void {
      unlock.setAttribute('data-open', '1');
    },

    hideUnlock(): void {
      unlock.setAttribute('data-open', '0');
    },

    setFilterMode(label): void {
      readoutMode.title = label;
    },

    dispose(): void {
      overlay.remove();
      tip.remove();
    },
  };
}

/* ===========================================================================
 * Pieces
 * ========================================================================= */

function buildSheet(title: string, subtitle: string, body: Node): {
  root: HTMLElement;
  closeButton: HTMLButtonElement;
} {
  const closeButton = el('button', {
    class: 'sheet__close',
    type: 'button',
    'aria-label': '关闭',
    text: '×',
  });
  const root = el('div', { class: 'sheet', 'data-open': '0', role: 'dialog', 'aria-modal': 'true' }, [
    el('div', { class: 'sheet__panel' }, [
      el('div', { class: 'sheet__head' }, [
        el('h2', { class: 'sheet__title' }, [
          document.createTextNode(title),
          el('small', { text: subtitle }),
        ]),
        closeButton,
      ]),
      el('div', { class: 'sheet__body' }, [body]),
    ]),
  ]);

  const close = (): void => root.setAttribute('data-open', '0');
  closeButton.addEventListener('click', close);
  root.addEventListener('click', (event) => {
    if (event.target === root) close();
  });

  return { root, closeButton };
}

/** Readable label for a physical key code. */
function codeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  switch (code) {
    case 'Semicolon':
      return ';';
    case 'Quote':
      return "'";
    case 'Comma':
      return ',';
    case 'Period':
      return '.';
    case 'Slash':
      return '/';
    case 'Minus':
      return '-';
    case 'Equal':
      return '=';
    default:
      return code;
  }
}
