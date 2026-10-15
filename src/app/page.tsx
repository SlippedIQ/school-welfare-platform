import { SystemStatusStrip } from '@/components/system-status';
import { SCHOOL_NAME } from '@/lib/constants';
import { db } from '@/lib/db';
import { Cctv, GraduationCap, Presentation } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

/** Console entry point: portal selection plus a live platform status strip. */
export default async function HomePage() {
  const [studentCount, classroomCount, teacherCount] = await Promise.all([
    db.student.count(),
    db.classroom.count(),
    db.teacher.count(),
  ]);

  const portals = [
    {
      href: '/teacher',
      icon: <Presentation className="h-4 w-4" />,
      title: 'Teacher Portal',
      description:
        'Live class dashboard: biometric readings, behavioural state, classroom camera feed and observation notes.',
      meta: `${teacherCount} provisioned teachers`,
    },
    {
      href: '/admin',
      icon: <GraduationCap className="h-4 w-4" />,
      title: 'Admin Master Control',
      description:
        'Student records, NAS / camera routing, teacher provisioning and the school-wide alert audit log.',
      meta: `${studentCount} students · ${classroomCount} sections`,
    },
  ];

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-10 md:py-16">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          {SCHOOL_NAME}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          School Welfare Platform
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">
          Biometric health monitoring, stress and welfare flagging, and classroom CCTV
          integration for day-to-day student supervision.
        </p>
      </header>

      <SystemStatusStrip />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {portals.map((portal) => (
          <Link
            key={portal.href}
            href={portal.href}
            className="group rounded-lg border border-line bg-white p-5 shadow-panel transition-colors hover:border-line-strong"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface-muted text-ink-muted transition-colors group-hover:bg-ink group-hover:text-white">
              {portal.icon}
            </span>
            <h2 className="mt-3 text-sm font-semibold text-ink">{portal.title}</h2>
            <p className="mt-1 text-xs leading-5 text-ink-muted">{portal.description}</p>
            <p className="mt-3 flex items-center gap-1.5 text-2xs text-ink-faint">
              {portal.href === '/admin' ? <Cctv className="h-3 w-3" /> : null}
              {portal.meta}
            </p>
          </Link>
        ))}
      </div>

      <footer className="mt-10 border-t border-line pt-4 text-2xs text-ink-faint">
        Local demonstration build · biometric readings are produced by an on-server
        simulation engine and do not represent real devices.
      </footer>
    </div>
  );
}
