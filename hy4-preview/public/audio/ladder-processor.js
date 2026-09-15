/**
 * ladder-processor.js —— 4 极 24dB/oct 非线性梯形低通滤波器内核(AUD-6)
 *
 * 实现依据公开的梯形滤波器虚拟模拟建模文献(Huovilainen 型 / D'Angelo & Välimäki
 * "improved" 拓扑):四个一阶节级联、每节以 tanh 描述晶体管对的非线性、
 * 梯形(双线性)积分、末级电压经共振系数反馈回输入端,共振足够大时进入自激。
 * 本文件为按上述公开模型自行编写的 JS 实现,不复制任何第三方源码。
 *
 * AudioParam(a-rate):
 *   cutoff    —— 截止频率 Hz(5 .. 24000)
 *   resonance —— 共振(0 .. 4,≥3.8 进入自激)
 *   drive     —— 输入端驱动量(影响饱和程度)
 */
class LadderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "cutoff", defaultValue: 1200, minValue: 5, maxValue: 24000, automationRate: "a-rate" },
      { name: "resonance", defaultValue: 0, minValue: 0, maxValue: 4, automationRate: "a-rate" },
      { name: "drive", defaultValue: 1.5, minValue: 0.25, maxValue: 4, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    // 热电压(以伏特为单位的晶体管结热电压)
    this.VT = 0.312;
    // 四节积分器状态:电压、上一采样导数、tanh 输出
    this.V = new Float64Array(4);
    this.dV = new Float64Array(4);
    this.tV = new Float64Array(4);
    this.g = 0;
    this.fcSmooth = -1;
    this.resSmooth = -1;
    this.gainComp = 1;
    // 输入平滑系数:约 1.5ms 时间常数,抑制参数阶跃造成的 zipper 噪声
    this.alpha = 1 - Math.exp(-1 / (0.0015 * sampleRate));
    this.dcState = 0;
    this.port = null;
  }

  /** 由截止频率求梯形积分器的 g 系数(含双线性预畸变) */
  computeG(fc) {
    const f = Math.min(fc, sampleRate * 0.22);
    const x = (Math.PI * f) / sampleRate;
    return 4.0 * Math.PI * this.VT * f * ((1.0 - x) / (1.0 + x));
  }

  process(inputs, outputs, params) {
    const output = outputs[0];
    const out = output[0];
    if (!out) return true;
    const input = inputs[0] && inputs[0][0] ? inputs[0][0] : null;
    const n = out.length;
    const cutoffP = params.cutoff;
    const resP = params.resonance;
    const drive = params.drive[0];
    const V = this.V;
    const dV = this.dV;
    const tV = this.tV;
    const VT2 = 2 * this.VT;
    const fs2 = 2 * sampleRate;
    const alpha = this.alpha;

    let fc = this.fcSmooth;
    let res = this.resSmooth;
    if (fc < 0) fc = cutoffP.length > 1 ? cutoffP[0] : cutoffP[0];
    if (res < 0) res = resP.length > 1 ? resP[0] : resP[0];

    for (let i = 0; i < n; i++) {
      const targetFc = cutoffP.length > 1 ? cutoffP[i] : cutoffP[0];
      const targetRes = resP.length > 1 ? resP[i] : resP[0];
      fc += (targetFc - fc) * alpha;
      res += (targetRes - res) * alpha;

      this.g = this.computeG(fc);
      // 共振越高,通带增益越大,做等量补偿避免音量爆掉
      this.gainComp = 1 / (1 + res * 0.34);

      const g = this.g;
      const x = input ? input[i] : 0;

      // 第一节:输入与末级反馈电压相加后进入非线性
      const dV0 = -g * (Math.tanh((drive * x + res * V[3]) / VT2) + tV[0]);
      V[0] += (dV0 + dV[0]) / fs2;
      dV[0] = dV0;
      tV[0] = Math.tanh(V[0] / VT2);

      const dV1 = g * (tV[0] - tV[1]);
      V[1] += (dV1 + dV[1]) / fs2;
      dV[1] = dV1;
      tV[1] = Math.tanh(V[1] / VT2);

      const dV2 = g * (tV[1] - tV[2]);
      V[2] += (dV2 + dV[2]) / fs2;
      dV[2] = dV2;
      tV[2] = Math.tanh(V[2] / VT2);

      const dV3 = g * (tV[2] - tV[3]);
      V[3] += (dV3 + dV[3]) / fs2;
      dV[3] = dV3;
      tV[3] = Math.tanh(V[3] / VT2);

      // 输出隔直(梯形模型在极端参数下会有缓慢直流漂移)
      let o = V[3] * this.gainComp;
      this.dcState += (o - this.dcState) * 0.0004;
      o -= this.dcState;

      // 非规范化数保护,避免 CPU 进入慢路径
      out[i] = o > 1e-12 || o < -1e-12 ? o : 0;
    }

    this.fcSmooth = fc;
    this.resSmooth = res;
    return true;
  }
}

registerProcessor("ladder-filter", LadderProcessor);
