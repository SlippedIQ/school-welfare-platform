import { db } from '@/lib/db';
import { jsonError, jsonOk, parseBody, prismaErrorResponse } from '@/lib/api';
import { toObservationDTO } from '@/lib/serialize';
import { getEngine } from '@/lib/sim/engine';
import { observationInputSchema } from '@/lib/validation';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Latest observation notes for a student (`?studentId=...`). */
export async function GET(request: NextRequest) {
  const studentId = request.nextUrl.searchParams.get('studentId');
  if (!studentId) return jsonError('studentId query parameter is required', 422);

  try {
    const observations = await db.observation.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return jsonOk(observations.map(toObservationDTO));
  } catch (error) {
    return prismaErrorResponse(error);
  }
}

/** Appends a timestamped observation note for a student. */
export async function POST(request: Request) {
  const parsed = await parseBody(request, observationInputSchema);
  if (parsed.error) return parsed.error;

  try {
    const student = await db.student.findUnique({
      where: { id: parsed.data.studentId },
      select: { id: true },
    });
    if (!student) return jsonError('Student not found', 404);

    const observation = await getEngine().addObservation({
      studentId: parsed.data.studentId,
      teacherId: parsed.data.teacherId,
      authorName: parsed.data.authorName,
      note: parsed.data.note,
    });
    return jsonOk(observation, 201);
  } catch (error) {
    return prismaErrorResponse(error);
  }
}
