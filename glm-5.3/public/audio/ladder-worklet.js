/**
 * Aether Model D —— 四极梯形低通滤波器 AudioWorklet 处理器。
 *
 * 算法:公有领域的「compromise poles (z = -0.3)」梯形模型
 * (Stilson 分析,Krajeski 实现,Unlicense),含:
 *  - 逐样截止/共振平滑插值(防爆音、支持 AudioParam 调制与音频率扫频)
 *  - tanh 饱和反馈:高共振时自激(验收项)
 *  - 输出软限幅 + 直流阻断
 *
 * 参数:
 *  cutoff    (a-rate, Hz, 5–20000) —— 可直接接收音频率调制信号连接
 *  emphasis  (k-rate, 0–10)        —— ≥9.5 进入自激区
 */

const tanh = Math.tanh;

class LadderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "cutoff", defaultValue: 1000, minValue: 5, maxValue: 20000, automationRate: "a-rate" },
      { name: "emphasis", defaultValue: 3, minValue: 0, maxValue: 10, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    // 滤波器状态
    this.state = new Float64Array(5);
    this.delay = new Float64Array(5);
    // 系数缓存
    this.g = 0;
    this.gRes = 0;
    this.fcSmoothed = 1000;
    this.resSmoothed = 3;
    this.smoothCoef = 1 - Math.exp(-1 / (0.004 * sampleRate)); // ~4ms 时间常数
    // 直流阻断器
    this.dcX1 = 0;
    this.dcY1 = 0;
    this.dcR = 0.998;
  }

  setCoeffs(fc, res10) {
    const wc = (2 * Math.PI * fc) / sampleRate;
    const w = Math.min(wc, Math.PI);
    // Krajeski 截止频率多项式(z = -0.3 compromise poles 预畸变)
    this.g =
      0.9892 * w - 0.4342 * w * w + 0.1381 * w ** 3 - 0.0202 * w ** 4;
    // 共振:0–10 映射到 0–1.18(≥~9.5 时环路增益 > 1 → 自激)
    const res = res10 / 10;
    const corr =
      1.0029 + 0.0526 * w - 0.926 * w * w + 0.0218 * w ** 3;
    this.gRes = res * 1.18 * corr;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const outCh = output[0];
    const input = inputs[0];
    const inCh = input && input[0] ? input[0] : null;

    const cutoffP = parameters.cutoff;
    const res10 = parameters.emphasis[0];

    // 共振平滑(k-rate,每块更新即可,但为扫频平滑统一逐样插值)
    for (let i = 0; i < outCh.length; i++) {
      const fcTarget = cutoffP.length > 1 ? cutoffP[i] : cutoffP[0];
      this.fcSmoothed += (fcTarget - this.fcSmoothed) * this.smoothCoef;
      this.resSmoothed += (res10 - this.resSmoothed) * this.smoothCoef;
      this.setCoeffs(Math.min(Math.max(this.fcSmoothed, 5), 20000), this.resSmoothed);

      const x = inCh ? inCh[i] : 0;
      const s = this.state;
      const d = this.delay;

      s[0] = tanh(x - 4 * this.gRes * (s[4] - x));
      for (let k = 0; k < 4; k++) {
        s[k + 1] = this.g * (0.3 / 1.3 * s[k] + 1 / 1.3 * d[k] - s[k + 1]) + s[k + 1];
        d[k] = s[k];
      }

      let y = s[4] * 0.62;

      // 直流阻断(一阶高通 ~7Hz)
      const yhp = y - this.dcX1 + this.dcR * this.dcY1;
      this.dcX1 = y;
      this.dcY1 = yhp;
      y = yhp;

      // 软限幅,保证自激与过载时数值有界
      if (y > 0.95 || y < -0.95) y = 0.95 + tanh((Math.abs(y) - 0.95) * 8) * 0.05 * Math.sign(y);

      outCh[i] = y;
    }

    // 复制到其余输出声道(如有)
    for (let c = 1; c < output.length; c++) output[c].set(outCh);

    return true;
  }
}

registerProcessor("aether-ladder-filter", LadderProcessor);
