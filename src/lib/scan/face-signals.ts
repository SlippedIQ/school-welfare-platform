/**
 * Facial-cue extraction for the camera vitals scanner.
 *
 * Consumes one frame of MediaPipe Face Landmarker output (478 landmarks +
 * blendshapes) and maintains rolling windows that power:
 *
 * - Alertness: eye-aspect-ratio with PERCLOS (fraction of time eyes are
 *   closed — the standard in driver-fatigue systems), yawns, head droop.
 * - Focus: gaze-point stability (iris centres) + head stillness, penalised
 *   by drowsiness. A screen-gaze proxy, not a cognitive measurement.
 * - Tension/affect: facial muscle signals (brow down, eye squint, mouth
 *   frown vs. smile) from blendshape weights — heuristic proxies.
 *
 * All signals are experimental and intentionally conservative: readings
 * stay `null` until enough signal has been observed.
 */

import type { Category, NormalizedLandmark } from '@mediapipe/tasks-vision';

const KEEP_MS = 60_000;
const EYE_CLOSED_RATIO = 0.72; // closed when EAR falls below 72% of baseline
const EAR_CLAMP = 0.21; // …and below this absolute value
const YAWN_JAW_OPEN = 0.32;
const YAWN_MIN_MS = 1_000;
const TURNED_AWAY_YAW = 0.45; // nose offset in inter-eye units

// MediaPipe FaceMesh indices (478-point model, eyes include irises).
const RIGHT_EYE = { outer: 33, inner: 133, top1: 160, top2: 158, bottom1: 144, bottom2: 153 } as const;
const LEFT_EYE = { outer: 362, inner: 263, top1: 385, top2: 387, bottom1: 380, bottom2: 373 } as const;
const RIGHT_IRIS = 468;
const LEFT_IRIS = 473;
const FOREHEAD = 10;
const CHIN = 152;
const NOSE_TIP = 4;

export type Alertness = 'ALERT' | 'DROWSY' | 'VERY_SLEEPY' | 'YAWNING';
export type Affect = 'POSITIVE' | 'NEUTRAL' | 'TENSE';

export interface FaceReadout {
  /** Smoothed eye aspect ratio; null until a face is tracked. */
  ear: number | null;
  /** Rolling drowsiness classification; null while warming up. */
  alertness: Alertness | null;
  /** 0..100 screen-gaze focus proxy; null while warming up. */
  focusScore: number | null;
  /** 0..1 facial muscle tension (EMA). */
  tension: number;
  affect: Affect | null;
  yawnActive: boolean;
  /** Fraction of the last 60 s with eyes closed (PERCLOS). */
  perclos: number;
  /** Head movement speed in face-widths per second (EMA). */
  headMotion: number;
  gazeStability: number | null;
  turnedAway: boolean;
  secondsCollected: number;
}

interface TimedClosure {
  t: number;
  closed: boolean;
}

export class FaceSignals {
  private readonly closures: TimedClosure[] = [];
  private readonly gaze: { t: number; x: number; y: number }[] = [];

  private firstTimestamp: number | null = null;
  private lastTimestamp: number | null = null;
  private lastEyeCenter: { x: number; y: number } | null = null;

  private baselineEar = 0;
  private smoothedEar: number | null = null;
  private smoothedTension = 0;
  private smoothedSmile = 0;
  private smoothedMotion = 0;
  private pitchBaseline: number | null = null;

  private yawnSince: number | null = null;
  private yawnActive = false;
  private lastEyeClosedAt: number | null = null;

  reset(): void {
    this.closures.length = 0;
    this.gaze.length = 0;
    this.firstTimestamp = null;
    this.lastTimestamp = null;
    this.lastEyeCenter = null;
    this.baselineEar = 0;
    this.smoothedEar = null;
    this.smoothedTension = 0;
    this.smoothedSmile = 0;
    this.smoothedMotion = 0;
    this.pitchBaseline = null;
    this.yawnSince = null;
    this.yawnActive = false;
    this.lastEyeClosedAt = null;
  }

  /** Feed one tracked frame. Returns the rolling readout. */
  push(landmarks: NormalizedLandmark[], blendshapes: Category[], timestampMs: number): FaceReadout {
    if (this.firstTimestamp === null) this.firstTimestamp = timestampMs;
    this.lastTimestamp = timestampMs;

    const shapes = new Map<string, number>();
    for (const shape of blendshapes) shapes.set(shape.categoryName, shape.score);

    /* ------------------------------- eyes -------------------------------- */

    const ear = eyeAspectRatio(landmarks);
    if (ear !== null) {
      if (this.baselineEar === 0) this.baselineEar = ear;
      // Baseline tracks the widest recent opening so glasses/headdrafts don't skew it.
      this.baselineEar = Math.max(this.baselineEar * 0.999, Math.min(ear, 0.45));
      this.smoothedEar = this.smoothedEar === null ? ear : this.smoothedEar * 0.6 + ear * 0.4;
    }
    const closedThreshold = Math.min(EAR_CLAMP, this.baselineEar * EYE_CLOSED_RATIO);
    const closed = this.smoothedEar !== null && this.smoothedEar < closedThreshold;

    if (this.closures.length > 0 || closed) {
      this.closures.push({ t: timestampMs, closed });
    }
    const from = timestampMs - KEEP_MS;
    while (this.closures.length > 0 && this.closures[0].t < from) this.closures.shift();

    if (closed) this.lastEyeClosedAt = timestampMs;

    /* ------------------------------- yawn -------------------------------- */

    const jawOpen = average(shapes, 'jawOpen', 'jawLeft', 'jawRight');
    if (jawOpen > YAWN_JAW_OPEN && !closed) {
      this.yawnSince ??= timestampMs;
      if (timestampMs - this.yawnSince >= YAWN_MIN_MS) this.yawnActive = true;
    } else if (jawOpen < YAWN_JAW_OPEN * 0.6 || closed) {
      this.yawnSince = null;
      this.yawnActive = false;
    }

    /* --------------------------- muscle tension -------------------------- */

    const tension = average(
      shapes,
      'browDownLeft',
      'browDownRight',
      'eyeSquintLeft',
      'eyeSquintRight',
      'mouthFrownLeft',
      'mouthFrownRight',
    );
    const smile =
      average(shapes, 'mouthSmileLeft', 'mouthSmileRight') -
      average(shapes, 'mouthFrownLeft', 'mouthFrownRight');
    this.smoothedTension = this.smoothedTension * 0.85 + tension * 0.15;
    this.smoothedSmile = this.smoothedSmile * 0.85 + clamp01(smile) * 0.15;

    /* ---------------------------- head & gaze ---------------------------- */

    const rightCenter = midpoint(landmarks[RIGHT_EYE.outer], landmarks[RIGHT_EYE.inner]);
    const leftCenter = midpoint(landmarks[LEFT_EYE.outer], landmarks[LEFT_EYE.inner]);
    const eyeMid = midpoint(rightCenter, leftCenter);
    const interEye = distance(rightCenter, leftCenter);

    const forehead = landmarks[FOREHEAD];
    const chin = landmarks[CHIN];
    const faceHeight = distance(forehead, chin);
    const nose = landmarks[NOSE_TIP];
    const noseYaw = interEye > 0 ? Math.abs(nose.x - eyeMid.x) / interEye : 0;
    const turnedAway = noseYaw > TURNED_AWAY_YAW;

    // Pitch: forehead-to-eyes vs eyes-to-chin ratio shrinks as the head droops.
    const pitchRatio = distance(forehead, eyeMid) / Math.max(distance(eyeMid, chin), 1e-6);
    this.pitchBaseline = this.pitchBaseline === null
      ? pitchRatio
      : this.pitchBaseline * 0.995 + pitchRatio * 0.005;
    const pitchDelta =
      this.pitchBaseline > 0 ? (pitchRatio - this.pitchBaseline) / this.pitchBaseline : 0;
    const drooping = pitchDelta < -0.045;

    let motion = 0;
    if (this.lastEyeCenter !== null && faceHeight > 0 && this.lastTimestamp !== null) {
      const dt = Math.max(0.04, (timestampMs - this.lastTimestamp) / 1000);
      const speed = distance(eyeMid, this.lastEyeCenter) / faceHeight / dt; // face-widths/s
      this.smoothedMotion = this.smoothedMotion * 0.8 + speed * 0.2;
      motion = this.smoothedMotion;
    }
    this.lastEyeCenter = eyeMid;

    const rightIris = landmarks[RIGHT_IRIS];
    const leftIris = landmarks[LEFT_IRIS];
    if (rightIris && leftIris) {
      this.gaze.push({
        t: timestampMs,
        x: normalizedGaze(rightIris, landmarks[RIGHT_EYE.outer], landmarks[RIGHT_EYE.inner], interEye),
        y: (rightIris.y + leftIris.y) / 2 - eyeMid.y,
      });
    }
    while (this.gaze.length > 0 && this.gaze[0].t < from) this.gaze.shift();

    /* ----------------------------- readouts ------------------------------ */

    const seconds = this.firstTimestamp !== null ? (timestampMs - this.firstTimestamp) / 1000 : 0;
    const perclos = this.perclos();

    let alertness: Alertness | null = null;
    if (seconds >= 5) {
      alertness = this.yawnActive
        ? 'YAWNING'
        : perclos >= 0.35 || (drooping && perclos >= 0.2)
          ? 'VERY_SLEEPY'
          : perclos >= 0.15 || drooping
            ? 'DROWSY'
            : 'ALERT';
    }

    const gazeStability = this.gazeStability();
    let focusScore: number | null = null;
    if (seconds >= 10 && gazeStability !== null) {
      const motionPenalty = clamp01(motion / 0.9);
      const base = 0.55 * gazeStability + 0.45 * (1 - motionPenalty);
      focusScore = Math.round(
        clamp(
          100 * base - 30 * perclos - (this.yawnActive ? 25 : 0) - (turnedAway ? 15 : 0),
          0,
          100,
        ),
      );
    }

    let affect: Affect | null = null;
    if (seconds >= 4) {
      affect =
        this.smoothedTension > 0.42 ? 'TENSE' : this.smoothedSmile > 0.3 ? 'POSITIVE' : 'NEUTRAL';
    }

    return {
      ear: this.smoothedEar,
      alertness,
      focusScore,
      tension: this.smoothedTension,
      affect,
      yawnActive: this.yawnActive,
      perclos,
      headMotion: motion,
      gazeStability,
      turnedAway,
      secondsCollected: seconds,
    };
  }

  /** Seconds until this.readout values leave their warm-up nulls (≈10 s). */
  warmupSeconds(): number {
    return 10;
  }

  /** True while the eyes appear closed right now (for live overlays). */
  eyesCurrentlyClosed(): boolean {
    if (this.lastEyeClosedAt === null || this.lastTimestamp === null) return false;
    return this.lastTimestamp - this.lastEyeClosedAt < 350;
  }

  private perclos(): number {
    if (this.closures.length < 8) return 0;
    let closedCount = 0;
    for (const entry of this.closures) {
      if (entry.closed) closedCount++;
    }
    return closedCount / this.closures.length;
  }

  private gazeStability(): number | null {
    if (this.gaze.length < 30) return null;
    const meanX = this.gaze.reduce((sum, p) => sum + p.x, 0) / this.gaze.length;
    const meanY = this.gaze.reduce((sum, p) => sum + p.y, 0) / this.gaze.length;
    const variance =
      this.gaze.reduce((sum, p) => sum + (p.x - meanX) ** 2 + (p.y - meanY) ** 2, 0) /
      this.gaze.length;
    const stdev = Math.sqrt(variance);
    // ~0.08 inter-eye units of wander ≈ fully distracted.
    return clamp01(1 - stdev / 0.08);
  }
}

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                            */
/* -------------------------------------------------------------------------- */

function eyeAspectRatio(points: NormalizedLandmark[]): number | null {
  const parts = [RIGHT_EYE, LEFT_EYE];
  let sum = 0;
  let seen = 0;
  for (const eye of parts) {
    const outer = points[eye.outer];
    const inner = points[eye.inner];
    const top1 = points[eye.top1];
    const top2 = points[eye.top2];
    const bottom1 = points[eye.bottom1];
    const bottom2 = points[eye.bottom2];
    if (!outer || !inner || !top1 || !top2 || !bottom1 || !bottom2) continue;
    const width = distance(outer, inner);
    if (width <= 0) continue;
    const height = (distance(top1, bottom1) + distance(top2, bottom2)) / 2;
    sum += height / width;
    seen++;
  }
  return seen > 0 ? sum / seen : null;
}

function normalizedGaze(
  iris: NormalizedLandmark,
  outer: NormalizedLandmark,
  inner: NormalizedLandmark,
  interEye: number,
): number {
  if (interEye <= 0) return 0;
  const center = midpoint(outer, inner);
  return (iris.x - center.x) / interEye;
}

/** Minimal 2-D point; satisfies both screen points and NormalizedLandmarks. */
type Point = { x: number; y: number };

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function average(shapes: Map<string, number>, ...names: string[]): number {
  if (names.length === 0) return 0;
  let sum = 0;
  for (const name of names) sum += shapes.get(name) ?? 0;
  return sum / names.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
