/**
 * Procedurally synthesizes a lush stereo studio hall/plate Impulse Response
 * buffer so Convolution Reverb works 100% offline with zero external audio assets.
 */
export function createStudioImpulseResponse(
  ctx: AudioContext,
  durationSec = 2.4,
  decayPower = 2.6,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(2, length, sr);

  // Pre-delay ~12ms + dense stereo early reflections + exponential tail damping
  const preDelaySamples = Math.floor(sr * 0.012);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lpState = 0;
    const dampAlpha = ch === 0 ? 0.28 : 0.26;

    for (let i = preDelaySamples; i < length; i++) {
      const t = (i - preDelaySamples) / (length - preDelaySamples);
      const env = Math.pow(1 - t, decayPower);
      const noise = Math.random() * 2 - 1;
      // Progressive high-frequency air absorption along the tail
      const alpha = Math.max(0.06, dampAlpha * (1 - 0.65 * t));
      lpState += (noise - lpState) * alpha;

      // Subtle early reflection clusters in first 75ms
      let early = 0;
      const ms = ((i - preDelaySamples) / sr) * 1000;
      if (ms < 75 && (i % (ch === 0 ? 293 : 331)) < 2) {
        early = (Math.random() * 2 - 1) * 0.45 * (1 - ms / 75);
      }
      data[i] = (lpState * 0.85 + early) * env * 0.65;
    }
  }

  return buffer;
}
