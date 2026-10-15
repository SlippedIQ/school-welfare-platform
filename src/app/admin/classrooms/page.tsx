import { AlertsDock } from '@/components/live/alerts-dock';
import { ClassroomsManager } from '@/components/admin/classrooms-manager';
import { AppShell } from '@/components/shell/app-shell';
import { adminNavItems } from '@/components/shell/admin-nav';
import { db } from '@/lib/db';
import { toClassroomDTO } from '@/lib/serialize';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Classrooms & Cameras' };

/** Admin page: NAS / camera routing per section. */
export default async function AdminClassroomsPage() {
  const classrooms = await db.classroom.findMany({
    include: {
      _count: { select: { students: true } },
      teachers: { select: { id: true } },
    },
    orderBy: { className: 'asc' },
  });

  return (
    <AppShell
      portal="admin"
      title="Classrooms & cameras"
      description="Map each section to its NAS identifier and stream gateway"
      nav={adminNavItems()}
      actions={<AlertsDock />}
    >
      <ClassroomsManager classrooms={classrooms.map(toClassroomDTO)} />
    </AppShell>
  );
}
