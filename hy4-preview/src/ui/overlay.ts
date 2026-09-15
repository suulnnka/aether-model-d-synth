/**
 * 覆盖层 UI(ui/overlay.ts)——原生 DOM,无框架(PRD §12)
 * 工具栏(Keymap / Presets)、右上视角与面板按钮、tooltip、11 步引导、
 * toast、一次性「点击任意处开启声音」提示、窄屏提示页。
 */
import * as THREE from "three";
import {
  CONTROL_BY_ID,
  params,
  type ControlSpec,
  type SelectorSpec,
  type SwitchSpec,
} from "../state/params";
import { PRESETS, getPresetCategories, type PresetData } from "../data/presets";
import { TOOLTIPS } from "../data/tooltips";
import { applyPreset } from "../state/presets";

const NARROW_PX = 760;

export const isNarrow = (): boolean => window.innerWidth <= NARROW_PX;

// ── 控件当前值的可读描述(tooltip / UI 回显) ─────────────────────────
export function describeControl(id: string): string {
  const spec: ControlSpec | undefined = CONTROL_BY_ID[id];
  if (!spec) return "";
  const v = params.get(id);
  switch (spec.kind) {
    case "selector": {
      const s = spec as SelectorSpec;
      return s.options[Math.round(v)] ?? "";
    }
    case "switch": {
      const s = spec as SwitchSpec;
      if (s.onLabel && s.offLabel) return params.getBool(id) ? s.onLabel : s.offLabel;
      return params.getBool(id) ? "ON" : "OFF";
    }
    case "rocker":
      return params.getBool(id) ? "ON" : "OFF";
    case "wheel":
      return `${Math.round(v)}%`;
    default: {
      const k = spec as { unit?: string; format?: (v: number) => string };
      if (k.format) return k.format(v);
      const txt = Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
      return k.unit === "semitones" ? `${txt} 半音` : txt;
    }
  }
}

function labelOf(id: string): string {
  return CONTROL_BY_ID[id]?.label ?? id;
}

export interface OverlayHooks {
  onSelectPreset(p: PresetData): void;
  onToggleView(): void;
  onTogglePanel(): void;
  onSkipIntro(): void;
  onOnboardingDone(): void;
  onGesture(): void;
}

export interface Overlay {
  root: HTMLElement;
  setView(mode: "2d" | "3d"): void;
  setPanelLabel(deg: number): void;
  showTooltip(id: string, x: number, y: number): void;
  hideTooltip(): void;
  toast(msg: string, ms?: number): void;
  setAudioReady(on: boolean): void;
  setFilterFallback(on: boolean): void;
  startOnboarding(): void;
  updateAnchors(): void;
  dispose(): void;
}

interface OnboardStep {
  title: string;
  body: string;
  /** 3D 锚点:控件 id 或 `key:<midi>`;DOM 锚点:`dom:<selector>` */
  anchor?: string;
  radius?: number;
}

/** UI-4 首启引导 11 步 */
const STEPS: OnboardStep[] = [
  {
    title: "欢迎使用 Aether Model D",
    body: "一台可在浏览器里把玩的高保真 3D 单音合成器。接下来用 10 步带你认识面板。按「跳过」可随时结束。",
  },
  {
    title: "振荡器组",
    body: "三个振荡器各自有音域、波形与失谐。锯齿波饱满、三角波柔和,把振荡器 2 略微失谐就能得到厚实的合唱感。",
    anchor: "osc1Waveform",
    radius: 96,
  },
  {
    title: "混音器",
    body: "这里决定三个振荡器、噪声与外部输入各自进滤波器的电平。右侧音量旋钮上方是外部输入过载指示灯。",
    anchor: "osc1Volume",
    radius: 86,
  },
  {
    title: "滤波器",
    body: "标志性的梯形低通:截止频率决定明暗,共鸣(Emphasis)拉到顶端会自激。这是本机音色灵魂所在。",
    anchor: "filterCutoff",
    radius: 92,
  },
  {
    title: "滤波包络",
    body: "Attack / Decay / Sustain 塑造每个音的亮度变化。Amount of Contour 决定包络对截止频率的作用深度。",
    anchor: "filterAttack",
    radius: 92,
  },
  {
    title: "响度包络",
    body: "同一套三段包络控制音量轮廓。Sustain 拉满即为持续音;拉到 0 则得到拨弦般的打击感。",
    anchor: "loudnessAttack",
    radius: 92,
  },
  {
    title: "控制器",
    body: "Tune 校准整机音准,Glide Time 设定滑音时长(需配合左侧边条的 GLIDE 开关),Modulation Mix 在两路调制源间过渡。",
    anchor: "tune",
    radius: 86,
  },
  {
    title: "调制",
    body: "打开 OSCILLATOR MODULATION 可用调制轮做颤音;FILTER MODULATION 则把调制送到截止频率。调制源在两枚拨杆间选择。",
    anchor: "modMix",
    radius: 88,
  },
  {
    title: "键盘",
    body: "44 键,C3 起三个八度加高位延伸。鼠标按下即发声,横向拖动可以滑奏;也可以用电脑键盘或 MIDI 设备演奏。",
    anchor: "key:60",
    radius: 120,
  },
  {
    title: "预设",
    body: "点右上角「预设」可一键载入 36 个出厂音色,面板与声音会同步切换。你的改动会自动保存在这台设备上。",
    anchor: "dom:#btn-presets",
    radius: 92,
  },
  {
    title: "开始演奏",
    body: "就这样了。右键拖动可环绕机身,滚轮缩放,按 V 切换 2D/3D,按 H 立起或放平面板。祝你玩得开心。",
  },
];

const KEYMAP_HTML = `
  <h3>键盘演奏</h3>
  <div class="km-rows">
    <div class="km-row"><span class="km-k">A S D F G H J K L ; '</span><span class="km-d">白键(自 C 起半音上行)</span></div>
    <div class="km-row"><span class="km-k">W E &nbsp; T Y U &nbsp; O P</span><span class="km-d">黑键(C# D# / F# G# A# / C# D#)</span></div>
    <div class="km-row"><span class="km-k">Q</span><span class="km-d">基准音下方大二度</span></div>
    <div class="km-row"><span class="km-k">Z / X</span><span class="km-d">整体降 / 升八度</span></div>
    <div class="km-row"><span class="km-k">1 / 2</span><span class="km-d">弯音下 / 上(按住生效)</span></div>
    <div class="km-row"><span class="km-k">3 – 8</span><span class="km-d">调制深度 0 / 20 / 40 / 60 / 80 / 100%</span></div>
  </div>
  <h3>视角与开关</h3>
  <div class="km-rows">
    <div class="km-row"><span class="km-k">V</span><span class="km-d">2D / 3D 视角切换</span></div>
    <div class="km-row"><span class="km-k">H</span><span class="km-d">面板立起 / 放平</span></div>
    <div class="km-row"><span class="km-k">右键拖动</span><span class="km-d">环绕(左键专门用于拧旋钮)</span></div>
    <div class="km-row"><span class="km-k">滚轮</span><span class="km-d">缩放;悬停在旋钮上为微调</span></div>
    <div class="km-row"><span class="km-k">触摸板双指滑动</span><span class="km-d">环绕旋转(2D 视角下为缩放)</span></div>
    <div class="km-row"><span class="km-k">触摸板捏合</span><span class="km-d">缩放</span></div>
    <div class="km-row"><span class="km-k">中键 / Shift+右键</span><span class="km-d">平移视角</span></div>
    <div class="km-row"><span class="km-k">Shift + 双指滑动</span><span class="km-d">平移视角</span></div>
    <div class="km-row"><span class="km-k">双击旋钮</span><span class="km-d">恢复默认值</span></div>
    <div class="km-row"><span class="km-k">Shift + 拖动</span><span class="km-d">精调(速率 ×0.1)</span></div>
  </div>
`;

export function createOverlay(
  host: HTMLElement,
  scene: { project(v: THREE.Vector3, out: { x: number; y: number; visible: boolean }): void },
  model: { anchorOf(id: string, target: THREE.Vector3): THREE.Vector3 | null },
  hooks: OverlayHooks
): Overlay {
  const root = document.createElement("div");
  root.className = "ui-root";
  host.appendChild(root);

  // ── 工具栏 ───────────────────────────────────────────────────────
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  toolbar.innerHTML = `
    <button id="btn-keymap" class="tb-btn" type="button">键位说明</button>
    <button id="btn-presets" class="tb-btn" type="button" aria-haspopup="true" aria-expanded="false">预设</button>
  `;
  root.appendChild(toolbar);

  const presetMenu = document.createElement("div");
  presetMenu.className = "preset-menu";
  presetMenu.hidden = true;
  ((): void => {
    const cats = getPresetCategories();
    let html = "";
    for (const cat of cats) {
      const items = PRESETS.filter((p) => p.category === cat);
      if (!items.length) continue;
      html += `<div class="pm-cat">${escapeHtml(cat)}</div>`;
      for (const p of items) {
        html += `<button class="pm-item" type="button" data-preset="${escapeHtml(p.id)}">
          <span class="pm-name">${escapeHtml(p.name)}</span>
          <span class="pm-desc">${escapeHtml(p.description ?? "")}</span>
        </button>`;
      }
    }
    presetMenu.innerHTML = html;
  })();
  root.appendChild(presetMenu);

  // ── 右上视角控制 ─────────────────────────────────────────────────
  const viewCtl = document.createElement("div");
  viewCtl.className = "view-ctl";
  viewCtl.innerHTML = `
    <button id="btn-view" class="tb-btn" type="button" title="2D / 3D 视角切换 (V)">3D</button>
    <button id="btn-panel" class="tb-btn" type="button" title="面板立起 / 放平 (H)">放平</button>
  `;
  root.appendChild(viewCtl);

  // ── 状态条(滤波器兼容模式提示) ──────────────────────────────────
  const statusBar = document.createElement("div");
  statusBar.className = "status-bar";
  statusBar.hidden = true;
  root.appendChild(statusBar);

  // ── tooltip ──────────────────────────────────────────────────────
  const tip = document.createElement("div");
  tip.className = "tooltip";
  tip.hidden = true;
  root.appendChild(tip);

  // ── 键位说明弹层 ─────────────────────────────────────────────────
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-card" role="dialog" aria-label="键位说明">
      <button class="modal-close" type="button" aria-label="关闭">×</button>
      ${KEYMAP_HTML}
    </div>`;
  root.appendChild(modal);

  // ── 引导 ─────────────────────────────────────────────────────────
  const onboard = document.createElement("div");
  onboard.className = "onboard";
  onboard.hidden = true;
  onboard.innerHTML = `
    <div class="ob-spot"></div>
    <div class="ob-card">
      <div class="ob-step"></div>
      <h2 class="ob-title"></h2>
      <p class="ob-body"></p>
      <div class="ob-actions">
        <button class="ob-skip" type="button">跳过</button>
        <span class="ob-spacer"></span>
        <button class="ob-prev" type="button">上一步</button>
        <button class="ob-next primary" type="button">下一步</button>
      </div>
    </div>`;
  root.appendChild(onboard);

  // ── 音频提示 / toast ─────────────────────────────────────────────
  const audioHint = document.createElement("div");
  audioHint.className = "audio-hint";
  audioHint.textContent = "点击任意处开启声音";
  audioHint.hidden = true;
  root.appendChild(audioHint);

  const toastHost = document.createElement("div");
  toastHost.className = "toast-host";
  root.appendChild(toastHost);

  // ── 事件 ─────────────────────────────────────────────────────────
  const btnKeymap = root.querySelector<HTMLButtonElement>("#btn-keymap")!;
  const btnPresets = root.querySelector<HTMLButtonElement>("#btn-presets")!;
  const btnView = root.querySelector<HTMLButtonElement>("#btn-view")!;
  const btnPanel = root.querySelector<HTMLButtonElement>("#btn-panel")!;

  const closePresetMenu = (): void => {
    presetMenu.hidden = true;
    btnPresets.setAttribute("aria-expanded", "false");
  };

  btnKeymap.addEventListener("click", () => {
    modal.hidden = false;
    closePresetMenu();
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal || (e.target as HTMLElement).classList.contains("modal-close")) {
      modal.hidden = true;
    }
  });

  btnPresets.addEventListener("click", () => {
    presetMenu.hidden = !presetMenu.hidden;
    btnPresets.setAttribute("aria-expanded", String(!presetMenu.hidden));
  });
  presetMenu.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-preset]");
    if (!btn) return;
    const id = btn.dataset.preset!;
    const p = PRESETS.find((x) => x.id === id);
    if (p) {
      applyPreset(p);
      hooks.onSelectPreset(p);
      toast(`已载入预设:${p.name}`);
    }
    closePresetMenu();
    btnPresets.focus();
  });
  document.addEventListener("pointerdown", (e) => {
    if (presetMenu.hidden) return;
    if ((e.target as HTMLElement).closest(".preset-menu, #btn-presets")) return;
    closePresetMenu();
  });

  btnView.addEventListener("click", () => hooks.onToggleView());
  btnPanel.addEventListener("click", () => hooks.onTogglePanel());

  // ── toast ────────────────────────────────────────────────────────
  function toast(msg: string, ms = 2600): void {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    toastHost.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => {
      el.classList.remove("in");
      setTimeout(() => el.remove(), 320);
    }, ms);
  }

  // ── tooltip ──────────────────────────────────────────────────────
  let tipId: string | null = null;
  function showTooltip(id: string, x: number, y: number): void {
    const label = id === "tunerButton" ? "A-440 TUNER" : labelOf(id);
    const value = describeControl(id === "tunerButton" ? "tunerOn" : id);
    const desc = TOOLTIPS[id === "tunerButton" ? "tunerOn" : id] ?? "";
    if (tipId !== id) {
      tip.innerHTML = `<b>${escapeHtml(label)}</b>${value ? ` · <i>${escapeHtml(value)}</i>` : ""}${
        desc ? `<span>${escapeHtml(desc)}</span>` : ""
      }`;
      tipId = id;
    }
    tip.hidden = false;
    const pad = 14;
    const w = tip.offsetWidth || 240;
    const h = tip.offsetHeight || 60;
    let px = x + pad;
    let py = y + pad;
    if (px + w > window.innerWidth - 8) px = x - w - pad;
    if (py + h > window.innerHeight - 8) py = y - h - pad;
    tip.style.transform = `translate(${Math.max(8, px)}px, ${Math.max(8, py)}px)`;
  }
  function hideTooltip(): void {
    tip.hidden = true;
    tipId = null;
  }

  // ── 引导流程 ─────────────────────────────────────────────────────
  const spot = onboard.querySelector<HTMLElement>(".ob-spot")!;
  const obStep = onboard.querySelector<HTMLElement>(".ob-step")!;
  const obTitle = onboard.querySelector<HTMLElement>(".ob-title")!;
  const obBody = onboard.querySelector<HTMLElement>(".ob-body")!;
  const obPrev = onboard.querySelector<HTMLButtonElement>(".ob-prev")!;
  const obNext = onboard.querySelector<HTMLButtonElement>(".ob-next")!;
  const obSkip = onboard.querySelector<HTMLButtonElement>(".ob-skip")!;

  let obIndex = 0;
  let obActive = false;
  const anchorV = new THREE.Vector3();
  const proj = { x: 0, y: 0, visible: false };

  function placeSpot(): void {
    const step = STEPS[obIndex];
    const card = onboard.querySelector<HTMLElement>(".ob-card")!;
    card.classList.remove("centered");
    if (!step.anchor) {
      spot.style.opacity = "0";
      card.classList.add("centered");
      return;
    }
    if (step.anchor.startsWith("dom:")) {
      const el = document.querySelector<HTMLElement>(step.anchor.slice(4));
      if (el) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const rad = Math.max(r.width, r.height) / 2 + 14;
        applySpot(cx, cy, rad);
        return;
      }
    } else {
      const w = model.anchorOf(step.anchor, anchorV);
      if (w) {
        scene.project(w, proj);
        applySpot(proj.x, proj.y, step.radius ?? 90);
        return;
      }
    }
    spot.style.opacity = "0";
    card.classList.add("centered");
  }

  function applySpot(cx: number, cy: number, r: number): void {
    spot.style.opacity = "1";
    spot.style.width = `${r * 2}px`;
    spot.style.height = `${r * 2}px`;
    spot.style.left = `${cx - r}px`;
    spot.style.top = `${cy - r}px`;
    // 卡片避让:聚光在下半屏时把卡片放到上方
    const card = onboard.querySelector<HTMLElement>(".ob-card")!;
    card.classList.toggle("flip-up", cy > window.innerHeight * 0.55);
  }

  function renderStep(): void {
    const s = STEPS[obIndex];
    obStep.textContent = `${obIndex + 1} / ${STEPS.length}`;
    obTitle.textContent = s.title;
    obBody.textContent = s.body;
    obPrev.disabled = obIndex === 0;
    obNext.textContent = obIndex === STEPS.length - 1 ? "完成" : "下一步";
    placeSpot();
  }

  function finishOnboard(): void {
    obActive = false;
    onboard.hidden = true;
    hooks.onOnboardingDone();
  }

  obNext.addEventListener("click", () => {
    if (obIndex >= STEPS.length - 1) finishOnboard();
    else {
      obIndex++;
      renderStep();
    }
  });
  obPrev.addEventListener("click", () => {
    if (obIndex > 0) {
      obIndex--;
      renderStep();
    }
  });
  obSkip.addEventListener("click", finishOnboard);

  function startOnboarding(): void {
    obIndex = 0;
    obActive = true;
    onboard.hidden = false;
    renderStep();
  }

  // ── 一次性音频提示 ───────────────────────────────────────────────
  function setAudioReady(on: boolean): void {
    audioHint.hidden = on;
  }

  function setFilterFallback(on: boolean): void {
    statusBar.hidden = !on;
    statusBar.textContent = on ? "滤波器:兼容模式(4×Biquad 级联)" : "";
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      if (!modal.hidden) modal.hidden = true;
      else if (!presetMenu.hidden) closePresetMenu();
      else if (obActive) finishOnboard();
    }
  };
  window.addEventListener("keydown", onKey);

  return {
    root,
    setView(mode) {
      btnView.textContent = mode === "2d" ? "2D" : "3D";
      btnPanel.hidden = mode === "2d";
    },
    setPanelLabel(deg) {
      btnPanel.textContent = deg > 30 ? "放平" : "立起";
    },
    showTooltip,
    hideTooltip,
    toast,
    setAudioReady,
    setFilterFallback,
    startOnboarding,
    updateAnchors() {
      if (obActive) placeSpot();
    },
    dispose() {
      window.removeEventListener("keydown", onKey);
      root.remove();
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}

/** 窄屏提示页(UI-5):不渲染 3D 场景 */
export function showMobileGate(host: HTMLElement): void {
  const el = document.createElement("div");
  el.className = "mobile-gate";
  el.innerHTML = `
    <div class="mg-card">
      <div class="mg-brand">AETHER<small>MODEL D</small></div>
      <p>请使用桌面或平板浏览器打开</p>
      <span>Aether Model D 是一台 3D 模拟合成器,需要更大的屏幕与指针操作。</span>
    </div>`;
  host.appendChild(el);
}
