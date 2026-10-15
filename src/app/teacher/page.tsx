import { AlertsDock } from '@/components/live/alerts-dock';
import { UnreadAlertBadge } from '@/components/live/unread-badge';
import { AppShell } from '@/components/shell/app-shell';
import { ClassDashboard } from '@/components/teacher/class-dashboard';
import { SessionSwitcher } from '@/components/teacher/session-switcher';
import { db } from '@/lib/db';
import { toClassroomDTO, toStudentDTO, toTeacherDTO } from '@/lib/serialize';
import { LayoutDashboard, Video } from 'lucide-react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Teacher Portal' };

/** Teacher portal: class dashboard with live biometrics and camera feed. */
export default async function TeacherPortalPage({
  searchParams,
}: {
  searchParams: { class?: string };
}) {
  const [teacherRecords, studentRecords, classroomRecords] = await Promise.all([
    db.teacher.findMany({
      include: { assignedClasses: { select: { id: true, className: true, nasId: true } } },
      orderBy: { name: 'asc' },
    }),
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

  const teachers = teacherRecords.map(toTeacherDTO);
  const students = studentRecords.map(toStudentDTO);
  const classrooms = classroomRecords.map(toClassroomDTO);

  // Mock session: cookie set by the acting-teacher switcher, else first teacher.
  const cookieStore = cookies();
  const actingCookie = cookieStore.get('actingTeacherId')?.value;
  const actingTeacher =
    teachers.find((teacher) => teacher.id === actingCookie) ?? teachers[0] ?? null;

  const assignedClassIds = new Set(actingTeacher?.assignedClassIds ?? []);
  const activeClassroom =
    classrooms.find(
      (classroom) =>
        classroom.id === searchParams.class && assignedClassIds.has(classroom.id),
    ) ??
    classrooms.find((classroom) => assignedClassIds.has(classroom.id)) ??
    classrooms[0] ??
    null;

  const assignedClassrooms = classrooms.filter((classroom) =>
    assignedClassIds.has(classroom.id),
  );

  const nav = [
    {
      label: 'Class dashboard',
      href: '/teacher',
      icon: <LayoutDashboard className="h-4 w-4" />,
      badge: <UnreadAlertBadge />,
    },
    ...assignedClassrooms.map((classroom) => ({
      label: classroom.className,
      href: `/teacher?class=${classroom.id}`,
      icon: <Video className="h-4 w-4" />,
    })),
  ];

  return (
    <AppShell
      portal="teacher"
      title={activeClassroom ? activeClassroom.className : 'Class dashboard'}
      description={
        actingTeacher
          ? `Signed in as ${actingTeacher.name} · ${assignedClassrooms.length} assigned section${assignedClassrooms.length === 1 ? '' : 's'}`
          : 'No teacher accounts provisioned yet'
      }
      nav={nav}
      actions={
        <>
          <SessionSwitcher teachers={teachers} activeTeacherId={actingTeacher?.id ?? null} />
          <AlertsDock />
        </>
      }
    >
      <ClassDashboard
        students={students}
        classrooms={classrooms}
        teachers={teachers}
        activeTeacher={actingTeacher}
        activeClassroomId={activeClassroom?.id ?? null}
      />
    </AppShell>
  );
}
