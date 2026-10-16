import { db } from '@/lib/db';
import { jsonError, jsonOk, parseBody, prismaErrorResponse } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { deriveSection } from '@/lib/format';
import { toStudentDTO } from '@/lib/serialize';
import { syncEngineRoster } from '@/lib/sim/sync';
import { studentInputSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const studentInclude = {
  classroom: { select: { className: true } },
} as const;

/** Lists every student with their section metadata. */
export async function GET() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  try {
    const students = await db.student.findMany({
      include: studentInclude,
      orderBy: [{ gradeClass: 'asc' }, { fullName: 'asc' }],
    });
    return jsonOk(students.map(toStudentDTO));
  } catch (error) {
    return prismaErrorResponse(error);
  }
}

/** Creates a student, deriving the section label from the linked classroom. */
export async function POST(request: Request) {
  const auth = await requireApiUser(['ADMIN']);
  if (auth.error) return auth.error;

  const parsed = await parseBody(request, studentInputSchema);
  if (parsed.error) return parsed.error;

  const input = parsed.data;

  try {
    let gradeClass = input.gradeClass ?? '';

    if (input.classroomId) {
      const classroom = await db.classroom.findUnique({
        where: { id: input.classroomId },
        select: { className: true },
      });
      if (!classroom) {
        return jsonError('The selected section no longer exists', 409);
      }
      gradeClass = deriveSection(classroom.className);
    }

    const student = await db.student.create({
      data: {
        admissionNo: input.admissionNo,
        fullName: input.fullName,
        gradeClass: gradeClass || 'Unassigned',
        age: input.age,
        guardianContact: input.guardianContact,
        baselineHeartRate: input.baselineHeartRate,
        classroomId: input.classroomId,
      },
      include: studentInclude,
    });

    await syncEngineRoster();
    return jsonOk(toStudentDTO(student), 201);
  } catch (error) {
    return prismaErrorResponse(error);
  }
}
