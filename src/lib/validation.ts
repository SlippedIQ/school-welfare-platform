import { z } from 'zod';
import { BIO_STATES, SEVERITIES, STRESS_LEVELS } from '@/lib/types';

const admissionNo = z
  .string()
  .trim()
  .min(3, 'Admission number must be at least 3 characters')
  .max(32, 'Admission number must be at most 32 characters');

const name = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80, 'Name must be at most 80 characters');

const guardianContact = z
  .string()
  .trim()
  .min(7, 'Enter a valid guardian contact')
  .max(32, 'Contact must be at most 32 characters');

export const studentInputSchema = z.object({
  admissionNo,
  fullName: name,
  // Optional: when a section is linked, the API derives this from the
  // classroom name (e.g. "Grade 9-A" -> "9-A") to keep values standardised.
  gradeClass: z.string().trim().max(24).optional(),
  age: z.coerce
    .number({ invalid_type_error: 'Age must be a number' })
    .int('Age must be a whole number')
    .min(3, 'Age must be at least 3')
    .max(21, 'Age must be at most 21'),
  guardianContact,
  baselineHeartRate: z.coerce
    .number({ invalid_type_error: 'Baseline must be a number' })
    .int('Baseline must be a whole number')
    .min(40, 'Baseline must be at least 40 BPM')
    .max(140, 'Baseline must be at most 140 BPM'),
  classroomId: z.string().trim().min(1, 'Select a section').nullable(),
});

export const classroomInputSchema = z.object({
  className: z
    .string()
    .trim()
    .min(3, 'Class name must be at least 3 characters')
    .max(40, 'Class name must be at most 40 characters'),
  nasId: z
    .string()
    .trim()
    .min(3, 'NAS ID must be at least 3 characters')
    .max(40, 'NAS ID must be at most 40 characters'),
  streamUrl: z
    .string()
    .trim()
    .max(240, 'Stream path must be at most 240 characters')
    .refine(
      (value) =>
        value === '' ||
        value.startsWith('rtsp://') ||
        value.startsWith('http://') ||
        value.startsWith('https://') ||
        value.startsWith('/'),
      'Stream path must be rtsp://, http(s):// or a gateway path starting with /',
    ),
});

export const teacherInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z
    .string()
    .trim()
    .min(5, 'Enter a valid email')
    .max(120)
    .email('Enter a valid email'),
  assignedClassIds: z
    .array(z.string().trim().min(1))
    .max(24, 'A teacher can be assigned to at most 24 sections'),
});

export const observationInputSchema = z.object({
  studentId: z.string().trim().min(1),
  teacherId: z.string().trim().min(1).nullable(),
  authorName: z.string().trim().min(2, 'Author is required').max(80),
  note: z
    .string()
    .trim()
    .min(4, 'Observation must be at least 4 characters')
    .max(600, 'Observation must be at most 600 characters'),
});

export const alertPatchSchema = z
  .object({
    ids: z.array(z.string().trim().min(1)).max(500).optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => value.all === true || (value.ids?.length ?? 0) > 0, {
    message: 'Provide alert ids or set all to true',
  });

export const auditQuerySchema = z.object({
  severity: z.enum(SEVERITIES).optional(),
  status: z.enum(['READ', 'UNREAD', 'ALL']).optional(),
  search: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const loginSchema = z.object({
  username: z.string().trim().min(3, 'Enter your username').max(32),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
});

/** Enum guards used by the simulation engine when it writes to the DB. */
export const stressLevelSchema = z.enum(STRESS_LEVELS);
export const bioStateSchema = z.enum(BIO_STATES);
export const severitySchema = z.enum(SEVERITIES);

export type StudentInput = z.infer<typeof studentInputSchema>;
export type ClassroomInput = z.infer<typeof classroomInputSchema>;
export type TeacherInput = z.infer<typeof teacherInputSchema>;
export type ObservationInput = z.infer<typeof observationInputSchema>;
