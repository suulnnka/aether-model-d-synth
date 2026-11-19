import { ONBOARDING_STEPS } from "../data/onboarding.ts";
import type { SynthModel } from "../model/synth.ts";
import type { CameraRig } from "../scene/cameraRig.ts";

export interface OnboardingCallbacks {
  onPanelAngle?: (deg: number) => void;
  onComplete?: () => void;
  onSkip?: () => void;
}

export class OnboardingTour {
  private index = 0;
  private active = false;
  private card: HTMLElement;
  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private stepEl: HTMLElement;
  private prevBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private highlightedEl: Element | null = null;

  constructor(
    host: HTMLElement,
    private readonly rig: CameraRig,
    private readonly model: SynthModel,
    private readonly cb: OnboardingCallbacks = {},
  ) {
    this.card = document.createElement("aside");
    this.card.className = "tour-card hidden";
    this.card.setAttribute("role", "dialog");
    this.card.setAttribute("aria-label", "Interactive Synthesizer Tour");
    this.card.innerHTML = `
      <div class="tour-head">
        <span class="tour-step" data-tour="step"></span>
        <button type="button" class="tour-skip" data-tour="skip">跳过导览</button>
      </div>
      <h3 class="tour-title" data-tour="title"></h3>
      <p class="tour-body" data-tour="body"></p>
      <div class="tour-actions">
        <button type="button" class="btn-ghost" data-tour="prev">上一步</button>
        <button type="button" class="btn-amber" data-tour="next">下一步</button>
      </div>
    `;
    host.appendChild(this.card);

    this.titleEl = this.card.querySelector('[data-tour="title"]')!;
    this.bodyEl = this.card.querySelector('[data-tour="body"]')!;
    this.stepEl = this.card.querySelector('[data-tour="step"]')!;
    this.prevBtn = this.card.querySelector('[data-tour="prev"]') as HTMLButtonElement;
    this.nextBtn = this.card.querySelector('[data-tour="next"]') as HTMLButtonElement;

    this.card.querySelector('[data-tour="skip"]')!.addEventListener("click", () => {
      this.stop();
      this.cb.onSkip?.();
    });
    this.prevBtn.addEventListener("click", () => {
      if (this.index > 0) this.goTo(this.index - 1);
    });
    this.nextBtn.addEventListener("click", () => {
      if (this.index >= ONBOARDING_STEPS.length - 1) {
        this.stop();
        this.cb.onComplete?.();
      } else {
        this.goTo(this.index + 1);
      }
    });
  }

  isActive(): boolean {
    return this.active;
  }

  start(): void {
    this.active = true;
    this.card.classList.remove("hidden");
    this.goTo(0);
  }

  stop(): void {
    this.active = false;
    this.card.classList.add("hidden");
    this.clearHighlight();
  }

  private clearHighlight(): void {
    if (this.highlightedEl) {
      this.highlightedEl.classList.remove("tour-highlight");
      this.highlightedEl = null;
    }
  }

  private goTo(idx: number): void {
    this.index = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, idx));
    const step = ONBOARDING_STEPS[this.index];

    this.stepEl.textContent = `GUIDE · ${this.index + 1} / ${ONBOARDING_STEPS.length}`;
    this.titleEl.textContent = step.title;
    this.bodyEl.textContent = step.body;
    this.prevBtn.disabled = this.index === 0;
    this.nextBtn.textContent =
      this.index === ONBOARDING_STEPS.length - 1 ? "开始演奏" : "下一步";

    if (step.cameraPreset) {
      this.rig.goToPreset(step.cameraPreset);
    }
    if (typeof step.panelAngleDeg === "number") {
      this.model.setPanelAngle(step.panelAngleDeg);
      this.cb.onPanelAngle?.(step.panelAngleDeg);
    }

    this.clearHighlight();
    if (step.hudTarget) {
      const target = document.querySelector(step.hudTarget);
      if (target) {
        target.classList.add("tour-highlight");
        this.highlightedEl = target;
      }
    }
  }
}
