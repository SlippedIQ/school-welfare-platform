import { AlertsDock } from '@/components/live/alerts-dock';
import { StudentsManager } from '@/components/admin/students-manager';
import { AppShell } from '@/components/shell/app-shell';
import { adminNavItems } from '@/components/shell/admin-nav';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { toClassroomDTO, toStudentDTO } from '@/lib/serialize';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Student Management' };

/** Admin page: student record CRUD. */
export default async function AdminStudentsPage() {
  const user = await requirePageUser(['ADMIN']);

  const [students, classrooms] = await Promise.all([
    db.student.findMany({
      include: { classroom: { select: { className: true } } },
      orderBy: [{ gradeClass: 'asc' }, { fullName: 'asc' }],
    }),
    db.classroom.findMany({
      include: {
        _count: { select: { students: true } },
        teachers: { select: { id: true } },
      },
      orderBy: { className: 'asc' },
    }),
  ]);

  return (
    <AppShell
      portal="admin"
      user={{ displayName: user.displayName, role: user.role }}
      title="Student management"
      description="Enroll, edit and remove student records"
      nav={adminNavItems()}
      actions={<AlertsDock />}
    >
      <StudentsManager
        students={students.map(toStudentDTO)}
        classrooms={classrooms.map(toClassroomDTO)}
      />
    </AppShell>
  );
}
