/**
 * HTML 覆盖层 UI(UI-1 ~ UI-4)
 * 真实 DOM、可键盘聚焦、prefers-reduced-motion 友好。
 */

export interface OverlayCallbacks {
  toggleView: () => void;
  toggleHinge: () => void;
  onFactoryReset: () => void;
}

export class Overlay {
  private viewBtn: HTMLButtonElement;
  private hingeBtn: HTMLButtonElement;
  private helpDialog: HTMLDivElement;
  private guide: HTMLDivElement;
  private soundHint: HTMLDivElement;
  private degradedBadge: HTMLDivElement;
  seenGuide = false;

  constructor(private root: HTMLElement, private cb: OverlayCallbacks) {
    root.innerHTML = "";

    /* 右上角控制区(UI-1) */
    const topRight = document.createElement("div");
    topRight.className = "aether-topright";
    this.viewBtn = mkBtn("2D 视角", () => cb.toggleView());
    this.viewBtn.title = "切换 2D / 3D 视角(快捷键 V)";
    this.hingeBtn = mkBtn("放平面板", () => cb.toggleHinge());
    this.hingeBtn.title = "立起 / 放平铰链面板(快捷键 H)";
    topRight.append(this.viewBtn, this.hingeBtn);
    root.appendChild(topRight);

    /* 滤波器兼容模式提示(AUD-6 降级) */
    this.degradedBadge = document.createElement("div");
    this.degradedBadge.className = "aether-badge";
    this.degradedBadge.textContent = "滤波器:兼容模式";
    this.degradedBadge.style.display = "none";
    root.appendChild(this.degradedBadge);

    /* 左下角帮助(UI-2) */
    const bottomLeft = document.createElement("div");
    bottomLeft.className = "aether-bottomleft";
    const helpBtn = mkBtn("?", () => this.toggleHelp());
    helpBtn.title = "帮助(快捷键 ?)";
    helpBtn.setAttribute("aria-label", "帮助");
    bottomLeft.appendChild(helpBtn);
    root.appendChild(bottomLeft);

    this.helpDialog = document.createElement("div");
    this.helpDialog.className = "aether-help";
    this.helpDialog.hidden = true;
    this.helpDialog.innerHTML = `
      <h2>Aether Model D — 帮助</h2>
      <h3>鼠标手势</h3>
      <ul>
        <li><b>旋钮</b>:按住上下拖动;Shift = 精调 ×0.1;双击恢复默认;滚轮微调</li>
        <li><b>档位旋钮</b>:单击循环进档,或沿圆弧拖动换档</li>
        <li><b>开关</b>:单击切换</li>
        <li><b>琴键</b>:按下发声,按住滑过相邻键 = 滑奏</li>
        <li><b>音高轮</b>:拖动后松手回中;<b>调制轮</b>:拖动后保持</li>
        <li><b>面板前缘</b>:拖动调节立起角度(0–60°)</li>
      </ul>
      <h3>电脑键盘演奏</h3>
      <ul>
        <li><code>A W S E D F T G Y H U J K O L P ; '</code> — 自 C4 起半音上行</li>
        <li><code>Z X C V B N M , . /</code> — 低一个八度白键区</li>
        <li><code>- / =</code> — 基准八度下移 / 上移(F2–C6 内钳位)</li>
      </ul>
      <h3>快捷键</h3>
      <ul>
        <li><code>V</code> 切换 2D/3D 视角 · <code>H</code> 立起/放平面板 · <code>?</code> 帮助</li>
        <li><code>空格</code> 全部音符释放(panic)</li>
      </ul>
      <div class="aether-help-actions">
        <button class="aether-btn" data-act="reset">恢复出厂</button>
        <button class="aether-btn" data-act="close">关闭</button>
      </div>
    `;
    this.helpDialog.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        if (b.getAttribute("data-act") === "reset") cb.onFactoryReset();
        this.toggleHelp();
      })
    );
    root.appendChild(this.helpDialog);

    /* 首次引导(UI-3) */
    this.guide = document.createElement("div");
    this.guide.className = "aether-guide";
    this.guide.hidden = true;
    this.guide.innerHTML = `
      <div class="aether-guide-card">
        <b>欢迎使用 Aether Model D</b>
        <p>① 点击画面开启声音<br/>② 转动旋钮、按下琴键试听<br/>③ 右上角切换 2D / 3D 视角,掀开面板</p>
        <button class="aether-btn" data-act="skip">开始</button>
      </div>`;
    this.guide.querySelector("button")!.addEventListener("click", () => this.dismissGuide());
    root.appendChild(this.guide);

    /* 首次声音激活提示(AUD-14) */
    this.soundHint = document.createElement("div");
    this.soundHint.className = "aether-soundhint";
    this.soundHint.textContent = "点击任意处开启声音";
    this.soundHint.hidden = true;
    root.appendChild(this.soundHint);

    document.getElementById("boot-loading")?.classList.add("done");
  }

  showSoundHint() { this.soundHint.hidden = false; }
  hideSoundHint() { this.soundHint.hidden = true; }
  showGuide() { if (!this.seenGuide) this.guide.hidden = false; }
  private dismissGuide() { this.guide.hidden = true; this.seenGuide = true; }
  skipGuideIfShown() { if (!this.guide.hidden) this.dismissGuide(); }

  toggleHelp() { this.helpDialog.hidden = !this.helpDialog.hidden; }
  closeHelp() { this.helpDialog.hidden = true; }

  /** 视角按钮文案与面板按钮可见性(UI-1:面板按钮仅 3D 可见) */
  setViewMode(mode: "3d" | "2d") {
    this.viewBtn.textContent = mode === "3d" ? "2D 视角" : "3D 视角";
    this.hingeBtn.style.display = mode === "3d" ? "" : "none";
  }
  setHingeRaised(raised: boolean) {
    this.hingeBtn.textContent = raised ? "放平面板" : "立起面板";
  }
  setDegraded(d: boolean) {
    this.degradedBadge.style.display = d ? "" : "none";
  }
}

function mkBtn(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "aether-btn";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}
