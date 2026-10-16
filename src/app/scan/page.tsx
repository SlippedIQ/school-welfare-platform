import { CameraScanner } from '@/components/scan/camera-scanner';
import { homeForRole, requirePageUser } from '@/lib/auth';
import { SCHOOL_NAME } from '@/lib/constants';
import { ROLE_LABELS } from '@/lib/types';
import { Activity, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Camera Vitals' };

/**
 * Standalone camera-vitals page (any signed-in role). Kept out of the portal
 * shells so it stays full-width and thumb-friendly on phones.
 */
export default async function CameraVitalsPage() {
  const user = await requirePageUser();

  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink text-white">
              <Activity className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-4 text-ink">Camera Vitals</p>
              <p className="truncate text-2xs leading-4 text-ink-faint">
                {SCHOOL_NAME} · {user.displayName} ({ROLE_LABELS[user.role]})
              </p>
            </div>
          </div>
          <Link
            href={homeForRole(user.role)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-xs font-medium text-ink-muted shadow-panel transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to portal
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        <CameraScanner />
      </main>
    </div>
  );
}
