import "../styles.css";

/**
 * HTML 覆盖层 UI(§5.7):真实 DOM、可键盘聚焦、支持 reduced-motion。
 * 工具栏(视角/面板/静音)、帮助、引导气泡、加载页、声音解锁、toast、兼容模式徽标。
 */

export type ViewMode = "3d" | "2d";

const svg = {
  cube: `<svg viewBox="0 0 24 24"><path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>`,
  flat: `<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M6 20h12"/></svg>`,
  hingeUp: `<svg viewBox="0 0 24 24"><path d="M4 18 18 6"/><path d="M4 6h14v12"/></svg>`,
  hingeDown: `<svg viewBox="0 0 24 24"><path d="M4 18h16"/><path d="M4 6l14 12"/></svg>`,
  volOn: `<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg>`,
  volOff: `<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9.5l4 5M20 9.5l-4 5"/></svg>`,
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  html?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export interface OverlayCallbacks {
  onViewMode(mode: ViewMode): void;
  onHingeToggle(): void;
  onMute(muted: boolean): void;
  onUnlock(): void;
  onResetFactory(): void;
  onPreset(id: string): void;
  onShareUrl(): void;
  onExtFile(file: File): void;
}

export class Overlay {
  root: HTMLElement;
  private viewBtns: Record<ViewMode, HTMLButtonElement>;
  private hingeBtn!: HTMLButtonElement;
  private muteBtn!: HTMLButtonElement;
  private helpModal: HTMLElement | null = null;
  private onboardEl: HTMLElement | null = null;
  private compatEl!: HTMLElement;
  private toastStack: HTMLElement;
  private unlockEl: HTMLElement | null = null;
  private filterMode: "worklet" | "biquad" = "worklet";

  constructor(private cb: OverlayCallbacks) {
    this.root = el("div");
    const overlayRoot = document.getElementById("overlay-root")!;
    overlayRoot.appendChild(this.root);

    // ---- 工具栏(UI-1)----
    const toolbar = el("div", "toolbar");
    const seg = el("div", "segmented");
    this.viewBtns = {
      "3d": el("button", "active", `${svg.cube}<span style="margin-left:6px">3D</span>`),
      "2d": el("button", "", `${svg.flat}<span style="margin-left:6px">2D</span>`),
    };
    this.viewBtns["3d"].addEventListener("click", () => cb.onViewMode("3d"));
    this.viewBtns["2d"].addEventListener("click", () => cb.onViewMode("2d"));
    for (const b of [this.viewBtns["3d"], this.viewBtns["2d"]]) {
      b.title = "切换视角(V)";
      seg.appendChild(b);
    }
    this.hingeBtn = el("button", `${svg.hingeUp}<span style="margin-left:6px">放平面板</span>`);
    this.hingeBtn.title = "立起 / 放平面板(H)";
    this.hingeBtn.addEventListener("click", () => cb.onHingeToggle());
    this.muteBtn = el("button", "icon-btn", svg.volOn);
    this.muteBtn.title = "浏览器静音(独立于面板音量)";
    this.muteBtn.setAttribute("aria-label", "静音");
    this.muteBtn.addEventListener("click", () => {
      const muted = this.muteBtn.classList.toggle("active");
      this.muteBtn.innerHTML = muted ? svg.volOff : svg.volOn;
      cb.onMute(muted);
    });
    toolbar.appendChild(seg);
    toolbar.appendChild(this.hingeBtn);
    toolbar.appendChild(this.muteBtn);
    this.root.appendChild(toolbar);

    // ---- 帮助入口(UI-2)----
    const helpBtn = el("button", "help-btn", "?");
    helpBtn.title = "帮助(?)";
    helpBtn.setAttribute("aria-label", "帮助");
    helpBtn.addEventListener("click", () => this.toggleHelp());
    this.root.appendChild(helpBtn);

    // ---- 兼容模式徽标(默认隐藏)----
    this.compatEl = el("div", "compat-badge", "");
    this.compatEl.style.display = "none";
    this.root.appendChild(this.compatEl);

    // ---- toast 栈 ----
    this.toastStack = el("div", "toast-stack");
    this.root.appendChild(this.toastStack);
  }

  setViewMode(mode: ViewMode): void {
    this.viewBtns["3d"].classList.toggle("active", mode === "3d");
    this.viewBtns["2d"].classList.toggle("active", mode === "2d");
    this.hingeBtn.style.display = mode === "3d" ? "" : "none";
  }

  setHingeRaised(raised: boolean): void {
    this.hingeBtn.innerHTML = raised
      ? `${svg.hingeDown}<span style="margin-left:6px">放平面板</span>`
      : `${svg.hingeUp}<span style="margin-left:6px">立起面板</span>`;
  }

  setFilterMode(mode: "worklet" | "biquad"): void {
    this.filterMode = mode;
    if (mode === "biquad") {
      this.compatEl.textContent = "过滤器:兼容模式(无自激)";
      this.compatEl.style.display = "";
    } else {
      this.compatEl.style.display = "none";
    }
  }

  toast(text: string, warn = false): void {
    const t = el("div", `toast${warn ? " warn" : ""}`, text);
    this.toastStack.appendChild(t);
    setTimeout(() => {
      t.style.transition = "opacity .3s";
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 320);
    }, 2400);
  }

  // ---------- 加载页(PRD 附录 B)----------
  showSplash(onProgress: (p: number) => void, onDone: () => void): void {
    const splash = el("div", "splash");
    splash.innerHTML = `
      <div class="splash-inner">
        <div class="logo">AETHER</div>
        <div class="sub">MODEL D</div>
        <div class="splash-bar"><i></i></div>
      </div>`;
    this.root.appendChild(splash);
    const bar = splash.querySelector("i") as HTMLElement;
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(1, p + 0.12 + Math.random() * 0.1);
      bar.style.width = `${p * 100}%`;
      onProgress(p);
      if (p >= 1) {
        clearInterval(timer);
        setTimeout(() => {
          splash.classList.add("done");
          setTimeout(() => splash.remove(), 500);
          onDone();
        }, 180);
      }
    }, 90);
  }

  // ---------- 声音解锁(AUD-14)----------
  showUnlock(): void {
    const unlock = el("div", "unlock");
    unlock.setAttribute("role", "button");
    unlock.innerHTML = `
      <div class="unlock-card">
        <h1>AETHER</h1>
        <div class="model-d">MODEL D</div>
        <p>点击任意处开启声音</p>
      </div>`;
    unlock.addEventListener("pointerdown", () => {
      this.closeUnlock();
      this.cb.onUnlock();
    });
    this.unlockEl = unlock;
    this.root.appendChild(unlock);
  }

  closeUnlock(): void {
    this.unlockEl?.remove();
    this.unlockEl = null;
  }

  get unlockVisible(): boolean {
    return this.unlockEl !== null;
  }

  // ---------- 引导气泡(UI-3,可跳过、不重复出现)----------
  showOnboarding(step: number): void {
    this.onboardEl?.remove();
    const steps = [
      { h: "试试演奏", p: "用鼠标按下琴键,或转动面板上的旋钮 —— 一切都是真实的。" },
      { h: "掀开面板", p: "点击右上角「放平面板 / 立起面板」,或按 H 感受铰链面板。" },
      { h: "切换视角", p: "点击「2D」获得正视操作视角,「3D」自由环绕观察(V 键)。" },
    ];
    if (step >= steps.length) {
      this.onboardEl = null;
      return;
    }
    const s = steps[step];
    const card = el("div", "onboard");
    card.innerHTML = `<h3>${s.h}</h3><p>${s.p}</p>
      <div class="row">
        <span class="dots">${"●".repeat(step + 1)}${"○".repeat(steps.length - step - 1)}</span>
        <span><button class="skip" style="margin-right:6px">跳过</button><button class="next">下一步</button></span>
      </div>`;
    card.querySelector(".skip")!.addEventListener("click", () => this.closeOnboarding());
    card.querySelector(".next")!.addEventListener("click", () => this.showOnboarding(step + 1));
    this.onboardEl = card;
    this.root.appendChild(card);
  }

  closeOnboarding(): void {
    this.onboardEl?.remove();
    this.onboardEl = null;
  }

  get onboardingActive(): boolean {
    return this.onboardEl !== null;
  }

  // ---------- 帮助模态(UI-2)----------
  toggleHelp(force?: boolean): void {
    if (this.helpModal && (force === undefined || force === false)) {
      this.helpModal.remove();
      this.helpModal = null;
      return;
    }
    if (!this.helpModal && (force === undefined || force === true)) this.buildHelp();
  }

  private buildHelp(): void {
    const veil = el("div", "modal-veil");
    const modal = el("div", "modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-label", "帮助");
    const filterInfo =
      this.filterMode === "biquad"
        ? `<div class="compat">当前使用 <b>兼容模式</b> 梯形滤波器(无自激)。</div>`
        : `<div class="compat">梯形滤波器:AudioWorklet 全速模式(支持自激)。</div>`;
    modal.innerHTML = `
      <h2>Aether Model D</h2>
      <div class="modal-sub">致敬经典形态的自研网页合成器 · 单音 · 三振荡器 · 梯形滤波器</div>
      ${filterInfo}
      <h4>鼠标手势</h4>
      <table>
        <tr><td>旋钮</td><td>按住上下拖动;Shift = 精调;双击 = 复位;滚轮 = 微调</td></tr>
        <tr><td>档位旋钮</td><td>单击进档;按住沿圆弧拖动换档</td></tr>
        <tr><td>开关</td><td>单击切换</td></tr>
        <tr><td>琴键</td><td>按下发声;按住滑动 = 滑奏</td></tr>
        <tr><td>音高轮 / 调制轮</td><td>上下拖动;音高轮松手回中,调制轮保持</td></tr>
        <tr><td>面板前缘</td><td>3D 视角下拖拽调整面板角度</td></tr>
        <tr><td>背景空白处</td><td>左键旋转 / 右键平移 / 滚轮缩放(3D 视角)</td></tr>
      </table>
      <h4>电脑键盘演奏</h4>
      <table>
        <tr><td><kbd>A</kbd><kbd>W</kbd><kbd>S</kbd><kbd>E</kbd><kbd>D</kbd>…</td><td>从基准音(C4)起的半音上行</td></tr>
        <tr><td><kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd><kbd>V</kbd>…</td><td>低一个八度的白键区</td></tr>
        <tr><td><kbd>-</kbd> / <kbd>=</kbd></td><td>基准八度 ↓ / ↑(F2–C6 内钳位)</td></tr>
      </table>
      <h4>快捷键</h4>
      <table>
        <tr><td><kbd>V</kbd></td><td>3D / 2D 视角切换</td></tr>
        <tr><td><kbd>H</kbd></td><td>面板立起 / 放平</td></tr>
        <tr><td><kbd>空格</kbd></td><td>All Notes Off(panic)</td></tr>
        <tr><td><kbd>?</kbd></td><td>本帮助面板</td></tr>
      </table>
      <div class="modal-actions">
        <select id="preset-select" aria-label="音色预设"></select>
        <button id="share-btn">复制分享链接</button>
        <label style="font-size:12.5px">外部输入:<input id="ext-file" type="file" accept="audio/*" style="font-size:12px;max-width:180px"/></label>
        <button id="reset-btn" style="color:var(--danger)">恢复出厂</button>
      </div>`;
    veil.appendChild(modal);
    veil.addEventListener("pointerdown", (e) => {
      if (e.target === veil) this.toggleHelp(false);
    });
    this.root.appendChild(veil);
    this.helpModal = veil;

    const select = modal.querySelector("#preset-select") as HTMLSelectElement;
    import("../state/presets").then(({ PRESETS }) => {
      for (const p of PRESETS) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
      }
    });
    select.addEventListener("change", () => this.cb.onPreset(select.value));
    modal.querySelector("#share-btn")!.addEventListener("click", () => this.cb.onShareUrl());
    modal.querySelector("#reset-btn")!.addEventListener("click", () => {
      this.cb.onResetFactory();
      this.toggleHelp(false);
    });
    modal.querySelector("#ext-file")!.addEventListener("change", (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) this.cb.onExtFile(f);
    });
  }

  get helpOpen(): boolean {
    return this.helpModal !== null;
  }
}
