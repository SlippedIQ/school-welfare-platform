/**
 * Camera-based pulse extraction (remote photoplethysmography, rPPG).
 *
 * Skin pixels (cheek patches) are sampled each processed video frame; the
 * green channel carries the strongest blood-volume pulse signal. The green
 * mean is split into a slow DC component (skin tone + ambient light) and a
 * tiny AC component (pulse); the AC series is detrended, Hann-windowed and
 * swept with a DFT over the physiological band (42–210 BPM).
 *
 * Accuracy depends on lighting, contact-free distance and stillness, so a
 * 0..1 quality score accompanies every reading and the UI withholds a BPM
 * until the signal stabilises. Experimental — not a medical device.
 */

const SAMPLE_RATE = 8; // Hz — resampling grid for spectral analysis
const WINDOW_MS = 20_000; // analysis window
const KEEP_MS = 30_000; // raw buffer retention
const MIN_BPM = 42;
const MAX_BPM = 210;
const MIN_SAMPLES_FOR_READING = 64; // ≈8 s at 8 Hz after resampling

export interface PpgReading {
  /** Smoothed beats-per-minute, or null while warming up / quality too low. */
  bpm: number | null;
  /** 0..1 signal quality (lighting, stillness, pulse prominence). */
  quality: number;
  /** Pulse amplitude relative to skin reflectance — very low means weak signal. */
  perfusion: number;
  /** True while the processor has not yet seen enough clean signal. */
  warmingUp: boolean;
}

interface UniformWindow {
  values: number[]; // detrended + Hann-windowed
  sampleRate: number;
}

export class PulseProcessor {
  private readonly green: number[] = [];
  private readonly stamps: number[] = []; // ms
  private readonly recentBpm: number[] = [];
  private dc = 0;
  private dcSeeded = false;
  private smoothedBpm: number | null = null;

  reset(): void {
    this.green.length = 0;
    this.stamps.length = 0;
    this.recentBpm.length = 0;
    this.dc = 0;
    this.dcSeeded = false;
    this.smoothedBpm = null;
  }

  /** Feed one green-channel mean for the cheek ROIs at time tMs. */
  addSample(greenMean: number, tMs: number): void {
    if (!Number.isFinite(greenMean) || greenMean <= 0) return;

    if (!this.dcSeeded) {
      this.dc = greenMean;
      this.dcSeeded = true;
    } else {
      // Time-aware EMA: ~3 s time constant regardless of frame rate.
      const dt = Math.max(0, tMs - (this.stamps[this.stamps.length - 1] ?? tMs));
      const alpha = 1 - Math.exp(-dt / 3000);
      this.dc += alpha * (greenMean - this.dc);
    }

    this.green.push(greenMean);
    this.stamps.push(tMs);

    const cutoff = tMs - KEEP_MS;
    while (this.stamps.length > 0 && this.stamps[0] < cutoff) {
      this.stamps.shift();
      this.green.shift();
    }
  }

  compute(tMs: number): PpgReading {
    const window = this.buildWindow(tMs);
    if (!window || window.values.length < MIN_SAMPLES_FOR_READING) {
      return { bpm: null, quality: 0, perfusion: this.currentPerfusion(), warmingUp: true };
    }

    const perfusion = this.currentPerfusion();
    const peak = findSpectralPeak(window.values, window.sampleRate);

    if (!peak || perfusion < 0.0008) {
      this.pushBpm(null);
      return { bpm: this.smoothedBpm, quality: peak ? 0.2 : 0.05, perfusion, warmingUp: false };
    }

    const half = Math.floor(window.values.length / 2);
    const first = findSpectralPeak(window.values.slice(0, half), window.sampleRate);
    const second = findSpectralPeak(window.values.slice(half), window.sampleRate);
    const stable =
      first && second && Math.abs(first.bpm - second.bpm) <= 6 ? 1 : first && second ? 0.25 : 0;

    const prominence = clamp01(peak.prominence * 6);
    const perfusionScore = clamp01(
      // Sweet spot for a face camera at arm's length: ~0.3%–3%.
      perfusion < 0.003 ? perfusion / 0.003 : perfusion < 0.02 ? 1 : Math.max(0, 1 - (perfusion - 0.02) / 0.02),
    );
    const quality = clamp01(0.45 * prominence + 0.3 * stable + 0.25 * perfusionScore);

    if (quality >= 0.4) {
      const previous = this.smoothedBpm;
      this.smoothedBpm = previous === null ? peak.bpm : previous * 0.65 + peak.bpm * 0.35;
      this.pushBpm(peak.bpm);
    } else {
      this.pushBpm(null);
    }

    return { bpm: this.smoothedBpm, quality, perfusion, warmingUp: false };
  }

  /** Normalised AC pulse waveform (last ~4 s) for on-screen display. */
  waveform(points = 120): number[] {
    if (this.green.length < 8) return [];
    const tail = Math.min(this.green.length, 4 * 60); // ≈4 s of samples
    const start = this.green.length - tail;
    const step = Math.max(1, Math.floor(tail / points));
    const out: number[] = [];
    for (let i = start; i < this.green.length; i += step) {
      out.push(this.dc > 0 ? ((this.green[i] - this.dc) / this.dc) * 100 : 0);
    }
    return out;
  }

  /** Seconds of clean signal collected so far. */
  secondsCollected(): number {
    if (this.stamps.length < 2) return 0;
    return (this.stamps[this.stamps.length - 1] - this.stamps[0]) / 1000;
  }

  private currentPerfusion(): number {
    if (this.green.length < 16 || this.dc <= 0) return 0;
    let variance = 0;
    for (const value of this.green) {
      const ac = value - this.dc;
      variance += ac * ac;
    }
    return Math.sqrt(variance / this.green.length) / this.dc;
  }

  /** Resamples the last WINDOW_MS to a uniform grid, detrends and windows it. */
  private buildWindow(tMs: number): UniformWindow | null {
    const from = tMs - WINDOW_MS;
    const indices: number[] = [];
    for (let i = 0; i < this.stamps.length; i++) {
      if (this.stamps[i] >= from) {
        indices.push(i);
        break;
      }
    }
    if (indices.length === 0) return null;
    const start = indices[0];
    if (this.stamps.length - start < 32) return null;

    const t0 = this.stamps[start];
    const t1 = this.stamps[this.stamps.length - 1];
    if (t1 - t0 < 7_000) return null;

    const count = Math.min(256, Math.floor(((t1 - t0) / 1000) * SAMPLE_RATE));
    if (count < MIN_SAMPLES_FOR_READING) return null;

    const uniform: number[] = [];
    let cursor = start;
    for (let i = 0; i < count; i++) {
      const target = t0 + ((t1 - t0) * i) / (count - 1);
      while (cursor + 1 < this.stamps.length && this.stamps[cursor + 1] < target) cursor++;
      const next = Math.min(cursor + 1, this.stamps.length - 1);
      const span = this.stamps[next] - this.stamps[cursor] || 1;
      const ratio = clamp01((target - this.stamps[cursor]) / span);
      const raw =
        this.green[cursor] + (this.green[next] - this.green[cursor]) * ratio;
      // AC relative to the slowly-varying DC at this instant.
      uniform.push(raw - this.dc);
    }

    detrendMovingAverage(uniform, Math.round(SAMPLE_RATE * 1.1));
    applyHann(uniform);
    return { values: uniform, sampleRate: SAMPLE_RATE };
  }

  private pushBpm(value: number | null): void {
    this.recentBpm.push(value ?? NaN);
    if (this.recentBpm.length > 6) this.recentBpm.shift();
  }
}

interface SpectralPeak {
  bpm: number;
  /** Peak power vs total in-band power (0..1-ish). */
  prominence: number;
}

/** DFT sweep over the 0.7–3.5 Hz band with parabolic peak refinement. */
function findSpectralPeak(values: number[], sampleRate: number): SpectralPeak | null {
  const n = values.length;
  if (n < 32) return null;

  const minBin = Math.max(1, Math.floor((MIN_BPM / 60) * (n / sampleRate)));
  const maxBin = Math.ceil((MAX_BPM / 60) * (n / sampleRate));
  if (maxBin <= minBin) return null;

  const powers: { bin: number; power: number }[] = [];
  let total = 0;
  for (let bin = minBin; bin <= maxBin; bin++) {
    const omega = (2 * Math.PI * bin) / n;
    let real = 0;
    let imag = 0;
    for (let i = 0; i < n; i++) {
      real += values[i] * Math.cos(omega * i);
      imag -= values[i] * Math.sin(omega * i);
    }
    const power = real * real + imag * imag;
    powers.push({ bin, power });
    total += power;
  }
  if (total <= 0) return null;

  let best = powers[0];
  for (const candidate of powers) {
    if (candidate.power > best.power) best = candidate;
  }

  const index = best.bin - minBin;
  const left = powers[Math.max(0, index - 1)].power;
  const right = powers[Math.min(powers.length - 1, index + 1)].power;
  const denom = left - 2 * best.power + right;
  const offset = denom !== 0 ? clamp(0.5 * (left - right) / denom, -1, 1) : 0;

  const hz = ((best.bin + offset) * sampleRate) / n;
  return { bpm: hz * 60, prominence: best.power / total };
}

/** Centres each sample on a local moving average (removes slow drift). */
function detrendMovingAverage(values: number[], radius: number): void {
  if (radius < 1 || values.length < radius * 2 + 1) return;
  const copy = values.slice();
  for (let i = 0; i < values.length; i++) {
    const from = Math.max(0, i - radius);
    const to = Math.min(copy.length, i + radius + 1);
    let sum = 0;
    for (let j = from; j < to; j++) sum += copy[j];
    values[i] = copy[i] - sum / (to - from);
  }
}

function applyHann(values: number[]): void {
  const n = values.length;
  for (let i = 0; i < n; i++) {
    values[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
