import { db } from '@/lib/db';
import { jsonError, jsonOk, parseBody, prismaErrorResponse } from '@/lib/api';
import { toTeacherDTO } from '@/lib/serialize';
import { teacherInputSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: { id: string } };

const teacherInclude = {
  assignedClasses: { select: { id: true, className: true, nasId: true } },
} as const;

/** Updates a teacher and replaces their section assignments wholesale. */
export async function PUT(request: Request, { params }: Params) {
  const parsed = await parseBody(request, teacherInputSchema);
  if (parsed.error) return parsed.error;

  const input = parsed.data;

  try {
    const teacher = await db.teacher.update({
      where: { id: params.id },
      data: {
        name: input.name,
        email: input.email,
        assignedClasses: {
          set: input.assignedClassIds.map((id) => ({ id })),
        },
      },
      include: teacherInclude,
    });
    return jsonOk(toTeacherDTO(teacher));
  } catch (error) {
    return prismaErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await db.teacher.delete({ where: { id: params.id } });
    return jsonOk({ id: params.id });
  } catch (error) {
    return prismaErrorResponse(error);
  }
}
