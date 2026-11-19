import type { Osc12Waveform, Osc3Waveform } from "../state/types.ts";

const HARMONICS = 64;

function normalizeWave(real: Float32Array, imag: Float32Array): void {
  let maxPeak = 0;
  const samples = 256;
  for (let s = 0; s < samples; s++) {
    const theta = (2 * Math.PI * s) / samples;
    let sum = 0;
    for (let k = 1; k < real.length; k++) {
      sum += real[k] * Math.cos(k * theta) + imag[k] * Math.sin(k * theta);
    }
    maxPeak = Math.max(maxPeak, Math.abs(sum));
  }
  if (maxPeak > 0.001) {
    const scale = 0.85 / maxPeak;
    for (let k = 1; k < real.length; k++) {
      real[k] *= scale;
      imag[k] *= scale;
    }
  }
}

function buildPulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  const real = new Float32Array(HARMONICS);
  const imag = new Float32Array(HARMONICS);
  for (let k = 1; k < HARMONICS; k++) {
    const a = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    // Lanczos sigma factor to soften Gibbs ringing
    const sigma = Math.sin((Math.PI * k) / HARMONICS) / ((Math.PI * k) / HARMONICS);
    real[k] = a * sigma;
  }
  normalizeWave(real, imag);
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}

function buildTriSawWave(ctx: AudioContext): PeriodicWave {
  const real = new Float32Array(HARMONICS);
  const imag = new Float32Array(HARMONICS);
  for (let k = 1; k < HARMONICS; k++) {
    const tri = k % 2 === 1 ? (8 / (Math.PI * Math.PI * k * k)) * (k % 4 === 1 ? 1 : -1) : 0;
    const saw = (2 / (k * Math.PI)) * (k % 2 === 1 ? 1 : -1);
    let harmonic = 0.35 * tri + 0.65 * saw;
    if (k % 2 === 0 && k <= 16) harmonic += 0.14 / k;
    imag[k] = harmonic;
  }
  normalizeWave(real, imag);
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}

function buildReverseSawWave(ctx: AudioContext): PeriodicWave {
  const real = new Float32Array(HARMONICS);
  const imag = new Float32Array(HARMONICS);
  for (let k = 1; k < HARMONICS; k++) {
    const sigma = Math.sin((Math.PI * k) / HARMONICS) / ((Math.PI * k) / HARMONICS);
    // Positive polarity ramps downward (reverse sawtooth)
    imag[k] = (2 / (k * Math.PI)) * (k % 2 === 1 ? 1 : -1) * sigma;
  }
  normalizeWave(real, imag);
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}

export interface WaveBank {
  triSaw: PeriodicWave;
  revSaw: PeriodicWave;
  pulse2: PeriodicWave;
  pulse3: PeriodicWave;
}

const bankCache = new WeakMap<AudioContext, WaveBank>();

export function getWaveBank(ctx: AudioContext): WaveBank {
  let bank = bankCache.get(ctx);
  if (!bank) {
    bank = {
      triSaw: buildTriSawWave(ctx),
      revSaw: buildReverseSawWave(ctx),
      pulse2: buildPulseWave(ctx, 0.25),
      pulse3: buildPulseWave(ctx, 0.1),
    };
    bankCache.set(ctx, bank);
  }
  return bank;
}

export function applyOscWaveform(
  ctx: AudioContext,
  osc: OscillatorNode,
  waveform: Osc12Waveform | Osc3Waveform,
): void {
  const bank = getWaveBank(ctx);
  switch (waveform) {
    case "triangle":
      osc.type = "triangle";
      break;
    case "sawtooth":
      osc.type = "sawtooth";
      break;
    case "pulse1":
      osc.type = "square";
      break;
    case "tri_saw":
      osc.setPeriodicWave(bank.triSaw);
      break;
    case "rev_saw":
      osc.setPeriodicWave(bank.revSaw);
      break;
    case "pulse2":
      osc.setPeriodicWave(bank.pulse2);
      break;
    case "pulse3":
      osc.setPeriodicWave(bank.pulse3);
      break;
  }
}

export function createWhiteNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

/**
 * Paul Kellet's refined 7-state pink noise filter (-3 dB/oct).
 */
export function createPinkNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    data[i] = pink * 0.11;
  }
  return buf;
}
