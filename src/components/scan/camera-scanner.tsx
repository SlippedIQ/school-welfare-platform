'use client';

import { Button } from '@/components/ui/button';
import { FaceSignals, type Affect, type Alertness, type FaceReadout } from '@/lib/scan/face-signals';
import { PulseProcessor, type PpgReading } from '@/lib/scan/rppg';
import { cn } from '@/lib/cn';
import {
  Activity,
  Camera,
  CameraOff,
  Eye,
  Focus,
  Info,
  RefreshCw,
  ScanFace,
  Smile,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type SessionState = 'idle' | 'starting' | 'running' | 'error';

interface ScanMetrics {
  bpm: number | null;
  quality: number;
  perfusion: number;
  pulseWarming: boolean;
  pulseSeconds: number;
  baselineBpm: number | null;
  baselineSecondsLeft: number | null;
  stress: number | null;
  focus: number | null;
  alertness: Alertness | null;
  affect: Affect | null;
  tension: number;
  waveform: number[];
  brightness: number | null;
  facePresent: boolean;
  eyesClosed: boolean;
  hint: string | null;
}

const IDLE_METRICS: ScanMetrics = {
  bpm: null,
  quality: 0,
  perfusion: 0,
  pulseWarming: true,
  pulseSeconds: 0,
  baselineBpm: null,
  baselineSecondsLeft: null,
  stress: null,
  focus: null,
  alertness: null,
  affect: null,
  tension: 0,
  waveform: [],
  brightness: null,
  facePresent: false,
  eyesClosed: false,
  hint: null,
};

const CHEEK_RIGHT = 205;
const CHEEK_LEFT = 425;
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 54, 28, 27, 29, 40, 251,
];
const UI_TICK_MS = 500;
const DETECT_INTERVAL_MS = 45;
const BASELINE_WINDOW_MS = 15_000;

/**
 * On-device camera vitals: optical pulse (rPPG) from cheek skin, drowsiness
 * from eye tracking, plus focus/affect estimates from facial cues. MediaPipe
 * runs entirely in the browser — no frame ever leaves the device.
 */
export function CameraScanner() {
  const [session, setSession] = useState<SessionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [metrics, setMetrics] = useState<ScanMetrics>(IDLE_METRICS);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const waveRef = useRef<HTMLCanvasElement | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<import('@mediapipe/tasks-vision').FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pulseRef = useRef<PulseProcessor | null>(null);
  const signalsRef = useRef<FaceSignals | null>(null);
  const baselineRef = useRef<{ samples: { t: number; bpm: number }[]; value: number | null }>({
    samples: [],
    value: null,
  });
  const lastDetectRef = useRef(0);
  const lastUiRef = useRef(0);
  const failureRef = useRef(0);
  const lastReadoutRef = useRef<FaceReadout | null>(null);
  const facingRef = useRef(facing);
  facingRef.current = facing;

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    landmarkerRef.current?.close();
    landmarkerRef.current = null;

    pulseRef.current = null;
    signalsRef.current = null;
    lastReadoutRef.current = null;
    baselineRef.current = { samples: [], value: null };
    failureRef.current = 0;

    if (videoRef.current) videoRef.current.srcObject = null;
    const overlay = overlayRef.current;
    if (overlay) overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);

    setMetrics(IDLE_METRICS);
    setSession('idle');
  }, []);

  const start = useCallback(async () => {
    setSession('starting');
    setError(null);

    try {
      if (!window.isSecureContext) {
        throw new Error('A camera needs a secure connection (https). Try the deployed site.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingRef.current, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error('Video element is not ready.');
      video.srcObject = stream;
      await video.play();

      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks('/vision/wasm');

      let landmarker: import('@mediapipe/tasks-vision').FaceLandmarker;
      try {
        landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
        });
      } catch {
        // No WebGL/usable GPU — fall back to the WASM CPU delegate.
        landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
        });
      }
      landmarkerRef.current = landmarker;

      const sampleCanvas = document.createElement('canvas');
      sampleCanvasRef.current = sampleCanvas;
      pulseRef.current = new PulseProcessor();
      signalsRef.current = new FaceSignals();
      baselineRef.current = { samples: [], value: null };
      failureRef.current = 0;
      lastDetectRef.current = 0;
      lastUiRef.current = 0;

      setSession('running');
      requestAnimationFrame(tick);
    } catch (cause) {
      const message =
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser and try again.'
          : cause instanceof DOMException && cause.name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : cause instanceof Error
              ? cause.message
              : 'Could not start the camera.';
      stop();
      setSession('error');
      setError(message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop]);

  /** Per-frame pipeline: detect → overlay → sample → rollup (2 Hz UI). */
  const tick = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    const pulse = pulseRef.current;
    const signals = signalsRef.current;
    const now = performance.now();

    if (video && landmarker && pulse && signals && video.readyState >= 2) {
      if (now - lastDetectRef.current >= DETECT_INTERVAL_MS) {
        lastDetectRef.current = now;
        let facePresent = false;
        try {
          const result = landmarker.detectForVideo(video, Math.round(now));
          const face = result.faceLandmarks?.[0];
          if (face) {
            facePresent = true;
            const shapes = result.faceBlendshapes?.[0]?.categories ?? [];
            lastReadoutRef.current = signals.push(face, shapes, now);
            sampleSkin(video, face, now, pulse);
            drawOverlay(face, signals.eyesCurrentlyClosed());
            failureRef.current = 0;
          } else {
            clearOverlay();
          }
        } catch {
          // Individual frames can fail transiently; only a sustained burst
          // (e.g. the camera feed dying) aborts the session.
          failureRef.current += 1;
          if (failureRef.current > 100) {
            stop();
            setSession('error');
            setError('The camera feed stopped responding. Restart the scan.');
            return;
          }
        }

        if (now - lastUiRef.current >= UI_TICK_MS) {
          lastUiRef.current = now;
          const reading = pulse.compute(now);
          const readout = lastReadoutRef.current;
          setMetrics(buildMetrics(reading, readout, facePresent, pulse, signals));
        }
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop]);

  /* ----------------------------- pipeline bits ---------------------------- */

  function sampleSkin(
    video: HTMLVideoElement,
    face: import('@mediapipe/tasks-vision').NormalizedLandmark[],
    now: number,
    pulse: PulseProcessor,
  ) {
    const canvas = sampleCanvasRef.current;
    if (!canvas) return;
    const width = 160;
    const height = Math.max(90, Math.round((160 * video.videoHeight) / (video.videoWidth || 1)));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(video, 0, 0, width, height);

    const greenSamples: number[] = [];
    for (const index of [CHEEK_RIGHT, CHEEK_LEFT]) {
      const point = face[index];
      if (!point) continue;
      const x = Math.round(point.x * width);
      const y = Math.round(point.y * height);
      const radius = 4;
      if (
        x - radius < 0 ||
        y - radius < 0 ||
        x + radius >= width ||
        y + radius >= height
      ) {
        continue;
      }
      const patch = context.getImageData(x - radius, y - radius, radius * 2, radius * 2).data;
      let sum = 0;
      for (let i = 1; i < patch.length; i += 4) sum += patch[i]; // green channel
      greenSamples.push(sum / (patch.length / 4));
    }
    if (greenSamples.length > 0) {
      pulse.addSample(
        greenSamples.reduce((a, b) => a + b, 0) / greenSamples.length,
        now,
      );
    }
  }

  function drawOverlay(face: import('@mediapipe/tasks-vision').NormalizedLandmark[], eyesClosed: boolean) {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || video.videoWidth === 0) return;
    if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
    }
    const context = overlay.getContext('2d');
    if (!context) return;
    const { width, height } = overlay;
    context.clearRect(0, 0, width, height);

    context.strokeStyle = 'rgba(52, 211, 153, 0.65)';
    context.lineWidth = 2;
    context.beginPath();
    FACE_OVAL.forEach((index, position) => {
      const point = face[index];
      if (!point) return;
      const x = point.x * width;
      const y = point.y * height;
      if (position === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.stroke();

    context.fillStyle = eyesClosed ? 'rgba(244, 63, 94, 0.9)' : 'rgba(56, 189, 248, 0.9)';
    for (const index of [33, 133, 362, 263]) {
      const point = face[index];
      if (!point) continue;
      context.beginPath();
      context.arc(point.x * width, point.y * height, 3, 0, Math.PI * 2);
      context.fill();
    }

    context.strokeStyle = 'rgba(250, 204, 21, 0.8)';
    context.lineWidth = 1.5;
    for (const index of [CHEEK_RIGHT, CHEEK_LEFT]) {
      const point = face[index];
      if (!point) continue;
      const size = 22;
      context.strokeRect(point.x * width - size / 2, point.y * height - size / 2, size, size);
    }
  }

  function clearOverlay() {
    const overlay = overlayRef.current;
    if (overlay) overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
  }

  function buildMetrics(
    reading: PpgReading,
    readout: FaceReadout | null,
    facePresent: boolean,
    pulse: PulseProcessor,
    signals: FaceSignals,
  ): ScanMetrics {
    const baseline = baselineRef.current;
    if (reading.bpm !== null && reading.quality >= 0.45 && baseline.value === null) {
      baseline.samples.push({ t: performance.now(), bpm: reading.bpm });
      const first = baseline.samples[0];
      const enoughTime = performance.now() - first.t >= BASELINE_WINDOW_MS;
      if (baseline.samples.length >= 6 && enoughTime) {
        const sorted = baseline.samples.map((s) => s.bpm).sort((a, b) => a - b);
        baseline.value = sorted[Math.floor(sorted.length / 2)];
      }
    }
    const firstSample = baseline.samples[0];
    const baselineSecondsLeft =
      baseline.value !== null || !firstSample
        ? null
        : Math.max(
            0,
            Math.ceil(
              (BASELINE_WINDOW_MS - (performance.now() - firstSample.t)) / 1000,
            ),
          );

    let stress: number | null = null;
    if (baseline.value !== null && reading.bpm !== null && readout) {
      const hrDev = Math.min(1, Math.max(0, (reading.bpm - baseline.value) / 40));
      const motionPenalty = Math.min(1, readout.headMotion / 0.9);
      stress = Math.round(
        Math.min(
          100,
          Math.max(0, 100 * (0.45 * hrDev + 0.4 * readout.tension + 0.15 * motionPenalty)),
        ),
      );
    }

    const brightness = estimateBrightness();
    let hint: string | null = null;
    if (!facePresent) hint = 'Position your face inside the frame';
    else if (readout?.turnedAway) hint = 'Face the camera directly';
    else if (brightness !== null && brightness < 0.22) hint = 'Move to brighter light';
    else if (brightness !== null && brightness > 0.92) hint = 'Light is too strong — angle away';
    else if (reading.perfusion < 0.001 && !reading.warmingUp)
      hint = 'Hold still for a cleaner pulse signal';
    else if (baselineSecondsLeft !== null)
      hint = `Calibrating baseline heart rate — ${baselineSecondsLeft}s left`;
    else if (reading.warmingUp) hint = 'Warming up the pulse signal…';

    return {
      bpm: reading.bpm,
      quality: reading.quality,
      perfusion: reading.perfusion,
      pulseWarming: reading.warmingUp,
      pulseSeconds: pulse.secondsCollected(),
      baselineBpm: baseline.value,
      baselineSecondsLeft,
      stress,
      focus: readout?.focusScore ?? null,
      alertness: readout?.alertness ?? null,
      affect: readout?.affect ?? null,
      tension: readout?.tension ?? 0,
      waveform: pulse.waveform(),
      brightness,
      facePresent,
      eyesClosed: signals.eyesCurrentlyClosed(),
      hint,
    };
  }

  function estimateBrightness(): number | null {
    const canvas = sampleCanvasRef.current;
    if (!canvas) return null;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 64) {
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      count++;
    }
    return count > 0 ? sum / count / 255 : null;
  }

  /* ------------------------------ waveform -------------------------------- */

  useEffect(() => {
    const canvas = waveRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    const values = metrics.waveform;
    if (values.length < 4) return;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    context.beginPath();
    values.forEach((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 6) - 3;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = metrics.quality >= 0.4 ? '#10b981' : '#a1a1aa';
    context.lineWidth = 1.5;
    context.stroke();
  }, [metrics.waveform, metrics.quality]);

  useEffect(() => () => stop(), [stop]);

  /* --------------------------------- UI ----------------------------------- */

  const running = session === 'running';

  return (
    <div className="space-y-4">
      {/* Honest scope banner */}
      <div className="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
        <p className="text-xs leading-5 text-sky-900">
          <span className="font-semibold">Experimental camera vitals.</span> Heart rate is measured
          optically from your skin (rPPG); drowsiness uses eye-openness tracking; stress, focus and
          affect are heuristic estimates from facial cues. Good light + holding still = better
          numbers. <span className="font-medium">Not a medical device.</span> Everything is
          processed on this device — no video is ever uploaded.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Camera */}
        <section className="lg:col-span-3">
          <div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-slate-950 shadow-panel">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
            />
            <canvas
              ref={overlayRef}
              className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
            />

            {/* Status chips */}
            {running ? (
              <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-2xs font-medium text-white backdrop-blur">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 animate-pulse rounded-full',
                      metrics.facePresent ? 'bg-emerald-400' : 'bg-amber-400',
                    )}
                  />
                  {metrics.facePresent ? 'FACE TRACKED' : 'LOOKING FOR FACE'}
                </span>
                {metrics.eyesClosed ? (
                  <span className="rounded-md bg-rose-600/85 px-2 py-1 text-2xs font-medium text-white">
                    EYES CLOSED
                  </span>
                ) : null}
              </div>
            ) : null}

            {running && metrics.hint ? (
              <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur">
                {metrics.hint}
              </div>
            ) : null}

            {/* Idle / starting / error overlay */}
            {!running ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">
                  {session === 'error' ? <CameraOff className="h-5 w-5" /> : <ScanFace className="h-5 w-5" />}
                </span>
                <div>
                  <p className="text-sm font-medium text-white">
                    {session === 'starting'
                      ? 'Starting camera…'
                      : session === 'error'
                        ? 'Camera unavailable'
                        : 'Camera vitals scanner'}
                  </p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
                    {session === 'error'
                      ? error
                      : 'Check your own pulse, alertness and focus on the go — or demo it during a welfare session.'}
                  </p>
                </div>
                {session !== 'starting' ? (
                  <Button
                    variant="primary"
                    onClick={() => void start()}
                    icon={<Camera className="h-4 w-4" />}
                  >
                    {session === 'error' ? 'Try again' : 'Start scan'}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant={running ? 'danger' : 'primary'}
              onClick={() => (running ? stop() : void start())}
              icon={running ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            >
              {running ? 'Stop scan' : 'Start scan'}
            </Button>
            <Button
              variant="secondary"
              disabled={!running}
              onClick={() => {
                const next = facing === 'user' ? 'environment' : 'user';
                facingRef.current = next;
                setFacing(next);
                if (session === 'running') {
                  stop();
                  void start();
                }
              }}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              Switch camera
            </Button>
            <span className="text-2xs text-ink-faint">
              {running
                ? `signal captured ${metrics.pulseSeconds.toFixed(0)}s · processing stays on-device`
                : 'https required · nothing is uploaded'}
            </span>
          </div>
        </section>

        {/* Metrics */}
        <section className="space-y-3 lg:col-span-2">
          {/* Heart rate */}
          <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-ink-faint">
                <Activity className="h-3.5 w-3.5" />
                Heart rate (optical)
              </p>
              <Badgeish
                tone={
                  metrics.baselineBpm === null
                    ? 'neutral'
                    : metrics.bpm !== null && metrics.bpm >= metrics.baselineBpm + 20
                      ? 'warning'
                      : 'success'
                }
              >
                {metrics.baselineBpm === null
                  ? 'calibrating'
                  : metrics.bpm !== null && metrics.bpm >= metrics.baselineBpm + 20
                    ? 'above baseline'
                    : 'near baseline'}
              </Badgeish>
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular leading-8 text-ink">
                {metrics.bpm !== null ? Math.round(metrics.bpm) : '—'}
              </span>
              <span className="text-xs text-ink-faint">BPM</span>
              <span className="ml-auto text-2xs text-ink-faint">
                {metrics.baselineBpm !== null
                  ? `resting ${Math.round(metrics.baselineBpm)}`
                  : 'establishing resting rate'}
              </span>
            </div>

            <canvas ref={waveRef} width={320} height={44} className="mt-2 h-11 w-full" />

            <div className="mt-1.5">
              <div className="flex items-center justify-between text-2xs text-ink-faint">
                <span>signal quality</span>
                <span>{Math.round(metrics.quality * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    metrics.quality >= 0.7
                      ? 'bg-emerald-500'
                      : metrics.quality >= 0.4
                        ? 'bg-amber-500'
                        : 'bg-rose-400',
                  )}
                  style={{ width: `${Math.round(metrics.quality * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MetricTile
              label="Stress"
              icon={<Activity className="h-3.5 w-3.5" />}
              value={metrics.stress !== null ? `${metrics.stress}` : '—'}
              unit={metrics.stress !== null ? '/100' : ''}
              tone={
                metrics.stress === null
                  ? 'neutral'
                  : metrics.stress >= 66
                    ? 'danger'
                    : metrics.stress >= 33
                      ? 'warning'
                      : 'success'
                  }
              footer={
                metrics.stress === null
                  ? metrics.baselineSecondsLeft !== null
                    ? 'calibrating'
                    : 'needs pulse'
                  : metrics.stress >= 66
                    ? 'high — consider a break'
                    : metrics.stress >= 33
                      ? 'moderate'
                      : 'low'
              }
            />
            <MetricTile
              label="Alertness"
              icon={<Eye className="h-3.5 w-3.5" />}
              value={
                metrics.alertness === null
                  ? '—'
                  : metrics.alertness === 'ALERT'
                    ? 'Awake'
                    : metrics.alertness === 'DROWSY'
                      ? 'Drowsy'
                      : metrics.alertness === 'YAWNING'
                        ? 'Yawning'
                        : 'Sleepy'
              }
              tone={
                metrics.alertness === 'ALERT'
                  ? 'success'
                  : metrics.alertness === 'DROWSY' || metrics.alertness === 'YAWNING'
                    ? 'warning'
                    : metrics.alertness === 'VERY_SLEEPY'
                      ? 'danger'
                      : 'neutral'
              }
              footer={metrics.alertness === null ? 'eye tracking warm-up' : 'PERCLOS eye tracking'}
            />
            <MetricTile
              label="Concentration"
              icon={<Focus className="h-3.5 w-3.5" />}
              value={metrics.focus !== null ? `${metrics.focus}` : '—'}
              unit={metrics.focus !== null ? '/100' : ''}
              tone={
                metrics.focus === null
                  ? 'neutral'
                  : metrics.focus >= 65
                    ? 'success'
                    : metrics.focus >= 40
                      ? 'warning'
                      : 'danger'
              }
              footer={
                metrics.focus === null
                  ? 'gaze warm-up'
                  : metrics.focus >= 65
                    ? 'focused gaze'
                    : metrics.focus >= 40
                      ? 'neutral'
                      : 'gaze wandering'
              }
            />
            <MetricTile
              label="Affect"
              icon={<Smile className="h-3.5 w-3.5" />}
              value={
                metrics.affect === null
                  ? '—'
                  : metrics.affect === 'POSITIVE'
                    ? 'Positive'
                    : metrics.affect === 'TENSE'
                      ? 'Tense'
                      : 'Neutral'
              }
              tone={
                metrics.affect === 'TENSE'
                  ? 'warning'
                  : metrics.affect === 'POSITIVE'
                    ? 'success'
                    : 'neutral'
              }
              footer={
                metrics.affect === null
                  ? 'reading facial cues'
                  : `tension ${Math.round(metrics.tension * 100)}%`
              }
            />
          </div>
        </section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small presentational pieces                                                */
/* -------------------------------------------------------------------------- */

function MetricTile({
  label,
  icon,
  value,
  unit,
  tone,
  footer,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  unit?: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  footer: string;
}) {
  const toneClasses = {
    neutral: 'text-ink',
    success: 'text-emerald-600',
    warning: 'text-amber-600',
    danger: 'text-rose-600',
  };
  return (
    <div className="rounded-lg border border-line bg-white p-3.5 shadow-panel">
      <p className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-ink-faint">
        {icon}
        {label}
      </p>
      <p className={cn('mt-1.5 text-xl font-semibold tabular leading-6', toneClasses[tone])}>
        {value}
        {unit ? <span className="ml-0.5 text-2xs font-normal text-ink-faint">{unit}</span> : null}
      </p>
      <p className="mt-1 truncate text-2xs text-ink-faint">{footer}</p>
    </div>
  );
}

function Badgeish({
  tone,
  children,
}: {
  tone: 'neutral' | 'success' | 'warning';
  children: React.ReactNode;
}) {
  const classes = {
    neutral: 'border-line bg-surface-muted text-ink-muted',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
  };
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-md border px-1.5 py-0.5 text-2xs font-medium',
        classes[tone],
      )}
    >
      {children}
    </span>
  );
}
