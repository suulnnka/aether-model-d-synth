/**
 * Aether Model D — 梯形低通滤波器 AudioWorklet 处理器
 *
 * 四极 24dB/oct 非线性梯形模型(Huovilainen 2004/2010 公开论文的离散化电路,
 * 自行实现):四级一阶低通串联,tanh 饱和非线性,共振反馈,半样本相位补偿,
 * 2 倍过采样。信号在「tanh 膝点归一化」单位下运行,保证 Emphasis 拉满时
 * 自激振荡幅度有界、音色可信。
 *
 * 协议:
 *  - AudioParam `fm`(a-rate,八度):音频率的截止频率调制输入。
 *  - port 消息:
 *      { type: "params", cutoff, resonance, contourOct, attackS, decayS, sustain, decayMode }
 *      { type: "noteOn" }   —— 滤波包络从当前值重新 Attack
 *      { type: "noteOff" }  —— 包络快速回落(固定短尾)
 */

const THERMAL_DRIVE = 2.0; // 输入驱动:1.0 = 完全线性,2.0 轻微饱和增模拟味
const OUT_SCALE = 1 / THERMAL_DRIVE;
const CUTOFF_MIN = 10;
const CUTOFF_MAX = 32000;
/**
 * 转折点补偿:四级恒等一极的级联,其整体 −3dB 点 ≈ 0.435 × 单极频率,
 * 自激点 ≈ 单极频率。乘以 2.3 后旋钮标称值与听感转折点一致
 * (自激频率相应落在 ≈2.2 × 标称值)。
 */
const CUTOFF_COMP = 2.3;
/** 共振反馈上限(4.8 使 Emphasis=10 进入稳定自激) */
const RES_QUAD_MAX = 4.8;

class LadderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 梯形级状态(tanh 膝点归一化单位)
    this.d = [0, 0, 0, 0];
    this.T = [0, 0, 0]; // 各级上一样本的 tanh
    this.d4 = 0; // 半样本延迟补偿
    this.y5 = 0;
    // 直流阻断
    this.dcIn = 0;
    this.dcOut = 0;
    // 参数(平滑值 & 目标值)
    this.cutTarget = 1000;
    this.cutSmooth = 1000;
    this.resTarget = 0;
    this.resSmooth = 0;
    // 滤波包络(0..1)
    this.env = 0;
    this.envStage = "idle"; // idle | attack | decay | release
    this.contourOct = 0;
    this.attackS = 0.01;
    this.decayS = 0.5;
    this.sustain = 0.5;
    this.releaseS = 0.07;
    // 系数缓存
    this.G = 0.5;
    this.resQuad = 0;

    this.port.onmessage = (e) => {
      const m = e.data;
      if (!m) return;
      if (m.type === "params") {
        this.cutTarget = Math.max(CUTOFF_MIN, Math.min(CUTOFF_MAX, m.cutoff));
        this.resTarget = Math.max(0, Math.min(1, m.resonance));
        this.contourOct = m.contourOct || 0;
        this.attackS = Math.max(0.0005, m.attackS || 0.01);
        this.decayS = Math.max(0.0005, m.decayS || 0.5);
        this.sustain = m.decayMode ? 0 : Math.max(0, Math.min(1, m.sustain));
      } else if (m.type === "noteOn") {
        // 重触发:从当前包络值起 Attack
        this.envStage = this.attackS <= 0.002 ? "decay" : "attack";
      } else if (m.type === "noteOff") {
        this.envStage = "release";
      }
    };
  }

  static get parameterDescriptors() {
    return [
      {
        name: "fm",
        defaultValue: 0,
        minValue: -12,
        maxValue: 12,
        automationRate: "a-rate",
      },
    ];
  }

  /** Huovilainen 系数:给定截止频率(Hz)更新一极系数与共振反馈量 */
  updateCoefficients(cutoffHz) {
    const fc = Math.min((cutoffHz * CUTOFF_COMP) / sampleRate, 0.45);
    const f = fc * 0.5; // 2 倍过采样等效
    const fc2 = fc * fc;
    const fc3 = fc2 * fc;
    const fcr = 1.873 * fc3 + 0.4955 * fc2 - 0.649 * fc + 0.9988;
    const acr = -3.9364 * fc2 + 1.8409 * fc + 0.9968;
    this.G = 1 - Math.exp(-2 * Math.PI * f * fcr);
    this.resQuad = RES_QUAD_MAX * this.resSmooth * acr;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const inCh = input && input[0] ? input[0] : null;
    const outCh = output[0];
    const fm = parameters.fm;
    const fmIsArray = fm.length > 1;

    if (!outCh) return true;

    for (let i = 0; i < outCh.length; i++) {
      const x = inCh ? inCh[i] : 0;

      // 参数平滑(每样本一阶,杜绝 zipper)
      this.cutSmooth += (this.cutTarget - this.cutSmooth) * 0.004;
      this.resSmooth += (this.resTarget - this.resSmooth) * 0.002;

      // 包络推进
      const envCoef = (tau) => 1 - Math.exp(-1 / (tau * sampleRate * 2)); // ×2 过采样
      if (this.envStage === "attack") {
        this.env += (1 / (this.attackS * sampleRate * 2)) * 1;
        if (this.env >= 1) {
          this.env = 1;
          this.envStage = "decay";
        }
      } else if (this.envStage === "decay") {
        this.env += (this.sustain - this.env) * envCoef(Math.max(this.decayS / 4, 0.001));
        if (Math.abs(this.env - this.sustain) < 1e-4) this.env = this.sustain;
      } else if (this.envStage === "release") {
        this.env += -this.env * envCoef(Math.max(this.releaseS / 3, 0.001));
        if (this.env < 1e-5) {
          this.env = 0;
          this.envStage = "idle";
        }
      }

      const fmOct = fmIsArray ? fm[i] : fm[0];
      const oct = this.contourOct * this.env + fmOct;
      const cutoff = Math.max(
        CUTOFF_MIN,
        Math.min(CUTOFF_MAX, this.cutSmooth * Math.pow(2, oct)),
      );
      this.updateCoefficients(cutoff);

      // 直流阻断
      const dcBlocked = x - this.dcIn + 0.995 * this.dcOut;
      this.dcIn = x;
      this.dcOut = dcBlocked;

      // 2 倍过采样跑两级梯形
      const half = dcBlocked * 0.5;
      let sample = half;
      for (let j = 0; j < 2; j++) {
        const u = sample * THERMAL_DRIVE - this.resQuad * this.y5;
        // 四级一极 + tanh 饱和(级间用上一样本 tanh,即电路的单位延迟拓扑)
        this.d[0] += this.G * (Math.tanh(u) - this.T[0]);
        this.T[0] = Math.tanh(this.d[0]);
        this.d[1] += this.G * (this.T[0] - this.T[1]);
        this.T[1] = Math.tanh(this.d[1]);
        this.d[2] += this.G * (this.T[1] - this.T[2]);
        this.T[2] = Math.tanh(this.d[2]);
        this.d[3] += this.G * (this.T[2] - Math.tanh(this.d[3]));
        this.y5 = (this.d[3] + this.d4) * 0.5;
        this.d4 = this.d[3];
        sample = half; // 0 阶保持:同一输入样本重复
      }

      outCh[i] = this.y5 * OUT_SCALE;
    }
    return true;
  }
}

registerProcessor("ladder-processor", LadderProcessor);
