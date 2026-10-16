import { AlertsDock } from '@/components/live/alerts-dock';
import { NurseStation } from '@/components/nurse/nurse-station';
import { AppShell } from '@/components/shell/app-shell';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { toStudentDTO } from '@/lib/serialize';
import { ScanFace, Stethoscope } from 'lucide-react';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Nurse Station' };

/** Nurse portal: triage queue, live alerts and wellbeing check-in notes. */
export default async function NurseStationPage() {
  const user = await requirePageUser(['NURSE']);

  const studentRecords = await db.student.findMany({
    include: { classroom: { select: { className: true } } },
    orderBy: [{ gradeClass: 'asc' }, { fullName: 'asc' }],
  });
  const students = studentRecords.map(toStudentDTO);

  return (
    <AppShell
      portal="nurse"
      user={{ displayName: user.displayName, role: user.role }}
      title="Nurse station"
      description={`${students.length} students under monitoring · signed in as ${user.displayName}`}
      nav={[
        {
          label: 'Triage queue',
          href: '/nurse',
          icon: <Stethoscope className="h-4 w-4" />,
        },
        {
          label: 'Camera vitals',
          href: '/scan',
          icon: <ScanFace className="h-4 w-4" />,
        },
      ]}
      actions={<AlertsDock />}
    >
      <NurseStation students={students} authorName={user.displayName} />
    </AppShell>
  );
}
