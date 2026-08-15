// PCM-Mathematik: Stille, Zusammensetzen, Resampling, 16-bit-WAV. Pur, ohne AudioContext
// (der wäre DOM und damit nicht node-testbar — Spec §4).

export interface PcmBuffer {
  /** Mono, Float32 in [-1, 1]. */
  samples: Float32Array;
  sampleRate: number;
}

export function silence(ms: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.max(0, Math.round((ms / 1000) * sampleRate)));
}

export function concatWithSilence(parts: { pcm: PcmBuffer; pauseAfterMs: number }[], sampleRate: number): PcmBuffer {
  const pieces: Float32Array[] = [];
  for (const p of parts) {
    if (p.pcm.sampleRate !== sampleRate) throw new Error(`sample rate mismatch: ${p.pcm.sampleRate} != ${sampleRate}`);
    pieces.push(p.pcm.samples);
    if (p.pauseAfterMs > 0) pieces.push(silence(p.pauseAfterMs, sampleRate));
  }
  const total = pieces.reduce((n, a) => n + a.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const a of pieces) {
    out.set(a, offset);
    offset += a.length;
  }
  return { samples: out, sampleRate };
}

/** Windowed-sinc-Resampler (Hann-Fenster, TAPS Stützstellen je Seite). Grenzfrequenz 0,45·min(Raten):
 *  beim Heruntertakten wirkt der Sinc als Tiefpass gegen Aliasing, beim Hochtakten als Interpolator.
 *  Normierung über die Fenstersumme hält die Amplitude auch am Rand. */
const TAPS = 32;
export function resample(pcm: PcmBuffer, targetRate: number): PcmBuffer {
  if (targetRate === pcm.sampleRate) return { samples: Float32Array.from(pcm.samples), sampleRate: targetRate };
  const x = pcm.samples;
  const ratio = pcm.sampleRate / targetRate;
  const outLen = Math.round(x.length / ratio);
  const fc = (0.45 * Math.min(pcm.sampleRate, targetRate)) / pcm.sampleRate; // normiert auf Eingangsrate
  const span = Math.ceil(TAPS * Math.max(1, ratio));
  const out = new Float32Array(outLen);
  for (let n = 0; n < outLen; n++) {
    const center = n * ratio;
    const i0 = Math.floor(center);
    let acc = 0;
    let wsum = 0;
    for (let i = i0 - span + 1; i <= i0 + span; i++) {
      if (i < 0 || i >= x.length) continue;
      const d = center - i;
      const s = d === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * d) / (Math.PI * d);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / span);
      acc += x[i] * s * w;
      wsum += s * w;
    }
    out[n] = wsum !== 0 ? acc / wsum : 0;
  }
  return { samples: out, sampleRate: targetRate };
}

export function toInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out[i] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
  }
  return out;
}

/** RIFF/WAVE, PCM, mono, 16 bit. */
export function encodeWav(pcm: PcmBuffer): Uint8Array {
  const data = toInt16(pcm.samples);
  const bytes = data.length * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const dv = new DataView(buf);
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  dv.setUint32(4, 36 + bytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, pcm.sampleRate, true);
  dv.setUint32(28, pcm.sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, "data");
  dv.setUint32(40, bytes, true);
  new Int16Array(buf, 44).set(data);
  return new Uint8Array(buf);
}

/** Senkt den Pegel auf `target`, wenn der Spitzenwert darüber liegt — hebt nie an. */
export function normalizePeak(samples: Float32Array, target = 0.9): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak <= target || peak === 0) return samples;
  const g = target / peak;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * g;
  return out;
}
