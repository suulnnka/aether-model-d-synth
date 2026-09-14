/**
 * Loads a real AudioWorklet processor file and runs it in Node.
 *
 * The worklet processors are plain scripts that expect `AudioWorkletProcessor`,
 * `registerProcessor` and `sampleRate` in scope. We provide minimal stand-ins in
 * a `vm` context, capture whatever the file registers, and hand back the
 * constructor so tests can drive `process()` frame by frame.
 *
 * This is what makes the parity tests possible: the realtime processor is
 * executed for real, not re-implemented for the test.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export interface ProcessorHost {
  /** Minimal AudioWorkletNode surface the engine relies on. */
  readonly port: {
    onmessage: ((event: { data: unknown }) => void) | null;
    postMessage: (data: unknown) => void;
  };
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

export type ProcessorConstructor = new (options?: {
  processorOptions?: Record<string, unknown>;
}) => ProcessorHost;

const WORKLET_DIR = fileURLToPath(
  new URL('../../public/worklets/', import.meta.url),
);

export function loadWorkletProcessors(
  file: string,
  sampleRate = 48_000,
): Map<string, ProcessorConstructor> {
  const source = readFileSync(`${WORKLET_DIR}${file}`, 'utf8');
  const registered = new Map<string, ProcessorConstructor>();

  class StubProcessorBase {
    port = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      postMessage: (): void => {},
    };
  }

  const sandbox = {
    AudioWorkletProcessor: StubProcessorBase,
    registerProcessor: (name: string, ctor: ProcessorConstructor): void => {
      registered.set(name, ctor);
    },
    sampleRate,
    currentTime: 0,
    currentFrame: 0,
    Float32Array,
    ArrayBuffer,
    Math,
    console,
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: file });
  return registered;
}

/** Convenience: load one processor by its registered name. */
export function loadProcessor(
  file: string,
  name: string,
  sampleRate = 48_000,
  processorOptions?: Record<string, unknown>,
): ProcessorHost {
  const processors = loadWorkletProcessors(file, sampleRate);
  const ctor = processors.get(name);
  if (!ctor) {
    throw new Error(
      `${file} did not register "${name}" (saw: ${[...processors.keys()].join(', ')})`,
    );
  }
  return new ctor(processorOptions ? { processorOptions } : undefined);
}

/** Run one mono sample through a processor and return the single output sample. */
export function runSample(
  processor: ProcessorHost,
  input: number,
  parameters: Record<string, Float32Array>,
): number {
  const inputBuffer = new Float32Array([input]);
  const outputBuffer = new Float32Array(1);
  processor.process([[inputBuffer]], [[outputBuffer]], parameters);
  return outputBuffer[0];
}

/** A one-element parameter array (the "constant over this block" form). */
export function constParam(value: number): Float32Array {
  return new Float32Array([value]);
}
