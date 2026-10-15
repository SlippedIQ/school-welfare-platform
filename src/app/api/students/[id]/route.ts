import { db } from '@/lib/db';
import { jsonError, jsonOk, parseBody, prismaErrorResponse } from '@/lib/api';
import { deriveSection } from '@/lib/format';
import { toBiometricPoint, toObservationDTO, toStudentDTO } from '@/lib/serialize';
import { syncEngineRoster } from '@/lib/sim/sync';
import { studentInputSchema } from '@/lib/validation';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: { id: string } };

/**
 * Student detail: profile plus recent readings and observation notes, which
 * power the teacher observation modal.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const student = await db.student.findUnique({
      where: { id: params.id },
      include: { classroom: { select: { className: true } } },
    });
    if (!student) return jsonError('Student not found', 404);

    const [readings, observations] = await Promise.all([
      db.biometricLog.findMany({
        where: { studentId: student.id },
        orderBy: { timestamp: 'desc' },
        take: 30,
      }),
      db.observation.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return jsonOk({
      student: toStudentDTO(student),
      // Oldest first for charting.
      recentReadings: readings.reverse().map(toBiometricPoint),
      observations: observations.map(toObservationDTO),
    });
  } catch (error) {
    return prismaErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  const parsed = await parseBody(request, studentInputSchema);
  if (parsed.error) return parsed.error;

  const input = parsed.data;

  try {
    const existing = await db.student.findUnique({ where: { id: params.id } });
    if (!existing) return jsonError('Student not found', 404);

    let gradeClass = input.gradeClass ?? existing.gradeClass;

    if (input.classroomId) {
      const classroom = await db.classroom.findUnique({
        where: { id: input.classroomId },
        select: { className: true },
      });
      if (!classroom) {
        return jsonError('The selected section no longer exists', 409);
      }
      gradeClass = deriveSection(classroom.className);
    } else if (input.classroomId === null) {
      gradeClass = input.gradeClass?.trim() || 'Unassigned';
    }

    const student = await db.student.update({
      where: { id: params.id },
      data: {
        admissionNo: input.admissionNo,
        fullName: input.fullName,
        age: input.age,
        guardianContact: input.guardianContact,
        baselineHeartRate: input.baselineHeartRate,
        classroomId: input.classroomId,
        gradeClass,
      },
      include: { classroom: { select: { className: true } } },
    });

    await syncEngineRoster();
    return jsonOk(toStudentDTO(student));
  } catch (error) {
    return prismaErrorResponse(error);
  }
}

/** Hard delete; biometric logs, alerts and notes cascade. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    await db.student.delete({ where: { id: params.id } });
    await syncEngineRoster();
    return jsonOk({ id: params.id });
  } catch (error) {
    return prismaErrorResponse(error);
  }
}
