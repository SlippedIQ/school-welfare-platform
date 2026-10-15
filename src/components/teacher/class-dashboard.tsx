'use client';

import { AlertTicker } from '@/components/live/alerts-dock';
import { CameraViewer } from '@/components/teacher/camera-viewer';
import { StudentCard } from '@/components/teacher/student-card';
import { StudentModal } from '@/components/teacher/student-modal';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DistributionRow } from '@/components/ui/distribution-row';
import { Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/feedback';
import { useLiveFeed } from '@/hooks/use-live-feed';
import type {
  BioState,
  ClassroomDTO,
  LiveStudentDTO,
  StressLevel,
  StudentDTO,
  TeacherDTO,
} from '@/lib/types';
import { BIO_STATES, STATE_LABELS, STRESS_LEVELS } from '@/lib/types';
import { Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

const stateColors: Record<BioState, string> = {
  FOCUSED: 'bg-sky-500',
  ACTIVE: 'bg-emerald-500',
  SLEEPY: 'bg-zinc-400',
  ANXIOUS: 'bg-amber-500',
};

const stressColors: Record<StressLevel, string> = {
  LOW: 'bg-emerald-500',
  MODERATE: 'bg-amber-500',
  HIGH: 'bg-rose-500',
};

interface ClassDashboardProps {
  students: StudentDTO[];
  classrooms: ClassroomDTO[];
  teachers: TeacherDTO[];
  activeTeacher: TeacherDTO | null;
  activeClassroomId: string | null;
}

/** Teacher landing view: live class roster, camera feed and section signals. */
export function ClassDashboard({
  students,
  classrooms,
  teachers,
  activeTeacher,
  activeClassroomId,
}: ClassDashboardProps) {
  const router = useRouter();
  const { snapshot } = useLiveFeed();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const classroom = useMemo(
    () => classrooms.find((entry) => entry.id === activeClassroomId) ?? null,
    [classrooms, activeClassroomId],
  );

  const classStudents = useMemo(
    () => students.filter((student) => student.classroomId === classroom?.id),
    [students, classroom],
  );

  const liveById = useMemo(() => {
    const map = new Map<string, LiveStudentDTO>();
    for (const live of snapshot?.students ?? []) map.set(live.studentId, live);
    return map;
  }, [snapshot]);

  const assignedClassrooms = useMemo(() => {
    const assigned = new Set(activeTeacher?.assignedClassIds ?? []);
    return classrooms.filter((entry) => assigned.has(entry.id));
  }, [classrooms, activeTeacher]);

  const stateCounts = BIO_STATES.map((state) => ({
    state,
    count: classStudents.filter((student) => liveById.get(student.id)?.state === state).length,
  }));

  const stressCounts = STRESS_LEVELS.map((level) => ({
    level,
    count: classStudents.filter((student) => {
      const live = liveById.get(student.id);
      return live?.sensorStatus === 'ONLINE' && live.stressLevel === level;
    }).length,
  }));

  const sensorsOnline = classStudents.filter(
    (student) => liveById.get(student.id)?.sensorStatus === 'ONLINE',
  ).length;

  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? null;

  return (
    <div className="space-y-4">
      <AlertTicker />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-ink-faint" />
          <h2 className="text-sm font-semibold text-ink">
            {classroom ? classroom.className : 'Unassigned'}
          </h2>
          <Badge tone="neutral">{classStudents.length} students</Badge>
          <Badge tone={sensorsOnline === classStudents.length ? 'success' : 'warning'}>
            {sensorsOnline}/{classStudents.length} sensors online
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {assignedClassrooms.length > 1 ? (
            <Select
              aria-label="Switch section"
              value={classroom?.id ?? ''}
              onChange={(event) => router.push(`/teacher?class=${event.target.value}`)}
              className="h-9 w-44 text-xs"
            >
              {assignedClassrooms.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.className}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* Roster */}
        <section className="xl:col-span-8">
          {classStudents.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="No students in this section"
                description="Add students in Admin → Student management and assign them to this section to see live readings."
              />
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {classStudents.map((student) => (
                <StudentCard
                  key={student.id}
                  student={student}
                  live={liveById.get(student.id) ?? null}
                  onOpen={setSelectedStudentId}
                />
              ))}
            </div>
          )}
        </section>

        {/* Camera + signals */}
        <aside className="space-y-4 xl:col-span-4">
          <CameraViewer
            classroom={classroom}
            students={classStudents}
            liveStudents={liveById}
          />

          <Card>
            <CardHeader title="Section signals" description="Current distribution across the roster" />
            <CardBody className="space-y-4">
              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-ink-faint">
                  Behavioural state
                </p>
                <div className="mt-2 space-y-1.5">
                  {stateCounts.map(({ state, count }) => (
                    <DistributionRow
                      key={state}
                      label={STATE_LABELS[state]}
                      count={count}
                      total={classStudents.length}
                      colorClass={stateColors[state]}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-ink-faint">
                  Stress level
                </p>
                <div className="mt-2 space-y-1.5">
                  {stressCounts.map(({ level, count }) => (
                    <DistributionRow
                      key={level}
                      label={level === 'LOW' ? 'Low' : level === 'MODERATE' ? 'Moderate' : 'High'}
                      count={count}
                      total={classStudents.length}
                      colorClass={stressColors[level]}
                    />
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>

      <StudentModal
        student={selectedStudent}
        teacher={activeTeacher}
        onClose={() => setSelectedStudentId(null)}
      />
    </div>
  );
}
