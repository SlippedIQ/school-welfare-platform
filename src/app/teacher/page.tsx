import { AlertsDock } from '@/components/live/alerts-dock';
import { UnreadAlertBadge } from '@/components/live/unread-badge';
import { AppShell } from '@/components/shell/app-shell';
import { ClassDashboard } from '@/components/teacher/class-dashboard';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { toClassroomDTO, toStudentDTO, toTeacherDTO } from '@/lib/serialize';
import { LayoutDashboard, ScanFace, Video } from 'lucide-react';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Teacher Portal' };

/** Teacher portal: class dashboard with live biometrics and camera feed. */
export default async function TeacherPortalPage({
  searchParams,
}: {
  searchParams: { class?: string };
}) {
  const user = await requirePageUser(['TEACHER']);

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

  // The signed-in account's linked teaching record drives section scoping.
  const actingTeacher = teachers.find((teacher) => teacher.id === user.teacherId) ?? null;

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
    {
      label: 'Camera vitals',
      href: '/scan',
      icon: <ScanFace className="h-4 w-4" />,
    },
    ...assignedClassrooms.map((classroom) => ({
      label: classroom.className,
      href: `/teacher?class=${classroom.id}`,
      icon: <Video className="h-4 w-4" />,
    })),
  ];

  if (!actingTeacher) {
    return (
      <AppShell
        portal="teacher"
        user={{ displayName: user.displayName, role: user.role }}
        title="Account not linked"
        description="Your login is not associated with a teaching record"
        nav={[]}
      >
        <div className="mx-auto max-w-md rounded-lg border border-line bg-white p-6 shadow-panel">
          <h2 className="text-sm font-semibold text-ink">No teaching record found</h2>
          <p className="mt-2 text-xs leading-5 text-ink-muted">
            This account (<span className="font-mono">{user.username}</span>) is signed in but not
            linked to a teacher record with assigned sections. Ask the school administrator to
            link your account, or sign in with a provisioned teacher login.
          </p>
          <a
            href="/login"
            className="mt-4 inline-block text-xs font-medium text-accent hover:underline"
          >
            Sign in with a different account
          </a>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      portal="teacher"
      user={{ displayName: user.displayName, role: user.role }}
      title={activeClassroom ? activeClassroom.className : 'Class dashboard'}
      description={`Signed in as ${actingTeacher.name} · ${assignedClassrooms.length} assigned section${assignedClassrooms.length === 1 ? '' : 's'}`}
      nav={nav}
      actions={<AlertsDock />}
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
