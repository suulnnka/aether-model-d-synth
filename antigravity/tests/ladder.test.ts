import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

interface WorkletInstance {
  port: {
    onmessage: ((ev: { data: unknown }) => void) | null;
    postMessage: (msg: unknown) => void;
  };
  process: (
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ) => boolean;
}

function loadLadderProcessor(sr = 48000): WorkletInstance {
  const code = fs.readFileSync(
    path.resolve(__dirname, "../public/worklets/ladder-processor.js"),
    "utf8",
  );
  const holder: { Ctor: (new () => WorkletInstance) | null } = { Ctor: null };

  class MockAudioWorkletProcessor {
    port = {
      onmessage: null as ((ev: { data: unknown }) => void) | null,
      postMessage: (_msg: unknown) => {},
    };
  }

  const sandbox = {
    AudioWorkletProcessor: MockAudioWorkletProcessor,
    sampleRate: sr,
    registerProcessor: (_name: string, ctor: new () => WorkletInstance) => {
      holder.Ctor = ctor;
    },
    Math,
    Number,
  };

  vm.runInNewContext(code, sandbox);
  if (!holder.Ctor) throw new Error("Failed to register ladder processor");
  return new holder.Ctor();
}

function measureRms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

describe("AetherLadderProcessor AudioWorklet DSP", () => {
  it("attenuates high frequencies above cutoff with 4-pole steep rolloff", () => {
    const sr = 48000;
    const renderTone = (freqHz: number, cutoffHz: number) => {
      const proc = loadLadderProcessor(sr);
      proc.port.onmessage?.({
        data: { type: "params", cutoffHz, contourOct: 0, attackS: 0.01, decayS: 0.2, sustain: 0 },
      });
      const block = 128;
      const blocks = 120; // ~320ms so filter smoothing settles
      const lastBlock = new Float32Array(block);
      const cutoffMod = new Float32Array([0]);
      const emphasis = new Float32Array([1.0]);

      for (let b = 0; b < blocks; b++) {
        const input = new Float32Array(block);
        const output = new Float32Array(block);
        for (let i = 0; i < block; i++) {
          const t = (b * block + i) / sr;
          input[i] = 0.25 * Math.sin(2 * Math.PI * freqHz * t);
        }
        proc.process([[input]], [[output]], { cutoffMod, emphasis });
        if (b === blocks - 1) lastBlock.set(output);
      }
      return measureRms(lastBlock);
    };

    const lowPassRms = renderTone(120, 450);
    const highStopRms = renderTone(4500, 450);
    const ratioDb = 20 * Math.log10((lowPassRms + 1e-9) / (highStopRms + 1e-9));
    expect(lowPassRms).toBeGreaterThan(0.08);
    expect(ratioDb).toBeGreaterThan(35);
  });

  it("self-oscillates cleanly at high emphasis without NaN or blowup", () => {
    const proc = loadLadderProcessor(48000);
    proc.port.onmessage?.({
      data: { type: "params", cutoffHz: 650, contourOct: 0, attackS: 0.01, decayS: 0.2, sustain: 0 },
    });

    const block = 128;
    const cutoffMod = new Float32Array([0]);
    const emphasis = new Float32Array([9.8]);
    const tail = new Float32Array(block);

    for (let b = 0; b < 300; b++) {
      // Tiny thermal impulse on block 0, zero input thereafter
      const input = new Float32Array(block);
      if (b === 0) input[0] = 0.02;
      const output = new Float32Array(block);
      proc.process([[input]], [[output]], { cutoffMod, emphasis });
      for (let i = 0; i < block; i++) {
        expect(Number.isFinite(output[i])).toBe(true);
      }
      if (b === 299) tail.set(output);
    }

    const rms = measureRms(tail);
    expect(rms).toBeGreaterThan(0.05);
    expect(rms).toBeLessThan(1.0);
  });

  it("stays numerically stable across extreme cutoff & emphasis combinations", () => {
    const proc = loadLadderProcessor(44100);
    const block = 128;
    const cutoffMod = new Float32Array([4]);
    const emphasis = new Float32Array([10]);

    for (const cutoffHz of [14, 120, 1200, 8000, 22000]) {
      proc.port.onmessage?.({
        data: { type: "params", cutoffHz, contourOct: 6, attackS: 0.002, decayS: 0.1, sustain: 1 },
      });
      proc.port.onmessage?.({ data: { type: "noteOn" } });
      for (let b = 0; b < 40; b++) {
        const input = new Float32Array(block).fill(0.5);
        const output = new Float32Array(block);
        proc.process([[input]], [[output]], { cutoffMod, emphasis });
        for (let i = 0; i < block; i++) {
          expect(Number.isFinite(output[i])).toBe(true);
          expect(Math.abs(output[i])).toBeLessThanOrEqual(1.05);
        }
      }
    }
  });
});
