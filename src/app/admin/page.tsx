import { AlertsDock } from '@/components/live/alerts-dock';
import { AdminOverview } from '@/components/admin/overview';
import { AppShell } from '@/components/shell/app-shell';
import { adminNavItems } from '@/components/shell/admin-nav';
import { db } from '@/lib/db';
import { toClassroomDTO } from '@/lib/serialize';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Admin Overview' };

/** Admin portal landing page: school-wide metrics and hardware health. */
export default async function AdminOverviewPage() {
  const [classrooms, studentCount] = await Promise.all([
    db.classroom.findMany({
      include: {
        _count: { select: { students: true } },
        teachers: { select: { id: true } },
      },
      orderBy: { className: 'asc' },
    }),
    db.student.count(),
  ]);

  return (
    <AppShell
      portal="admin"
      title="Overview"
      description="School-wide welfare, sensor and camera health"
      nav={adminNavItems()}
      actions={<AlertsDock />}
    >
      <AdminOverview classrooms={classrooms.map(toClassroomDTO)} studentCount={studentCount} />
    </AppShell>
  );
}
