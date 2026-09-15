/**
 * 梯形滤波器装载器(AUD-6)
 * AudioWorklet 优先;不可用时降级为 4×Biquad 级联(24dB/oct),并标记兼容模式。
 */

export interface ParamLike {
  value: number;
  setValueAtTime(v: number, t: number): void;
  linearRampToValueAtTime(v: number, t: number): void;
  setTargetAtTime(v: number, t: number, tc: number): void;
  cancelScheduledValues(t: number): void;
}

export interface LadderFilter {
  input: AudioNode;
  output: AudioNode;
  /** 基准截止频率(可直接 setTargetAtTime 平滑) */
  cutoff: ParamLike;
  resonance: ParamLike;
  /** 需要接收截止频率调制信号的 AudioParam(工作线程为 1 个,降级路径为 4 个) */
  modulationTargets: AudioParam[];
  mode: "worklet" | "biquad";
  dispose(): void;
}

/** 把多个 AudioParam 包装成一个,用于 Biquad 降级路径 */
class ParamGroup implements ParamLike {
  constructor(private params: AudioParam[]) {}
  get value(): number {
    return this.params[0]?.value ?? 0;
  }
  set value(v: number) {
    for (const p of this.params) p.value = v;
  }
  setValueAtTime(v: number, t: number): void {
    for (const p of this.params) p.setValueAtTime(v, t);
  }
  linearRampToValueAtTime(v: number, t: number): void {
    for (const p of this.params) p.linearRampToValueAtTime(v, t);
  }
  setTargetAtTime(v: number, t: number, tc: number): void {
    for (const p of this.params) p.setTargetAtTime(v, t, tc);
  }
  cancelScheduledValues(t: number): void {
    for (const p of this.params) p.cancelScheduledValues(t);
  }
}

const WORKLET_URL = `${import.meta.env.BASE_URL}audio/ladder-processor.js`;

let workletLoadPromise: Promise<boolean> | null = null;

function loadWorklet(ctx: AudioContext): Promise<boolean> {
  if (workletLoadPromise) return workletLoadPromise;
  workletLoadPromise = (async () => {
    if (!ctx.audioWorklet) return false;
    try {
      await ctx.audioWorklet.addModule(WORKLET_URL);
      return true;
    } catch {
      return false;
    }
  })();
  return workletLoadPromise;
}

export async function createLadderFilter(ctx: AudioContext): Promise<LadderFilter> {
  const ok = await loadWorklet(ctx);
  if (ok) {
    try {
      const node = new AudioWorkletNode(ctx, "ladder-filter", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      const cutoff = node.parameters.get("cutoff") as AudioParam;
      const resonance = node.parameters.get("resonance") as AudioParam;
      const shim: ParamLike = {
        get value() {
          return cutoff.value;
        },
        set value(v: number) {
          cutoff.value = v;
        },
        setValueAtTime: (v, t) => cutoff.setValueAtTime(v, t),
        linearRampToValueAtTime: (v, t) => cutoff.linearRampToValueAtTime(v, t),
        setTargetAtTime: (v, t, tc) => cutoff.setTargetAtTime(v, t, tc),
        cancelScheduledValues: (t) => cutoff.cancelScheduledValues(t),
      };
      const resShim: ParamLike = {
        get value() {
          return resonance.value;
        },
        set value(v: number) {
          resonance.value = v;
        },
        setValueAtTime: (v, t) => resonance.setValueAtTime(v, t),
        linearRampToValueAtTime: (v, t) => resonance.linearRampToValueAtTime(v, t),
        setTargetAtTime: (v, t, tc) => resonance.setTargetAtTime(v, t, tc),
        cancelScheduledValues: (t) => resonance.cancelScheduledValues(t),
      };
      return {
        input: node,
        output: node,
        cutoff: shim,
        resonance: resShim,
        modulationTargets: [cutoff],
        mode: "worklet",
        dispose: () => node.disconnect(),
      };
    } catch {
      /* 落到降级路径 */
    }
  }

  // ── 降级:4×Biquad 低通级联(24dB/oct) ──
  const stages: BiquadFilterNode[] = [];
  for (let i = 0; i < 4; i++) {
    const b = ctx.createBiquadFilter();
    b.type = "lowpass";
    b.frequency.value = 1200;
    b.Q.value = 0.7071;
    stages.push(b);
  }
  for (let i = 0; i < stages.length - 1; i++) stages[i].connect(stages[i + 1]);

  const freqGroup = new ParamGroup(stages.map((s) => s.frequency));
  const qProxy: ParamLike = {
    get value() {
      return stages[0].Q.value;
    },
    set value(v: number) {
      const q = 0.7071 + Math.min(4, Math.max(0, v)) * 1.6;
      for (const s of stages) s.Q.value = q;
    },
    setValueAtTime(v, t) {
      const q = 0.7071 + Math.min(4, Math.max(0, v)) * 1.6;
      for (const s of stages) s.Q.setValueAtTime(q, t);
    },
    linearRampToValueAtTime(v, t) {
      const q = 0.7071 + Math.min(4, Math.max(0, v)) * 1.6;
      for (const s of stages) s.Q.linearRampToValueAtTime(q, t);
    },
    setTargetAtTime(v, t, tc) {
      const q = 0.7071 + Math.min(4, Math.max(0, v)) * 1.6;
      for (const s of stages) s.Q.setTargetAtTime(q, t, tc);
    },
    cancelScheduledValues(t) {
      for (const s of stages) s.Q.cancelScheduledValues(t);
    },
  };

  return {
    input: stages[0],
    output: stages[3],
    cutoff: freqGroup,
    resonance: qProxy,
    modulationTargets: stages.map((s) => s.frequency),
    mode: "biquad",
    dispose: () => stages.forEach((s) => s.disconnect()),
  };
}
