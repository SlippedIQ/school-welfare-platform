import type {
  AlertLog,
  BiometricLog,
  Classroom,
  Observation,
  Student,
  Teacher,
} from '@prisma/client';
import type {
  AlertDTO,
  BiometricPointDTO,
  BioState,
  ClassroomDTO,
  ObservationDTO,
  Severity,
  StressLevel,
  StudentDTO,
  TeacherDTO,
} from '@/lib/types';
import { BIO_STATES, SEVERITIES, STRESS_LEVELS } from '@/lib/types';

/**
 * Prisma stores enum-backed columns as strings on SQLite. These narrowers
 * guarantee the DTO layer only ever emits values the UI knows how to render,
 * falling back to a safe default if data was written out-of-band.
 */
function narrow<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function asStressLevel(value: string): StressLevel {
  return narrow(value, STRESS_LEVELS, 'LOW');
}

export function asBioState(value: string): BioState {
  return narrow(value, BIO_STATES, 'FOCUSED');
}

export function asSeverity(value: string): Severity {
  return narrow(value, SEVERITIES, 'WARNING');
}

type StudentRecord = Student & { classroom?: { className: string } | null };

export function toStudentDTO(student: StudentRecord): StudentDTO {
  return {
    id: student.id,
    admissionNo: student.admissionNo,
    fullName: student.fullName,
    gradeClass: student.gradeClass,
    age: student.age,
    guardianContact: student.guardianContact,
    baselineHeartRate: student.baselineHeartRate,
    classroomId: student.classroomId,
    classroomName: student.classroom?.className ?? null,
    createdAt: student.createdAt.toISOString(),
    updatedAt: student.updatedAt.toISOString(),
  };
}

type ClassroomRecord = Classroom & {
  _count?: { students: number };
  teachers?: { id: string }[];
};

export function toClassroomDTO(classroom: ClassroomRecord): ClassroomDTO {
  return {
    id: classroom.id,
    className: classroom.className,
    nasId: classroom.nasId,
    streamUrl: classroom.streamUrl,
    studentCount: classroom._count?.students ?? 0,
    teacherIds: (classroom.teachers ?? []).map((teacher) => teacher.id),
    createdAt: classroom.createdAt.toISOString(),
    updatedAt: classroom.updatedAt.toISOString(),
  };
}

type TeacherRecord = Teacher & {
  assignedClasses: { id: string; className: string; nasId: string }[];
};

export function toTeacherDTO(teacher: TeacherRecord): TeacherDTO {
  return {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    assignedClassIds: teacher.assignedClasses.map((classroom) => classroom.id),
    assignedClasses: teacher.assignedClasses.map((classroom) => ({
      id: classroom.id,
      className: classroom.className,
      nasId: classroom.nasId,
    })),
    createdAt: teacher.createdAt.toISOString(),
    updatedAt: teacher.updatedAt.toISOString(),
  };
}

type AlertRecord = AlertLog & { student: { fullName: string; gradeClass: string } };

export function toAlertDTO(alert: AlertRecord): AlertDTO {
  return {
    id: alert.id,
    studentId: alert.studentId,
    studentName: alert.student.fullName,
    gradeClass: alert.student.gradeClass,
    severity: asSeverity(alert.severity),
    message: alert.message,
    timestamp: alert.timestamp.toISOString(),
    isRead: alert.isRead,
  };
}

export function toObservationDTO(observation: Observation): ObservationDTO {
  return {
    id: observation.id,
    studentId: observation.studentId,
    teacherId: observation.teacherId,
    authorName: observation.authorName,
    note: observation.note,
    createdAt: observation.createdAt.toISOString(),
  };
}

export function toBiometricPoint(log: BiometricLog): BiometricPointDTO {
  return {
    timestamp: log.timestamp.toISOString(),
    heartRate: log.heartRate,
    bodyTemp: log.bodyTemp,
    stressLevel: asStressLevel(log.stressLevel),
    state: asBioState(log.state),
  };
}
