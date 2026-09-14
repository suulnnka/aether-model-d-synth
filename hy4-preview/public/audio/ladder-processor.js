/**
 * ladder-processor.js — 4 极 24dB/oct 梯形低通滤波器(AUD-6)
 *
 * 算法:「An Improved Virtual Analog Model of the Ladder Filter」
 * (D'Angelo & Välimäki, ICASSP 2013)的 JS 移植,MIT 风格许可,
 * 原始实现 © 2012 Stefano D'Angelo(保留声明)。
 * 特性:tanh 非线性、半采样插值、resonance≥3.9 可自激。
 *
 * 参数(a-rate,支持 AudioParam 连接):
 *   cutoff     — 截止频率 Hz
 *   resonance  — 共振 0..4(≥3.8 进入自激区)
 *   drive      — 前级驱动(默认 1.5)
 */
class LadderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "cutoff", defaultValue: 1000, minValue: 5, maxValue: 20000, automationRate: "a-rate" },
      { name: "resonance", defaultValue: 0.5, minValue: 0, maxValue: 4, automationRate: "a-rate" },
      { name: "drive", defaultValue: 1.5, minValue: 0.5, maxValue: 4, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    // 4 个积分器状态
    this.V = [0, 0, 0, 0];
    this.dV = [0, 0, 0, 0];
    this.tV = [0, 0, 0, 0];
    this.g = 0;
    this.lastCutoff = -1;
    this.VT = 0.312; // 热电压
    this.gainComp = 1; // 共振音量补偿
  }

  setG(fc) {
    // 限幅防不稳定
    const f = Math.min(fc, sampleRate * 0.25);
    const x = (Math.PI * f) / sampleRate;
    const g = 4.0 * Math.PI * this.VT * f * ((1.0 - x) / (1.0 + x));
    this.g = g * 1.025; // 微调使标称截止更准
  }

  process(inputs, outputs, params) {
    const out = outputs[0][0];
    if (!out) return true;
    const input = inputs[0] && inputs[0][0] ? inputs[0][0] : null;
    const n = out.length;
    const cutoffP = params.cutoff;
    const resP = params.resonance;
    const drive = params.drive[0];

    for (let i = 0; i < n; i++) {
      const fc = cutoffP.length > 1 ? cutoffP[i] : cutoffP[0];
      const res = resP.length > 1 ? resP[i] : resP[0];
      if (fc !== this.lastCutoff) {
        this.setG(fc);
        this.lastCutoff = fc;
        this.gainComp = 1 / (1 + res * 0.32);
      }

      const x = input ? input[i] : 0;
      const V = this.V, dV = this.dV, tV = this.tV, g = this.g;

      const dV0 = -g * (Math.tanh((drive * x + res * V[3]) / (2 * this.VT)) + tV[0]);
      V[0] += (dV0 + dV[0]) / (2 * sampleRate);
      dV[0] = dV0;
      tV[0] = Math.tanh(V[0] / (2 * this.VT));

      const dV1 = g * (tV[0] - tV[1]);
      V[1] += (dV1 + dV[1]) / (2 * sampleRate);
      dV[1] = dV1;
      tV[1] = Math.tanh(V[1] / (2 * this.VT));

      const dV2 = g * (tV[1] - tV[2]);
      V[2] += (dV2 + dV[2]) / (2 * sampleRate);
      dV[2] = dV2;
      tV[2] = Math.tanh(V[2] / (2 * this.VT));

      const dV3 = g * (tV[2] - tV[3]);
      V[3] += (dV3 + dV[3]) / (2 * sampleRate);
      dV[3] = dV3;
      tV[3] = Math.tanh(V[3] / (2 * this.VT));

      let o = V[3] * this.gainComp;
      // 抖动数值保护
      if (o > 1e-20 || o < -1e-20) out[i] = o;
      else out[i] = 0;
    }
    return true;
  }
}
registerProcessor("ladder-filter", LadderProcessor);
