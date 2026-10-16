import { db } from '@/lib/db';
import { jsonOk, parseBody, prismaErrorResponse } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { toTeacherDTO } from '@/lib/serialize';
import { teacherInputSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const teacherInclude = {
  assignedClasses: { select: { id: true, className: true, nasId: true } },
} as const;

/** Lists teachers with their assigned sections. */
export async function GET() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  try {
    const teachers = await db.teacher.findMany({
      include: teacherInclude,
      orderBy: { name: 'asc' },
    });
    return jsonOk(teachers.map(toTeacherDTO));
  } catch (error) {
    return prismaErrorResponse(error);
  }
}

/** Provisions a teacher account with initial section assignments. */
export async function POST(request: Request) {
  const auth = await requireApiUser(['ADMIN']);
  if (auth.error) return auth.error;

  const parsed = await parseBody(request, teacherInputSchema);
  if (parsed.error) return parsed.error;

  const input = parsed.data;

  try {
    const teacher = await db.teacher.create({
      data: {
        name: input.name,
        email: input.email,
        assignedClasses: {
          connect: input.assignedClassIds.map((id) => ({ id })),
        },
      },
      include: teacherInclude,
    });
    return jsonOk(toTeacherDTO(teacher), 201);
  } catch (error) {
    return prismaErrorResponse(error);
  }
}
