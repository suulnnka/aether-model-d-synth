export type OscRange = "lo" | "32" | "16" | "8" | "4" | "2";

export type Osc12Waveform =
  | "triangle"
  | "tri_saw"
  | "sawtooth"
  | "pulse1"
  | "pulse2"
  | "pulse3";

export type Osc3Waveform =
  | "triangle"
  | "sawtooth"
  | "rev_saw"
  | "pulse1"
  | "pulse2"
  | "pulse3";

export type LfoWaveform = "triangle" | "square";
export type NoiseType = "white" | "pink";
export type PresetCategory = "Lead" | "Bass" | "Pad" | "Experimental" | "User";
export type ViewMode = "3d" | "2d";

export type ControlId =
  | "powerOn"
  | "masterTune"
  | "glideTime"
  | "modMix"
  | "osc3FilterEgSwitch"
  | "noiseLfoSwitch"
  | "oscillatorModulationOn"
  | "osc3Control"
  | "osc1Range"
  | "osc1Waveform"
  | "osc2Range"
  | "osc2Frequency"
  | "osc2Waveform"
  | "osc3Range"
  | "osc3Frequency"
  | "osc3Waveform"
  | "osc1Enabled"
  | "osc1Volume"
  | "osc2Enabled"
  | "osc2Volume"
  | "osc3Enabled"
  | "osc3Volume"
  | "extEnabled"
  | "extVolume"
  | "noiseEnabled"
  | "noiseVolume"
  | "noiseType"
  | "filterModulationOn"
  | "keyboardControl1"
  | "keyboardControl2"
  | "filterCutoff"
  | "filterEmphasis"
  | "filterContourAmount"
  | "filterAttack"
  | "filterDecay"
  | "filterSustain"
  | "loudnessAttack"
  | "loudnessDecay"
  | "loudnessSustain"
  | "mainVolume"
  | "isMainActive"
  | "tunerOn"
  | "effectsVolume"
  | "auxOutputOn"
  | "lfoRate"
  | "lfoWaveform"
  | "glideOn"
  | "decaySwitchOn"
  | "pitchWheel"
  | "modWheel"
  | "delayEnabled"
  | "delayMix"
  | "delayTime"
  | "delayFeedback"
  | "reverbEnabled"
  | "reverbMix"
  | "reverbTone";

export type ParamMap = Record<ControlId, number>;

export type ControlKind = "knob" | "step" | "switch" | "wheel";

export interface ControlSpec {
  readonly id: ControlId;
  readonly label: string;
  readonly shortLabel: string;
  readonly kind: ControlKind;
  readonly section:
    | "Controllers"
    | "Oscillator Bank"
    | "Mixer"
    | "Modifiers"
    | "Output"
    | "Left Hand"
    | "Effects";
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  readonly bipolar?: boolean;
  readonly unit?: string;
  readonly stepLabels?: readonly string[];
  readonly switchLabels?: readonly [string, string];
  readonly format?: (value: number) => string;
}

export interface Preset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: PresetCategory;
  readonly params: Partial<ParamMap>;
}

export interface UserOptions {
  learningMode: boolean;
  magnifyKnobs: boolean;
  showScope: boolean;
  showQwertyGuide: boolean;
  onboardingCompleted: boolean;
}

export interface ViewState {
  mode: ViewMode;
  panelAngleDeg: number;
  cameraPreset: "overview" | "panel" | "keys" | "rear";
}
