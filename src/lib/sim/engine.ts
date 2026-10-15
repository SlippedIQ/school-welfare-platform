/**
 * Local simulation engine.
 *
 * Runs a background interval (default 4s) that evolves every student's
 * biometrics with a latent "stress momentum" model, occasionally produces
 * stress/health spikes, evaluates threshold policy, persists readings and
 * alerts to SQLite, and broadcasts snapshots to subscribers (SSE clients).
 *
 * A single instance lives on `globalThis` so Next.js route handlers created by
 * different bundles all share the same tick and state.
 */
import { db } from '@/lib/db';
import {
  THRESHOLDS,
  readingBand,
  type AlertDTO,
  type BioState,
  type LiveSnapshot,
  type LiveStreamDTO,
  type LiveStudentDTO,
  type ObservationDTO,
  type Severity,
  type StressLevel,
} from '@/lib/types';

const TICK_MS = clamp(Number(process.env.SIM_TICK_MS ?? 4000) || 4000, 1000, 30_000);
const TREND_LENGTH = 30;
const MAX_ALERTS_IN_MEMORY = 60;
const LOG_RETENTION_MS = 24 * 60 * 60 * 1000;
const PRUNE_EVERY_TICKS = 75; // ~5 minutes at the default cadence
const ALERT_COOLDOWN_MS: Record<Severity, number> = { WARNING: 120_000, CRITICAL: 60_000 };
const SPIKE_CHANCE_PER_TICK = 0.04;
const SENSOR_DROPOUT_CHANCE = 0.015;
const CALM_TARGET = 0.18;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

interface RosterEntry {
  id: string;
  fullName: string;
  gradeClass: string;
  admissionNo: string;
  baselineHeartRate: number;
  classroomId: string | null;
}

interface LiveState {
  heartRate: number;
  bodyTemp: number;
  stressLevel: StressLevel;
  state: BioState;
  sensorStatus: 'ONLINE' | 'OFFLINE';
  momentum: number;
  trend: number[];
  updatedAt: number;
  offlineUntil: number;
}

interface StreamState {
  classroomId: string;
  /** False when the classroom has no stream gateway path configured. */
  configured: boolean;
  online: boolean;
  latencyMs: number;
  bitrateKbps: number;
  degradedUntil: number;
}

export class SimulationEngine {
  private roster = new Map<string, RosterEntry>();
  private live = new Map<string, LiveState>();
  private streams = new Map<string, StreamState>();
  private alerts: AlertDTO[] = [];
  private subscribers = new Set<(snapshot: LiveSnapshot) => void>();
  private alertCooldowns = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readyPromise: Promise<void> | null = null;
  private seq = 0;
  private tickCount = 0;

  /* ---------------------------------------------------------------------- */
  /* Lifecycle                                                              */
  /* ---------------------------------------------------------------------- */

  /** Idempotent boot: loads roster/streams/alerts once, then starts ticking. */
  ensureReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.bootstrap().catch((error) => {
        // Allow a retry on the next call if the DB was unavailable (e.g. the
        // schema has not been pushed yet).
        this.readyPromise = null;
        console.error('[sim] bootstrap failed:', error);
        throw error;
      });
    }
    return this.readyPromise;
  }

  start(): void {
    if (this.timer) return;
    void this.ensureReady().catch(() => undefined);
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_MS);
    // Do not keep the Node process alive purely for the simulator.
    this.timer.unref?.();
  }

  private async bootstrap(): Promise<void> {
    await this.syncRoster();

    const recentLogs = await db.biometricLog
      .findMany({
        orderBy: { timestamp: 'desc' },
        take: 600,
        select: {
          studentId: true,
          heartRate: true,
          timestamp: true,
        },
      })
      .catch(() => [] as { studentId: string; heartRate: number; timestamp: Date }[]);

    const trendByStudent = new Map<string, number[]>();
    for (const log of recentLogs) {
      const trend = trendByStudent.get(log.studentId) ?? [];
      if (trend.length < TREND_LENGTH) trend.push(log.heartRate);
      trendByStudent.set(log.studentId, trend);
    }
    for (const [studentId, trend] of trendByStudent) {
      const state = this.live.get(studentId);
      if (state) state.trend = trend.reverse();
    }

    const recentAlerts = await db.alertLog
      .findMany({
        orderBy: { timestamp: 'desc' },
        take: MAX_ALERTS_IN_MEMORY,
        include: { student: { select: { fullName: true, gradeClass: true } } },
      })
      .catch(() => []);
    this.alerts = recentAlerts.map((alert) => ({
      id: alert.id,
      studentId: alert.studentId,
      studentName: alert.student.fullName,
      gradeClass: alert.student.gradeClass,
      severity: alert.severity as Severity,
      message: alert.message,
      timestamp: alert.timestamp.toISOString(),
      isRead: alert.isRead,
    }));
  }

  /* ---------------------------------------------------------------------- */
  /* Data access                                                            */
  /* ---------------------------------------------------------------------- */

  /**
   * Re-reads students and classrooms from the DB, preserving live state for
   * students that still exist. Called on boot and after every CRUD mutation.
   */
  async syncRoster(): Promise<void> {
    const [students, classrooms] = await Promise.all([
      db.student.findMany({
        select: {
          id: true,
          fullName: true,
          gradeClass: true,
          admissionNo: true,
          baselineHeartRate: true,
          classroomId: true,
        },
        orderBy: { fullName: 'asc' },
      }),
      db.classroom.findMany({
        select: { id: true, streamUrl: true },
      }),
    ]);

    const seenStudents = new Set<string>();
    for (const student of students) {
      seenStudents.add(student.id);
      if (!this.live.has(student.id)) {
        this.live.set(student.id, this.seedLiveState(student.baselineHeartRate));
      }
      this.roster.set(student.id, {
        id: student.id,
        fullName: student.fullName,
        gradeClass: student.gradeClass,
        admissionNo: student.admissionNo,
        baselineHeartRate: student.baselineHeartRate,
        classroomId: student.classroomId,
      });
    }

    for (const id of [...this.roster.keys()]) {
      if (!seenStudents.has(id)) {
        this.roster.delete(id);
        this.live.delete(id);
      }
    }

    const seenClassrooms = new Set<string>();
    for (const classroom of classrooms) {
      seenClassrooms.add(classroom.id);
      const configured = classroom.streamUrl.trim().length > 0;
      const existing = this.streams.get(classroom.id);
      if (existing) {
        existing.configured = configured;
        if (!configured) {
          existing.online = false;
          existing.latencyMs = 0;
          existing.bitrateKbps = 0;
        }
        continue;
      }
      this.streams.set(classroom.id, {
        classroomId: classroom.id,
        configured,
        online: configured,
        latencyMs: configured ? 20 + Math.round(Math.random() * 50) : 0,
        bitrateKbps: configured ? 1800 + Math.round(Math.random() * 700) : 0,
        degradedUntil: 0,
      });
    }
    for (const id of [...this.streams.keys()]) {
      if (!seenClassrooms.has(id)) this.streams.delete(id);
    }
  }

  subscribe(listener: (snapshot: LiveSnapshot) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  getSnapshot(): LiveSnapshot {
    const now = Date.now();
    const students: LiveStudentDTO[] = [];
    let onlineSensors = 0;
    let flagged = 0;

    for (const [studentId, live] of this.live) {
      const profile = this.roster.get(studentId);
      if (!profile) continue;

      if (live.sensorStatus === 'ONLINE') onlineSensors += 1;
      if (
        live.sensorStatus === 'ONLINE' &&
        readingBand(live.heartRate, profile.baselineHeartRate, live.bodyTemp) !== 'NORMAL'
      ) {
        flagged += 1;
      }

      students.push({
        studentId,
        heartRate: live.heartRate,
        bodyTemp: live.bodyTemp,
        stressLevel: live.stressLevel,
        state: live.state,
        sensorStatus: live.sensorStatus,
        baselineHeartRate: profile.baselineHeartRate,
        trend: [...live.trend],
        updatedAt: new Date(live.updatedAt).toISOString(),
      });
    }

    const streams: LiveStreamDTO[] = [...this.streams.values()].map((stream) => ({
      classroomId: stream.classroomId,
      online: stream.online,
      latencyMs: stream.latencyMs,
      bitrateKbps: stream.bitrateKbps,
    }));

    return {
      seq: this.seq,
      updatedAt: new Date(now).toISOString(),
      students,
      streams,
      alerts: this.alerts.map((alert) => ({ ...alert })),
      metrics: {
        activeStudents: this.roster.size,
        onlineSensors,
        connectedStreams: streams.filter((stream) => stream.online).length,
        activeFlags: flagged,
      },
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Mutations invoked by API routes                                        */
  /* ---------------------------------------------------------------------- */

  async markAlertsRead(input: { ids?: string[]; all?: boolean }): Promise<number> {
    await this.ensureReady();

    const idSet = new Set(input.ids ?? []);
    const shouldUpdate = (alert: AlertDTO) =>
      (input.all === true || idSet.has(alert.id)) && !alert.isRead;

    const matching = this.alerts.filter(shouldUpdate);
    if (matching.length === 0 && !input.all) return 0;

    const result = await db.alertLog.updateMany({
      where: {
        isRead: false,
        ...(input.all ? {} : { id: { in: [...idSet] } }),
      },
      data: { isRead: true },
    });

    for (const alert of this.alerts) {
      if (input.all === true || idSet.has(alert.id)) alert.isRead = true;
    }
    this.broadcast();
    return result.count;
  }

  /** Persists a teacher observation and returns it as a DTO. */
  async addObservation(input: {
    studentId: string;
    teacherId: string | null;
    authorName: string;
    note: string;
  }): Promise<ObservationDTO> {
    await this.ensureReady();
    const created = await db.observation.create({ data: input });
    return {
      id: created.id,
      studentId: created.studentId,
      teacherId: created.teacherId,
      authorName: created.authorName,
      note: created.note,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Simulation                                                             */
  /* ---------------------------------------------------------------------- */

  private seedLiveState(baseline: number): LiveState {
    const momentum = Math.random() * 0.2;
    return {
      heartRate: Math.round(baseline + (Math.random() * 6 - 3)),
      bodyTemp: round1(36.6 + Math.random() * 0.3),
      stressLevel: 'LOW',
      state: pick(['FOCUSED', 'ACTIVE'] as const),
      sensorStatus: 'ONLINE',
      momentum,
      trend: [],
      updatedAt: Date.now(),
      offlineUntil: 0,
    };
  }

  private async tick(): Promise<void> {
    try {
      await this.ensureReady();
    } catch {
      // Database unavailable (e.g. migrations not pushed yet) — retry next tick.
      return;
    }

    this.tickCount += 1;
    const now = Date.now();
    const logRows: {
      studentId: string;
      heartRate: number;
      stressLevel: string;
      state: string;
      bodyTemp: number;
      timestamp: Date;
    }[] = [];
    const createdAlerts: AlertDTO[] = [];

    for (const [studentId, live] of this.live) {
      const profile = this.roster.get(studentId);
      if (!profile) continue;

      // Simulated sensor dropouts: values freeze until the sensor reconnects.
      if (live.sensorStatus === 'OFFLINE') {
        if (now >= live.offlineUntil) {
          live.sensorStatus = 'ONLINE';
          live.updatedAt = now;
        }
        continue;
      }
      if (Math.random() < SENSOR_DROPOUT_CHANCE) {
        live.sensorStatus = 'OFFLINE';
        live.offlineUntil = now + 12_000 + Math.random() * 15_000;
        continue;
      }

      const spiked = Math.random() < SPIKE_CHANCE_PER_TICK;
      live.momentum = nextMomentum(live.momentum, spiked);

      const baseline = profile.baselineHeartRate;
      live.heartRate = Math.round(
        baseline + live.momentum * baseline * 0.42 + (Math.random() * 6 - 3),
      );
      live.bodyTemp = round1(36.6 + live.momentum * 1.5 + (Math.random() * 0.3 - 0.15));
      live.stressLevel =
        live.momentum < 0.32 ? 'LOW' : live.momentum < 0.66 ? 'MODERATE' : 'HIGH';
      if (Math.random() < 0.35) live.state = nextState(live.momentum, live.state);
      live.updatedAt = now;

      live.trend.push(live.heartRate);
      if (live.trend.length > TREND_LENGTH) live.trend.shift();

      const timestamp = new Date(now);
      logRows.push({
        studentId,
        heartRate: live.heartRate,
        stressLevel: live.stressLevel,
        state: live.state,
        bodyTemp: live.bodyTemp,
        timestamp,
      });

      const alert = this.evaluateAlert(profile, live, now);
      if (alert) createdAlerts.push(alert);
    }

    this.evolveStreams(now);

    const writes: Promise<unknown>[] = [];
    if (logRows.length > 0) {
      writes.push(db.biometricLog.createMany({ data: logRows }).catch((error) => {
        console.error('[sim] failed to persist biometric logs:', error);
      }));
    }
    for (const alert of createdAlerts) {
      writes.push(
        db.alertLog
          .create({
            data: {
              studentId: alert.studentId,
              severity: alert.severity,
              message: alert.message,
              timestamp: new Date(alert.timestamp),
              isRead: false,
            },
          })
          .then((record) => {
            alert.id = record.id;
          })
          .catch((error) => {
            console.error('[sim] failed to persist alert:', error);
          }),
      );
    }
    await Promise.all(writes);

    if (createdAlerts.length > 0) {
      this.alerts = [...createdAlerts, ...this.alerts].slice(0, MAX_ALERTS_IN_MEMORY);
    }

    if (this.tickCount % PRUNE_EVERY_TICKS === 0) {
      await db.biometricLog
        .deleteMany({ where: { timestamp: { lt: new Date(now - LOG_RETENTION_MS) } } })
        .catch((error) => console.error('[sim] log prune failed:', error));
    }

    this.seq += 1;
    this.broadcast();
  }

  /** Applies threshold policy and respects per-severity cooldowns. */
  private evaluateAlert(
    profile: RosterEntry,
    live: LiveState,
    now: number,
  ): AlertDTO | null {
    const band = readingBand(live.heartRate, profile.baselineHeartRate, live.bodyTemp);
    if (band === 'NORMAL') return null;

    const severity: Severity = band === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
    const cooldownKey = `${profile.id}:${severity}`;
    const lastFired = this.alertCooldowns.get(cooldownKey) ?? 0;
    if (now - lastFired < ALERT_COOLDOWN_MS[severity]) return null;

    const message = buildAlertMessage(profile, live, band);
    if (!message) return null;

    this.alertCooldowns.set(cooldownKey, now);
    return {
      id: `pending-${cooldownKey}-${now}`,
      studentId: profile.id,
      studentName: profile.fullName,
      gradeClass: profile.gradeClass,
      severity,
      message,
      timestamp: new Date(now).toISOString(),
      isRead: false,
    };
  }

  /** Camera/NAS link health: random short outages plus jittered QoS numbers. */
  private evolveStreams(now: number): void {
    for (const stream of this.streams.values()) {
      if (!stream.configured) continue;
      if (stream.degradedUntil > now) continue;

      if (Math.random() < 0.03) {
        stream.online = false;
        stream.degradedUntil = now + 6_000 + Math.random() * 10_000;
        continue;
      }

      stream.online = true;
      stream.latencyMs = 18 + Math.round(Math.random() * 70);
      stream.bitrateKbps = 1800 + Math.round(Math.random() * 800);
    }
  }

  private broadcast(): void {
    if (this.subscribers.size === 0) return;
    let snapshot: LiveSnapshot | null = null;
    for (const listener of this.subscribers) {
      try {
        snapshot ??= this.getSnapshot();
        listener(snapshot);
      } catch (error) {
        console.error('[sim] subscriber failed:', error);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function nextMomentum(current: number, spiked: boolean): number {
  if (spiked) return clamp(current + 0.45 + Math.random() * 0.3, 0, 1);
  const pull = (CALM_TARGET - current) * 0.12;
  const noise = (Math.random() - 0.5) * 0.22;
  return clamp(current + pull + noise, 0, 1);
}

function nextState(momentum: number, previous: BioState): BioState {
  if (momentum >= 0.66) return Math.random() < 0.6 ? 'ANXIOUS' : 'ACTIVE';
  if (momentum >= 0.32) {
    const roll = Math.random();
    if (roll < 0.5) return 'ACTIVE';
    if (roll < 0.8) return 'FOCUSED';
    return 'ANXIOUS';
  }
  const roll = Math.random();
  if (roll < 0.55) return previous === 'SLEEPY' && Math.random() < 0.5 ? 'FOCUSED' : 'FOCUSED';
  if (roll < 0.8) return 'ACTIVE';
  return 'SLEEPY';
}

function buildAlertMessage(
  profile: RosterEntry,
  live: LiveState,
  band: 'ELEVATED' | 'CRITICAL',
): string | null {
  const { fullName, baselineHeartRate } = profile;
  const temp = live.bodyTemp;
  const hr = live.heartRate;

  if (temp >= THRESHOLDS.criticalTemp) {
    return `${fullName} — body temperature ${temp.toFixed(1)} °C (${band})`;
  }
  if (hr >= baselineHeartRate + THRESHOLDS.criticalHeartRateDelta) {
    return `${fullName} — heart rate ${hr} BPM (baseline ${baselineHeartRate}), stress ${live.stressLevel}`;
  }
  if (hr >= baselineHeartRate + THRESHOLDS.elevatedHeartRateDelta) {
    return `${fullName} — heart rate ${hr} BPM is above the ${baselineHeartRate} BPM baseline`;
  }
  if (temp >= THRESHOLDS.elevatedTemp) {
    return `${fullName} — body temperature ${temp.toFixed(1)} °C, above comfort threshold`;
  }
  if (live.stressLevel !== 'LOW') {
    return `${fullName} — stress ${live.stressLevel} with ${live.state.toLowerCase()} state`;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Singleton accessor                                                         */
/* -------------------------------------------------------------------------- */

const globalForEngine = globalThis as unknown as { __welfareEngine?: SimulationEngine };

export function getEngine(): SimulationEngine {
  if (!globalForEngine.__welfareEngine) {
    const engine = new SimulationEngine();
    globalForEngine.__welfareEngine = engine;
    engine.start();
  }
  return globalForEngine.__welfareEngine;
}
