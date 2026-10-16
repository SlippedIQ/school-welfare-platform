/**
 * Shared domain types and enum-like constants.
 *
 * Prisma/SQLite stores enum-backed columns as strings; the unions below are the
 * single source of truth used by the API validation layer, the simulation
 * engine and the UI.
 */

export const STRESS_LEVELS = ['LOW', 'MODERATE', 'HIGH'] as const;
export type StressLevel = (typeof STRESS_LEVELS)[number];

export const BIO_STATES = ['FOCUSED', 'ACTIVE', 'SLEEPY', 'ANXIOUS'] as const;
export type BioState = (typeof BIO_STATES)[number];

export const SEVERITIES = ['WARNING', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const USER_ROLES = ['ADMIN', 'TEACHER', 'NURSE'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  TEACHER: 'Teacher',
  NURSE: 'Nurse',
};

/** Narrows an untrusted string (e.g. a DB column) to UserRole. */
export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

/** Display labels for enum values (kept out of components so copy stays consistent). */
export const STATE_LABELS: Record<BioState, string> = {
  FOCUSED: 'Focused',
  ACTIVE: 'Active',
  SLEEPY: 'Sleepy',
  ANXIOUS: 'Anxious',
};

export const STRESS_LABELS: Record<StressLevel, string> = {
  LOW: 'Low stress',
  MODERATE: 'Moderate stress',
  HIGH: 'High stress',
};

/* -------------------------------------------------------------------------- */
/* API DTOs (dates serialised as ISO strings for transport)                   */
/* -------------------------------------------------------------------------- */

export interface StudentDTO {
  id: string;
  admissionNo: string;
  fullName: string;
  gradeClass: string;
  age: number;
  guardianContact: string;
  baselineHeartRate: number;
  classroomId: string | null;
  classroomName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClassroomDTO {
  id: string;
  className: string;
  nasId: string;
  streamUrl: string;
  studentCount: number;
  teacherIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TeacherDTO {
  id: string;
  name: string;
  email: string;
  /** Mirrors the schema's `assignedClassIds: string[]` contract. */
  assignedClassIds: string[];
  assignedClasses: Pick<ClassroomDTO, 'id' | 'className' | 'nasId'>[];
  createdAt: string;
  updatedAt: string;
}

export interface AlertDTO {
  id: string;
  studentId: string;
  studentName: string;
  gradeClass: string | null;
  severity: Severity;
  message: string;
  timestamp: string;
  isRead: boolean;
}

export interface ObservationDTO {
  id: string;
  studentId: string;
  teacherId: string | null;
  authorName: string;
  note: string;
  createdAt: string;
}

export interface BiometricPointDTO {
  timestamp: string;
  heartRate: number;
  bodyTemp: number;
  stressLevel: StressLevel;
  state: BioState;
}

/* -------------------------------------------------------------------------- */
/* Live feed (simulation engine snapshots)                                    */
/* -------------------------------------------------------------------------- */

export type SensorStatus = 'ONLINE' | 'OFFLINE';

export interface LiveStudentDTO {
  studentId: string;
  heartRate: number;
  bodyTemp: number;
  stressLevel: StressLevel;
  state: BioState;
  sensorStatus: SensorStatus;
  baselineHeartRate: number;
  /** Most recent heart-rate readings, oldest first (max 30 samples). */
  trend: number[];
  updatedAt: string;
}

export interface LiveStreamDTO {
  classroomId: string;
  online: boolean;
  latencyMs: number;
  bitrateKbps: number;
}

export interface LiveMetrics {
  activeStudents: number;
  onlineSensors: number;
  connectedStreams: number;
  activeFlags: number;
}

export interface LiveSnapshot {
  seq: number;
  updatedAt: string;
  students: LiveStudentDTO[];
  streams: LiveStreamDTO[];
  alerts: AlertDTO[];
  metrics: LiveMetrics;
}

/* -------------------------------------------------------------------------- */
/* Health threshold policy (shared by the engine and the UI colouring)        */
/* -------------------------------------------------------------------------- */

export type HealthBand = 'NORMAL' | 'ELEVATED' | 'CRITICAL';

export const THRESHOLDS = {
  /** BPM above baseline that starts counting as elevated. */
  elevatedHeartRateDelta: 25,
  /** BPM above baseline that triggers a critical flag. */
  criticalHeartRateDelta: 45,
  /** Body temperature (°C) considered elevated. */
  elevatedTemp: 37.8,
  /** Body temperature (°C) considered critical. */
  criticalTemp: 38.3,
} as const;

/** Derives the colour band for a reading pair. */
export function heartRateBand(heartRate: number, baseline: number): HealthBand {
  if (heartRate >= baseline + THRESHOLDS.criticalHeartRateDelta) return 'CRITICAL';
  if (heartRate >= baseline + THRESHOLDS.elevatedHeartRateDelta) return 'ELEVATED';
  return 'NORMAL';
}

/** Worst band across heart rate and body temperature. */
export function readingBand(
  heartRate: number,
  baseline: number,
  bodyTemp: number,
): HealthBand {
  const tempBand: HealthBand =
    bodyTemp >= THRESHOLDS.criticalTemp
      ? 'CRITICAL'
      : bodyTemp >= THRESHOLDS.elevatedTemp
        ? 'ELEVATED'
        : 'NORMAL';
  const hrBand = heartRateBand(heartRate, baseline);
  if (hrBand === 'CRITICAL' || tempBand === 'CRITICAL') return 'CRITICAL';
  if (hrBand === 'ELEVATED' || tempBand === 'ELEVATED') return 'ELEVATED';
  return 'NORMAL';
}
