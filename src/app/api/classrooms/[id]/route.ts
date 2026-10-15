import { db } from '@/lib/db';
import { jsonError, jsonOk, parseBody, prismaErrorResponse } from '@/lib/api';
import { toClassroomDTO } from '@/lib/serialize';
import { syncEngineRoster } from '@/lib/sim/sync';
import { classroomInputSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: { id: string } };

const classroomInclude = {
  _count: { select: { students: true } },
  teachers: { select: { id: true } },
} as const;

/** Updates the NAS mapping / stream path for a class. */
export async function PUT(request: Request, { params }: Params) {
  const parsed = await parseBody(request, classroomInputSchema);
  if (parsed.error) return parsed.error;

  try {
    const classroom = await db.classroom.update({
      where: { id: params.id },
      data: parsed.data,
      include: classroomInclude,
    });
    await syncEngineRoster();
    return jsonOk(toClassroomDTO(classroom));
  } catch (error) {
    return prismaErrorResponse(error);
  }
}

/**
 * Deletes a classroom. Sections that still have enrolled students are
 * protected by a referential constraint and return an actionable 409.
 */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const studentCount = await db.student.count({ where: { classroomId: params.id } });
    if (studentCount > 0) {
      return jsonError(
        `This section still has ${studentCount} enrolled student${studentCount === 1 ? '' : 's'}. Reassign them before deleting it.`,
        409,
      );
    }

    await db.classroom.delete({ where: { id: params.id } });
    await syncEngineRoster();
    return jsonOk({ id: params.id });
  } catch (error) {
    return prismaErrorResponse(error);
  }
}
