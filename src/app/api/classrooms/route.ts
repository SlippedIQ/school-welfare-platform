import { db } from '@/lib/db';
import { jsonOk, parseBody, prismaErrorResponse } from '@/lib/api';
import { toClassroomDTO } from '@/lib/serialize';
import { syncEngineRoster } from '@/lib/sim/sync';
import { classroomInputSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const classroomInclude = {
  _count: { select: { students: true } },
  teachers: { select: { id: true } },
} as const;

/** Lists classrooms with student counts and assigned teacher ids. */
export async function GET() {
  try {
    const classrooms = await db.classroom.findMany({
      include: classroomInclude,
      orderBy: { className: 'asc' },
    });
    return jsonOk(classrooms.map(toClassroomDTO));
  } catch (error) {
    return prismaErrorResponse(error);
  }
}

/** Links a new class/section to its NAS identifier and stream gateway path. */
export async function POST(request: Request) {
  const parsed = await parseBody(request, classroomInputSchema);
  if (parsed.error) return parsed.error;

  try {
    const classroom = await db.classroom.create({
      data: parsed.data,
      include: classroomInclude,
    });
    await syncEngineRoster();
    return jsonOk(toClassroomDTO(classroom), 201);
  } catch (error) {
    return prismaErrorResponse(error);
  }
}
