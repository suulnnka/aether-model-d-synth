/**
 * HTML 覆盖层(PRD §12):工具栏(仅 键位说明 + 预设,UI-1)、右上角视角/面板
 * 按钮(UI-2)、键位说明弹层(UI-3)、窄屏提示(UI-5)、toast(UI-6)、
 * 「点击任意处开启声音」提示(UI-7)、WebGL 上下文丢失提示。
 */
import type { Preset } from "../state/presets";
import { PRESETS, presetCategories } from "../state/presets";

export interface OverlayHooks {
  onPreset(preset: Preset): void;
  onViewToggle(): void;
  onHingeToggle(): void;
  is2d(): boolean;
}

export interface Overlay {
  root: HTMLDivElement;
  showToast(message: string, ms?: number): void;
  hideGate(): void;
  setViewLabel(): void;
  setHingeVisible(visible: boolean): void;
  openKeymap: () => void;
  dispose(): void;
}

export function createOverlay(hooks: OverlayHooks): Overlay {
  const root = document.createElement("div");
  root.id = "ui-root";

  /* ---- 工具栏(顶部水平居中) ---- */
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const btnKeymap = document.createElement("button");
  btnKeymap.className = "tb-btn";
  btnKeymap.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/></svg><span>Keymap</span>`;
  btnKeymap.setAttribute("aria-label", "Keyboard instructions");
  const presetWrap = document.createElement("div");
  presetWrap.className = "preset-wrap";
  const btnPresets = document.createElement("button");
  btnPresets.className = "tb-btn";
  btnPresets.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span>Presets</span><em class="caret">▾</em>`;
  btnPresets.setAttribute("aria-haspopup", "listbox");
  const presetMenu = document.createElement("div");
  presetMenu.className = "preset-menu";
  presetMenu.setAttribute("role", "listbox");
  presetMenu.style.display = "none";
  for (const cat of presetCategories()) {
    const label = document.createElement("div");
    label.className = "preset-cat";
    label.textContent = cat;
    presetMenu.appendChild(label);
    for (const p of PRESETS.filter((x) => x.category === cat)) {
      const item = document.createElement("div");
      item.className = "preset-item";
      item.setAttribute("role", "option");
      item.textContent = p.name;
      item.addEventListener("click", () => {
        hooks.onPreset(p);
        presetMenu.style.display = "none";
      });
      presetMenu.appendChild(item);
    }
  }
  presetWrap.append(btnPresets, presetMenu);
  toolbar.append(btnKeymap, presetWrap);
  root.appendChild(toolbar);

  const togglePresetMenu = () => {
    presetMenu.style.display = presetMenu.style.display === "none" ? "block" : "none";
  };
  btnPresets.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePresetMenu();
  });
  document.addEventListener("click", (e) => {
    if (!presetWrap.contains(e.target as Node)) presetMenu.style.display = "none";
  });

  /* ---- 右上角:视角 / 面板 ---- */
  const viewControls = document.createElement("div");
  viewControls.className = "view-controls";
  const btnView = document.createElement("button");
  btnView.className = "tb-btn";
  btnView.id = "btn-view";
  const btnHinge = document.createElement("button");
  btnHinge.className = "tb-btn";
  btnHinge.id = "btn-hinge";
  viewControls.append(btnView, btnHinge);
  root.appendChild(viewControls);

  /* ---- 键位说明弹层(UI-3) ---- */
  const keymapModal = document.createElement("div");
  keymapModal.className = "modal-backdrop";
  keymapModal.style.display = "none";
  keymapModal.addEventListener("click", (e) => {
    if (e.target === keymapModal) keymapModal.style.display = "none";
  });
  const keymapCard = document.createElement("div");
  keymapCard.className = "modal-card";
  keymapCard.setAttribute("role", "dialog");
  keymapCard.innerHTML = `
    <h2>Keyboard Instructions · 键位说明</h2>
    <table class="keymap-table">
      <tbody>
        <tr><td><kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>F</kbd> <kbd>G</kbd> <kbd>H</kbd> <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd> <kbd>;</kbd> <kbd>'</kbd></td><td>白键半音上行(基准音 C4:A=C…'=F+1)</td></tr>
        <tr><td><kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd> <kbd>U</kbd> <kbd>O</kbd> <kbd>P</kbd></td><td>对应黑键(C#、D#、F#、G#、A#、C#2、D#2)</td></tr>
        <tr><td><kbd>Q</kbd></td><td>基准音下方的大二度(B)</td></tr>
        <tr><td><kbd>Z</kbd> / <kbd>X</kbd></td><td>基准八度 下移 / 上移(MIDI 0–127 内钳位)</td></tr>
        <tr><td><kbd>1</kbd> / <kbd>2</kbd></td><td>弯音 下 / 上(按住生效,松开回中)</td></tr>
        <tr><td><kbd>3</kbd>–<kbd>8</kbd></td><td>调制深度 0 / 20 / 40 / 60 / 80 / 100%</td></tr>
        <tr><td><kbd>V</kbd> / <kbd>H</kbd></td><td>视角切换 3D/2D / 面板立起-放平</td></tr>
        <tr><td>鼠标 · 旋钮</td><td>按住垂直拖动;Shift 精调;滚轮微调;双击恢复默认</td></tr>
        <tr><td>鼠标 · 档位旋钮</td><td>单击循环进档;按住左右拖动换档</td></tr>
        <tr><td>鼠标 · 相机(3D)</td><td>右键环绕;滚轮缩放;中键或 Shift+右键平移</td></tr>
        <tr><td>触摸板(3D)</td><td>双指滑动环绕;捏合缩放;Shift+双指平移</td></tr>
        <tr><td>鼠标 · 面板后缘</td><td>拖拽调整面板角度 0–60°(向上拖 = 立起)</td></tr>
        <tr><td>MIDI</td><td>Note On/Off · Pitch Bend · CC1 调制轮,即插即用</td></tr>
      </tbody>
    </table>
    <button class="tb-btn modal-close">Close</button>
  `;
  keymapModal.appendChild(keymapCard);
  keymapCard.querySelector(".modal-close")!.addEventListener("click", () => {
    keymapModal.style.display = "none";
  });
  btnKeymap.addEventListener("click", () => {
    keymapModal.style.display = "flex";
  });
  root.appendChild(keymapModal);

  /* ---- 解锁提示(UI-7) ---- */
  const gate = document.createElement("div");
  gate.className = "gate-hint";
  gate.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg><span>点击任意处开启声音</span>`;
  root.appendChild(gate);

  /* ---- toast ---- */
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.display = "none";
  root.appendChild(toast);
  let toastTimer: number | undefined;

  /* ---- 窄屏提示(UI-5) ---- */
  const mobileGate = document.createElement("div");
  mobileGate.className = "mobile-gate";
  mobileGate.innerHTML = `<div><h2>Aether Model D</h2><p>请使用桌面或平板浏览器打开</p><p class="dim">Please open on a desktop or tablet browser</p></div>`;
  const applyMobile = () => {
    const narrow = window.innerWidth <= 760;
    mobileGate.style.display = narrow ? "flex" : "none";
  };
  applyMobile();
  window.addEventListener("resize", applyMobile);
  root.appendChild(mobileGate);

  /* ---- WebGL 上下文丢失提示 ---- */
  const lost = document.createElement("div");
  lost.className = "mobile-gate";
  lost.style.display = "none";
  lost.innerHTML = `<div><h2>渲染上下文丢失</h2><p>请刷新页面(Windows: Ctrl+R / macOS: ⌘R)</p></div>`;
  root.appendChild(lost);

  document.body.appendChild(root);

  /* ---- 视角 / 面板按钮行为 ---- */
  btnView.addEventListener("click", () => hooks.onViewToggle());
  btnHinge.addEventListener("click", () => hooks.onHingeToggle());

  const setViewLabel = () => {
    btnView.innerHTML = hooks.is2d()
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8V5H3v3M3 16v3h18v-3"/><path d="M12 3v18"/></svg><span>3D</span>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="10" rx="1"/><path d="M6 12h.01M10 12h2M14 12h2M18 12h.01"/></svg><span>2D</span>`;
  };
  const setHingeLabel = () => {
    btnHinge.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20V9l9-5 9 5v11"/><path d="M3 9h18"/></svg><span>Panel</span>`;
  };
  setViewLabel();
  setHingeLabel();

  return {
    root,
    showToast(message, ms = 3200) {
      toast.textContent = message;
      toast.style.display = "block";
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toast.style.display = "none";
      }, ms);
    },
    hideGate() {
      gate.style.display = "none";
    },
    setViewLabel,
    setHingeVisible(visible) {
      btnHinge.style.display = visible ? "" : "none";
    },
    openKeymap: () => {
      keymapModal.style.display = "flex";
    },
    dispose() {
      document.body.removeChild(root);
    },
  };
}
