import type { SynthEngine } from "../audio/engine.ts";
import { CONTROL_TOOLTIPS } from "../data/tooltips.ts";
import type { HoverInfo } from "../interaction/interactions.ts";
import type { SynthModel } from "../model/synth.ts";
import type { CameraRig } from "../scene/cameraRig.ts";
import type { ParamStore } from "../state/paramStore.ts";
import { buildShareUrl, saveActivePresetId, saveUserOptions } from "../state/persist.ts";
import {
  createUserPreset,
  deleteUserPreset,
  getAllPresets,
  getPresetById,
} from "../state/presets.ts";
import { SPEC_BY_ID, formatControlValue } from "../state/specs.ts";
import type {
  ControlId,
  Preset,
  PresetCategory,
  UserOptions,
  ViewMode,
  ViewState,
} from "../state/types.ts";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function formatMidiNote(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  return `${name}${oct}`;
}

export interface OverlayCallbacks {
  onViewChange: (mode: ViewMode) => void;
  onCameraPreset: (preset: ViewState["cameraPreset"]) => void;
  onPanelAngle: (deg: number) => void;
  onPresetApplied: (preset: Preset) => void;
  onResetPatch: () => void;
  onOctaveShift: (delta: number) => void;
  onPanic: () => void;
  onStartTour: () => void;
  onFirstGesture: () => void;
}

export class StudioOverlay {
  private topBar: HTMLElement;
  private bottomBar: HTMLElement;
  private presetBtn: HTMLButtonElement;
  private presetNameEl: HTMLElement;
  private presetDrawer: HTMLElement;
  private presetListEl: HTMLElement;
  private presetSearchEl: HTMLInputElement;
  private effectsRackDelay: HTMLElement;
  private effectsRackReverb: HTMLElement;
  private optionsPopover: HTMLElement;
  private qwertyCard: HTMLElement;
  private scopeCard: HTMLElement;
  private scopeCanvas: HTMLCanvasElement;
  private scopeCtx: CanvasRenderingContext2D;
  private tooltipEl: HTMLElement;
  private magnifierEl: HTMLElement;
  private toastEl: HTMLElement;
  private audioBannerEl: HTMLButtonElement;
  private tiltInput: HTMLInputElement;
  private tiltValEl: HTMLElement;
  private viewBtn: HTMLButtonElement;
  private noteReadoutEl: HTMLElement;
  private midiBadgeEl: HTMLElement;
  private octaveLabelEl: HTMLElement;
  private overloadBadgeEl: HTMLElement;

  private activeCategory: PresetCategory | "All" = "All";
  private activePresetId: string | null = null;
  private toastTimer: number | null = null;
  private fxWidgets = new Map<ControlId, () => void>();

  constructor(
    host: HTMLElement,
    private readonly store: ParamStore,
    private readonly engine: SynthEngine,
    private readonly model: SynthModel,
    private readonly rig: CameraRig,
    private options: UserOptions,
    private readonly cb: OverlayCallbacks,
  ) {
    // ── Top Studio Toolbar ──────────────────────────────────────────
    this.topBar = document.createElement("header");
    this.topBar.className = "studio-topbar";
    this.topBar.innerHTML = `
      <div class="tb-brand">
        <span class="tb-logo-mark" aria-hidden="true"></span>
        <div class="tb-title-group">
          <span class="tb-name">AETHER</span>
          <span class="tb-model">Model D</span>
        </div>
      </div>

      <div class="tb-group">
        <button type="button" class="tb-btn tb-preset-btn" data-hud="presets" id="btn-presets">
          <span class="tb-k">PRESET</span>
          <span class="tb-v" data-role="preset-name">Classic Model D Lead</span>
        </button>
        <button type="button" class="tb-btn" data-hud="effects" id="btn-effects">
          Effects <span class="tb-dot" data-role="fx-dot"></span>
        </button>
        <button type="button" class="tb-btn" data-hud="share" id="btn-share">
          Share URL
        </button>
      </div>

      <div class="tb-group">
        <button type="button" class="tb-btn" id="btn-view-toggle">2D View</button>
        <div class="tb-seg" role="group" aria-label="Camera Presets">
          <button type="button" class="seg-btn active" data-cam="overview">Overview</button>
          <button type="button" class="seg-btn" data-cam="panel">Panel</button>
          <button type="button" class="seg-btn" data-cam="keys">Keys</button>
          <button type="button" class="seg-btn" data-cam="rear">Rear</button>
        </div>
        <label class="tb-tilt">
          <span>Tilt</span>
          <input type="range" id="tilt-slider" min="0" max="75" step="1" value="52" />
          <span class="tb-tilt-val" data-role="tilt-val">52°</span>
        </label>
      </div>

      <div class="tb-group">
        <button type="button" class="tb-btn" id="btn-options">Options</button>
      </div>
    `;
    host.appendChild(this.topBar);

    this.presetBtn = this.topBar.querySelector("#btn-presets") as HTMLButtonElement;
    this.presetNameEl = this.topBar.querySelector('[data-role="preset-name"]')!;
    this.tiltInput = this.topBar.querySelector("#tilt-slider") as HTMLInputElement;
    this.tiltValEl = this.topBar.querySelector('[data-role="tilt-val"]')!;
    this.viewBtn = this.topBar.querySelector("#btn-view-toggle") as HTMLButtonElement;

    // ── Preset Drawer ───────────────────────────────────────────────
    this.presetDrawer = document.createElement("section");
    this.presetDrawer.className = "popover-panel preset-drawer hidden";
    this.presetDrawer.innerHTML = `
      <div class="pop-header">
        <div>
          <h3>Preset Library</h3>
          <p class="pop-sub">35 Classic Analog Patches &amp; Custom User Banks</p>
        </div>
        <button type="button" class="btn-icon" data-close="preset">✕</button>
      </div>
      <div class="preset-controls">
        <input type="search" class="studio-input" id="preset-search" placeholder="Search presets…" />
        <div class="cat-tabs" id="preset-cats"></div>
      </div>
      <div class="preset-list" id="preset-list"></div>
      <form class="save-preset-form" id="save-preset-form">
        <input type="text" class="studio-input" id="save-preset-name" placeholder="New user preset name…" maxlength="36" />
        <button type="submit" class="btn-amber">Save Patch</button>
        <button type="button" class="btn-ghost" id="btn-reset-init">Init</button>
      </form>
    `;
    host.appendChild(this.presetDrawer);
    this.presetListEl = this.presetDrawer.querySelector("#preset-list")!;
    this.presetSearchEl = this.presetDrawer.querySelector("#preset-search") as HTMLInputElement;

    // ── Floating Draggable Effects Racks (Delay + Reverb) ───────────
    const delayLeft = Math.max(16, window.innerWidth - 544);
    const reverbLeft = Math.max(16, window.innerWidth - 274);
    this.effectsRackDelay = this.buildEffectsRack(
      host,
      "Tape Delay",
      "delay",
      [
        { id: "delayMix", label: "Mix" },
        { id: "delayTime", label: "Time" },
        { id: "delayFeedback", label: "Feedback" },
      ],
      "delayEnabled",
      { left: `${delayLeft}px`, top: "74px" },
    );

    this.effectsRackReverb = this.buildEffectsRack(
      host,
      "Studio Reverb",
      "reverb",
      [
        { id: "reverbMix", label: "Amount" },
        { id: "reverbTone", label: "Tone" },
      ],
      "reverbEnabled",
      { left: `${reverbLeft}px`, top: "74px" },
    );

    // ── Options Popover ─────────────────────────────────────────────
    this.optionsPopover = document.createElement("section");
    this.optionsPopover.className = "popover-panel options-popover hidden";
    this.optionsPopover.innerHTML = `
      <div class="pop-header">
        <h3>Studio Options</h3>
        <button type="button" class="btn-icon" data-close="options">✕</button>
      </div>
      <div class="opt-list">
        <label class="opt-row">
          <div>
            <strong>Learning Mode (Tooltips)</strong>
            <span>Hover 3D knobs &amp; switches for synthesis tips</span>
          </div>
          <input type="checkbox" data-opt="learningMode" />
        </label>
        <label class="opt-row">
          <div>
            <strong>Knob Magnifier HUD</strong>
            <span>Show precision dial overlay while dragging knobs</span>
          </div>
          <input type="checkbox" data-opt="magnifyKnobs" />
        </label>
        <label class="opt-row">
          <div>
            <strong>Live Oscilloscope</strong>
            <span>Real-time phosphor output waveform &amp; level meter</span>
          </div>
          <input type="checkbox" data-opt="showScope" />
        </label>
        <label class="opt-row">
          <div>
            <strong>QWERTY Piano Map</strong>
            <span>Display computer keyboard key bindings</span>
          </div>
          <input type="checkbox" data-opt="showQwertyGuide" />
        </label>
      </div>
      <div class="opt-footer">
        <button type="button" class="btn-amber" id="btn-restart-tour">Start 13-Step Guided Tour</button>
      </div>
    `;
    host.appendChild(this.optionsPopover);

    // ── QWERTY Keyboard Guide ───────────────────────────────────────
    this.qwertyCard = document.createElement("aside");
    this.qwertyCard.className = "qwerty-guide hidden";
    this.qwertyCard.innerHTML = `
      <div class="qg-head">
        <span>QWERTY Keyboard Map</span>
        <button type="button" class="btn-icon" data-close="qwerty">✕</button>
      </div>
      <div class="qg-rows">
        <div><strong>Lower Oct:</strong> <code>Z S X D C V G B H N J M ,</code></div>
        <div><strong>Upper Oct:</strong> <code>Q 2 W 3 E R 5 T 6 Y 7 U I</code></div>
        <div><strong>Octave / Bend:</strong> <code>[ / ]</code> Octave · <code>← / →</code> Pitch · <code>Esc</code> Panic</div>
      </div>
    `;
    host.appendChild(this.qwertyCard);

    // ── Mini Oscilloscope ───────────────────────────────────────────
    this.scopeCard = document.createElement("aside");
    this.scopeCard.className = "scope-card";
    this.scopeCard.innerHTML = `
      <div class="scope-head">
        <span>OSCILLOSCOPE</span>
        <span class="scope-ovl" data-role="scope-ovl">NOMINAL</span>
      </div>
      <canvas width="220" height="64" class="scope-canvas"></canvas>
    `;
    host.appendChild(this.scopeCard);
    this.scopeCanvas = this.scopeCard.querySelector("canvas")!;
    this.scopeCtx = this.scopeCanvas.getContext("2d")!;
    this.overloadBadgeEl = this.scopeCard.querySelector('[data-role="scope-ovl"]')!;

    // ── Learning Tooltip & Knob Magnifier ───────────────────────────
    this.tooltipEl = document.createElement("div");
    this.tooltipEl.className = "learning-tooltip hidden";
    host.appendChild(this.tooltipEl);

    this.magnifierEl = document.createElement("div");
    this.magnifierEl.className = "knob-magnifier hidden";
    host.appendChild(this.magnifierEl);

    // ── Toast & Audio Gate Banner ───────────────────────────────────
    this.toastEl = document.createElement("div");
    this.toastEl.className = "studio-toast hidden";
    host.appendChild(this.toastEl);

    this.audioBannerEl = document.createElement("button");
    this.audioBannerEl.type = "button";
    this.audioBannerEl.className = "audio-gate-pill";
    this.audioBannerEl.innerHTML = `
      <span class="gate-led"></span>
      <span>点击琴键或页面任意位置启动 3D 模拟音频引擎</span>
    `;
    host.appendChild(this.audioBannerEl);

    // ── Bottom Status & Performance Strip ───────────────────────────
    this.bottomBar = document.createElement("footer");
    this.bottomBar.className = "studio-bottombar";
    this.bottomBar.innerHTML = `
      <div class="bb-left">
        <span class="bb-chip" data-role="note-readout">READY · —</span>
        <div class="bb-oct">
          <button type="button" class="btn-mini" id="btn-oct-down">− Oct</button>
          <span data-role="oct-label">Base C3</span>
          <button type="button" class="btn-mini" id="btn-oct-up">+ Oct</button>
        </div>
        <button type="button" class="btn-mini" id="btn-panic" title="All Notes Off (Esc)">Panic</button>
      </div>
      <div class="bb-right">
        <span class="bb-hint">Drag blank: Orbit · Drag knob: Adjust (Shift = Fine, Dbl-Click = Reset)</span>
        <span class="bb-chip" data-role="midi-badge">MIDI: Listening</span>
      </div>
    `;
    host.appendChild(this.bottomBar);
    this.noteReadoutEl = this.bottomBar.querySelector('[data-role="note-readout"]')!;
    this.octaveLabelEl = this.bottomBar.querySelector('[data-role="oct-label"]')!;
    this.midiBadgeEl = this.bottomBar.querySelector('[data-role="midi-badge"]')!;

    this.wireEvents();
    this.renderPresetCategories();
    this.renderPresetList();
    this.syncOptionsUI();
    this.updateFxDot();
  }

  private buildEffectsRack(
    host: HTMLElement,
    title: string,
    key: string,
    knobs: Array<{ id: ControlId; label: string }>,
    switchId: ControlId,
    pos: { left: string; top: string },
  ): HTMLElement {
    const panel = document.createElement("section");
    panel.className = "fx-rack hidden";
    panel.style.left = pos.left;
    panel.style.top = pos.top;

    panel.innerHTML = `
      <div class="fx-header" data-drag="${key}">
        <span class="fx-title">${title}</span>
        <div class="fx-head-actions">
          <button type="button" class="fx-power-btn" data-fx-switch="${switchId}">OFF</button>
          <button type="button" class="btn-icon" data-close="fx-${key}">✕</button>
        </div>
      </div>
      <div class="fx-knobs" data-role="knobs"></div>
    `;
    host.appendChild(panel);

    // Switch binding
    const swBtn = panel.querySelector(`[data-fx-switch="${switchId}"]`) as HTMLButtonElement;
    const updateSw = () => {
      const on = this.store.getBool(switchId);
      swBtn.textContent = on ? "ON" : "BYPASS";
      swBtn.classList.toggle("on", on);
    };
    swBtn.addEventListener("click", () => {
      this.cb.onFirstGesture();
      this.store.set(switchId, this.store.getBool(switchId) ? 0 : 1);
    });
    this.fxWidgets.set(switchId, updateSw);
    updateSw();

    // Knobs binding
    const knobHost = panel.querySelector('[data-role="knobs"]')!;
    for (const k of knobs) {
      const spec = SPEC_BY_ID[k.id];
      const cell = document.createElement("div");
      cell.className = "fx-knob-cell";
      cell.innerHTML = `
        <svg viewBox="0 0 64 64" class="fx-dial" role="slider" aria-label="${spec.label}">
          <circle cx="32" cy="32" r="24" class="dial-track" />
          <path class="dial-arc" fill="none" stroke-width="3.5" stroke-linecap="round" />
          <circle cx="32" cy="32" r="18" class="dial-cap" />
          <line x1="32" y1="32" x2="32" y2="16" class="dial-needle" />
        </svg>
        <div class="fx-knob-label">${k.label}</div>
        <div class="fx-knob-val"></div>
      `;
      knobHost.appendChild(cell);

      const svg = cell.querySelector("svg")!;
      const arc = cell.querySelector(".dial-arc") as SVGPathElement;
      const needle = cell.querySelector(".dial-needle") as SVGLineElement;
      const valEl = cell.querySelector(".fx-knob-val")!;

      const syncKnob = () => {
        const val = this.store.get(k.id);
        const norm = (val - spec.min) / (spec.max - spec.min || 1);
        const deg = -135 + norm * 270;
        needle.setAttribute("transform", `rotate(${deg} 32 32)`);
        arc.setAttribute("d", describeArc(32, 32, 24, -135, deg));
        valEl.textContent = formatControlValue(k.id, val);
      };

      let dragState: { startY: number; startVal: number } | null = null;
      svg.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.cb.onFirstGesture();
        dragState = { startY: e.clientY, startVal: this.store.get(k.id) };
        svg.setPointerCapture(e.pointerId);
      });
      svg.addEventListener("pointermove", (e) => {
        if (!dragState) return;
        const dy = dragState.startY - e.clientY;
        const sens = e.shiftKey ? 450 : 150;
        const raw = dragState.startVal + (dy / sens) * (spec.max - spec.min);
        const stepped = Math.round(raw / spec.step) * spec.step;
        this.store.set(k.id, stepped);
      });
      svg.addEventListener("pointerup", () => {
        dragState = null;
      });
      svg.addEventListener("dblclick", () => {
        this.store.set(k.id, spec.defaultValue);
      });

      this.fxWidgets.set(k.id, syncKnob);
      syncKnob();
    }

    // Draggable header
    const dragHead = panel.querySelector(`[data-drag="${key}"]`) as HTMLElement;
    let pan: { x: number; y: number; left: number; top: number } | null = null;
    dragHead.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const rect = panel.getBoundingClientRect();
      pan = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
      dragHead.setPointerCapture(e.pointerId);
    });
    dragHead.addEventListener("pointermove", (e) => {
      if (!pan) return;
      const nx = Math.max(8, Math.min(window.innerWidth - 240, pan.left + (e.clientX - pan.x)));
      const ny = Math.max(58, Math.min(window.innerHeight - 140, pan.top + (e.clientY - pan.y)));
      panel.style.left = `${nx}px`;
      panel.style.top = `${ny}px`;
    });
    dragHead.addEventListener("pointerup", () => {
      pan = null;
    });

    panel.querySelector(`[data-close="fx-${key}"]`)!.addEventListener("click", () => {
      panel.classList.add("hidden");
    });

    return panel;
  }

  private wireEvents(): void {
    this.audioBannerEl.addEventListener("click", () => {
      this.cb.onFirstGesture();
    });

    this.presetBtn.addEventListener("click", () => {
      this.cb.onFirstGesture();
      this.optionsPopover.classList.add("hidden");
      this.presetDrawer.classList.toggle("hidden");
      if (!this.presetDrawer.classList.contains("hidden")) {
        this.renderPresetList();
      }
    });

    this.presetDrawer.querySelector('[data-close="preset"]')!.addEventListener("click", () => {
      this.presetDrawer.classList.add("hidden");
    });

    this.presetSearchEl.addEventListener("input", () => this.renderPresetList());

    const form = this.presetDrawer.querySelector("#save-preset-form") as HTMLFormElement;
    const nameInput = this.presetDrawer.querySelector("#save-preset-name") as HTMLInputElement;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) {
        this.showToast("Please enter a preset name first.");
        return;
      }
      const created = createUserPreset(name, "Custom user patch", this.store.snapshot());
      nameInput.value = "";
      this.activeCategory = "User";
      this.activePresetId = created.id;
      saveActivePresetId(created.id);
      this.presetNameEl.textContent = created.name;
      this.renderPresetCategories();
      this.renderPresetList();
      this.showToast(`Saved preset "${created.name}"`);
    });

    this.presetDrawer.querySelector("#btn-reset-init")!.addEventListener("click", () => {
      this.cb.onFirstGesture();
      this.cb.onResetPatch();
      this.setActivePresetLabel("Init Patch", null);
      this.showToast("Initialized patch defaults");
    });

    this.topBar.querySelector("#btn-effects")!.addEventListener("click", () => {
      this.cb.onFirstGesture();
      const hidden =
        this.effectsRackDelay.classList.contains("hidden") &&
        this.effectsRackReverb.classList.contains("hidden");
      this.effectsRackDelay.classList.toggle("hidden", !hidden);
      this.effectsRackReverb.classList.toggle("hidden", !hidden);
    });

    this.topBar.querySelector("#btn-share")!.addEventListener("click", async () => {
      const url = buildShareUrl(this.store.snapshot());
      try {
        await navigator.clipboard.writeText(url);
        this.showToast("Patch URL copied to clipboard!");
      } catch {
        window.history.replaceState({}, "", url);
        this.showToast("Patch URL updated in address bar.");
      }
    });

    this.viewBtn.addEventListener("click", () => {
      const next: ViewMode = this.rig.getMode() === "3d" ? "2d" : "3d";
      this.cb.onViewChange(next);
    });

    this.topBar.querySelectorAll<HTMLButtonElement>("[data-cam]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = btn.dataset.cam as ViewState["cameraPreset"];
        this.cb.onCameraPreset(preset);
        this.setActiveCameraButton(preset);
      });
    });

    this.tiltInput.addEventListener("input", () => {
      const deg = Number(this.tiltInput.value);
      this.cb.onPanelAngle(deg);
      this.setTiltLabel(deg);
    });

    this.topBar.querySelector("#btn-options")!.addEventListener("click", () => {
      this.presetDrawer.classList.add("hidden");
      this.optionsPopover.classList.toggle("hidden");
    });

    this.optionsPopover.querySelector('[data-close="options"]')!.addEventListener("click", () => {
      this.optionsPopover.classList.add("hidden");
    });

    this.optionsPopover.querySelectorAll<HTMLInputElement>("[data-opt]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const key = cb.dataset.opt as keyof UserOptions;
        this.options = { ...this.options, [key]: cb.checked };
        saveUserOptions(this.options);
        this.syncOptionsUI();
      });
    });

    this.optionsPopover.querySelector("#btn-restart-tour")!.addEventListener("click", () => {
      this.optionsPopover.classList.add("hidden");
      this.cb.onStartTour();
    });

    this.qwertyCard.querySelector('[data-close="qwerty"]')!.addEventListener("click", () => {
      this.options = { ...this.options, showQwertyGuide: false };
      saveUserOptions(this.options);
      this.syncOptionsUI();
    });

    this.bottomBar.querySelector("#btn-oct-down")!.addEventListener("click", () => this.cb.onOctaveShift(-1));
    this.bottomBar.querySelector("#btn-oct-up")!.addEventListener("click", () => this.cb.onOctaveShift(1));
    this.bottomBar.querySelector("#btn-panic")!.addEventListener("click", () => this.cb.onPanic());

    this.store.subscribe((changed) => {
      for (const id of changed) {
        this.fxWidgets.get(id)?.();
      }
      this.updateFxDot();
    });
  }

  private renderPresetCategories(): void {
    const cats: Array<PresetCategory | "All"> = ["All", "Lead", "Bass", "Pad", "Experimental", "User"];
    const host = this.presetDrawer.querySelector("#preset-cats")!;
    host.innerHTML = "";
    for (const c of cats) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `cat-tab ${this.activeCategory === c ? "active" : ""}`;
      b.textContent = c;
      b.addEventListener("click", () => {
        this.activeCategory = c;
        this.renderPresetCategories();
        this.renderPresetList();
      });
      host.appendChild(b);
    }
  }

  private renderPresetList(): void {
    const query = this.presetSearchEl.value.trim().toLowerCase();
    const list = getAllPresets().filter((p) => {
      if (this.activeCategory !== "All" && p.category !== this.activeCategory) return false;
      if (query) {
        return (
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query)
        );
      }
      return true;
    });

    this.presetListEl.innerHTML = "";
    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "preset-empty";
      empty.textContent =
        this.activeCategory === "User"
          ? "No saved user patches yet. Dial a tone and save it below!"
          : "No presets match your filter.";
      this.presetListEl.appendChild(empty);
      return;
    }

    for (const preset of list) {
      const row = document.createElement("div");
      row.className = `preset-item ${this.activePresetId === preset.id ? "active" : ""}`;
      row.innerHTML = `
        <div class="pi-main">
          <div class="pi-title">
            <strong>${preset.name}</strong>
            <span class="pi-cat">${preset.category}</span>
          </div>
          <p class="pi-desc">${preset.description}</p>
        </div>
        ${
          preset.category === "User"
            ? `<button type="button" class="btn-icon pi-del" title="Delete preset">🗑</button>`
            : ""
        }
      `;
      row.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".pi-del")) return;
        this.cb.onFirstGesture();
        this.applyPreset(preset);
      });
      row.querySelector(".pi-del")?.addEventListener("click", () => {
        deleteUserPreset(preset.id);
        this.renderPresetList();
        this.showToast(`Deleted "${preset.name}"`);
      });
      this.presetListEl.appendChild(row);
    }
  }

  applyPreset(preset: Preset): void {
    this.store.resetToDefaults(true);
    this.store.applyPartial(preset.params, true);
    this.model.syncAll();
    this.engine.syncAll();
    this.setActivePresetLabel(preset.name, preset.id);
    this.renderPresetList();
    this.cb.onPresetApplied(preset);
    this.showToast(`Loaded "${preset.name}"`);
  }

  setActivePresetLabel(name: string, id: string | null): void {
    this.activePresetId = id;
    this.presetNameEl.textContent = name;
    saveActivePresetId(id);
  }

  restorePresetName(id: string | null): void {
    if (!id) {
      this.presetNameEl.textContent = "Custom Patch";
      return;
    }
    const found = getPresetById(id);
    if (found) {
      this.activePresetId = found.id;
      this.presetNameEl.textContent = found.name;
    }
  }

  private updateFxDot(): void {
    const dot = this.topBar.querySelector('[data-role="fx-dot"]');
    const active =
      this.store.getBool("auxOutputOn") &&
      (this.store.getBool("delayEnabled") || this.store.getBool("reverbEnabled"));
    dot?.classList.toggle("on", active);
  }

  private syncOptionsUI(): void {
    this.optionsPopover.querySelectorAll<HTMLInputElement>("[data-opt]").forEach((cb) => {
      const k = cb.dataset.opt as keyof UserOptions;
      cb.checked = Boolean(this.options[k]);
    });
    this.scopeCard.classList.toggle("hidden", !this.options.showScope);
    this.qwertyCard.classList.toggle("hidden", !this.options.showQwertyGuide);
  }

  setAudioReady(ready: boolean): void {
    this.audioBannerEl.classList.toggle("hidden", ready);
  }

  setViewMode(mode: ViewMode): void {
    this.viewBtn.textContent = mode === "2d" ? "3D View" : "2D View";
    this.viewBtn.classList.toggle("active", mode === "2d");
  }

  setActiveCameraButton(preset: ViewState["cameraPreset"]): void {
    this.topBar.querySelectorAll<HTMLButtonElement>("[data-cam]").forEach((b) => {
      b.classList.toggle("active", b.dataset.cam === preset);
    });
  }

  setTiltLabel(deg: number): void {
    const rounded = Math.round(deg);
    this.tiltInput.value = String(rounded);
    this.tiltValEl.textContent = `${rounded}°`;
  }

  setNoteReadout(midi: number | null): void {
    if (midi === null) {
      this.noteReadoutEl.textContent = "READY · —";
      return;
    }
    const hz = 440 * Math.pow(2, (midi - 69) / 12);
    this.noteReadoutEl.textContent = `NOTE · ${formatMidiNote(midi)} (${hz.toFixed(1)} Hz)`;
  }

  setOctaveBase(baseMidi: number): void {
    this.octaveLabelEl.textContent = `Base ${formatMidiNote(baseMidi)}`;
  }

  setMidiDevice(name: string | null): void {
    this.midiBadgeEl.textContent = name ? `MIDI: ${name}` : "MIDI: Ready";
    this.midiBadgeEl.classList.toggle("active", Boolean(name));
  }

  setOverload(overload: boolean): void {
    this.overloadBadgeEl.textContent = overload ? "OVERLOAD" : "NOMINAL";
    this.overloadBadgeEl.classList.toggle("hot", overload);
  }

  showHoverTooltip(info: HoverInfo | null): void {
    if (!info || !this.options.learningMode) {
      this.tooltipEl.classList.add("hidden");
      return;
    }
    const spec = SPEC_BY_ID[info.id];
    const tip = CONTROL_TOOLTIPS[info.id];
    const valText = formatControlValue(info.id, this.store.get(info.id));

    this.tooltipEl.innerHTML = `
      <div class="lt-head">
        <strong>${tip.title}</strong>
        <span class="lt-val">${valText}</span>
      </div>
      <div class="lt-sec">${spec.section}</div>
      <p>${tip.body}</p>
    `;
    this.tooltipEl.classList.remove("hidden");

    const x = Math.min(window.innerWidth - 310, Math.max(12, info.x + 16));
    const y = Math.min(window.innerHeight - 170, Math.max(64, info.y + 16));
    this.tooltipEl.style.left = `${x}px`;
    this.tooltipEl.style.top = `${y}px`;
  }

  showMagnifier(info: { id: ControlId; value: number; x: number; y: number } | null): void {
    if (!info || !this.options.magnifyKnobs) {
      this.magnifierEl.classList.add("hidden");
      return;
    }
    const spec = SPEC_BY_ID[info.id];
    const norm = (info.value - spec.min) / (spec.max - spec.min || 1);
    const deg = -135 + norm * 270;
    const valStr = formatControlValue(info.id, info.value);

    this.magnifierEl.innerHTML = `
      <svg viewBox="0 0 84 84" class="mag-svg">
        <circle cx="42" cy="42" r="32" class="dial-track" />
        <path d="${describeArc(42, 42, 32, -135, deg)}" class="dial-arc" fill="none" stroke-width="4.5" stroke-linecap="round" />
        <circle cx="42" cy="42" r="24" class="dial-cap" />
        <line x1="42" y1="42" x2="42" y2="20" class="dial-needle" transform="rotate(${deg} 42 42)" />
      </svg>
      <div class="mag-meta">
        <div class="mag-label">${spec.shortLabel}</div>
        <div class="mag-value">${valStr}</div>
      </div>
    `;
    this.magnifierEl.classList.remove("hidden");
    const x = Math.min(window.innerWidth - 180, Math.max(12, info.x + 22));
    const y = Math.min(window.innerHeight - 160, Math.max(64, info.y - 60));
    this.magnifierEl.style.left = `${x}px`;
    this.magnifierEl.style.top = `${y}px`;
  }

  drawScope(): void {
    if (!this.options.showScope) return;
    const samples = this.engine.getScopeSamples();
    const ctx = this.scopeCtx;
    const w = this.scopeCanvas.width;
    const h = this.scopeCanvas.height;

    ctx.fillStyle = "#0b0d10";
    ctx.fillRect(0, 0, w, h);

    // Subtle graticule crosshair
    ctx.strokeStyle = "rgba(232, 163, 61, 0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    if (!samples) return;

    // Trigger on first rising zero crossing for rock-steady waveform display
    let start = 0;
    for (let i = 1; i < samples.length / 2; i++) {
      if (samples[i - 1] < 0 && samples[i] >= 0) {
        start = i;
        break;
      }
    }

    ctx.strokeStyle = "#e8a33d";
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    const drawCount = Math.min(256, samples.length - start);
    for (let i = 0; i < drawCount; i++) {
      const x = (i / (drawCount - 1)) * w;
      const y = h / 2 - samples[start + i] * (h * 0.42);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  showToast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove("hidden");
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.add("hidden");
    }, 2400);
  }
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const clamped = Math.max(startAngle + 0.5, endAngle);
  const [sx, sy] = polarToCartesian(cx, cy, r, clamped);
  const [ex, ey] = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = clamped - startAngle <= 180 ? "0" : "1";
  return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 0 ${ex} ${ey}`;
}
