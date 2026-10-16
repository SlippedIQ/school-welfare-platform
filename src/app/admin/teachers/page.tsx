import { AlertsDock } from '@/components/live/alerts-dock';
import { TeachersManager } from '@/components/admin/teachers-manager';
import { AppShell } from '@/components/shell/app-shell';
import { adminNavItems } from '@/components/shell/admin-nav';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { toClassroomDTO, toTeacherDTO } from '@/lib/serialize';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Teacher Management' };

/** Admin page: teacher provisioning and section assignments. */
export default async function AdminTeachersPage() {
  const user = await requirePageUser(['ADMIN']);

  const [teachers, classrooms] = await Promise.all([
    db.teacher.findMany({
      include: { assignedClasses: { select: { id: true, className: true, nasId: true } } },
      orderBy: { name: 'asc' },
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
      title="Teacher management"
      description="Provision accounts and assign sections"
      nav={adminNavItems()}
      actions={<AlertsDock />}
    >
      <TeachersManager
        teachers={teachers.map(toTeacherDTO)}
        classrooms={classrooms.map(toClassroomDTO)}
      />
    </AppShell>
  );
}
