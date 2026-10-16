import { LoginForm } from '@/components/auth/login-form';
import { SCHOOL_NAME } from '@/lib/constants';
import { Activity } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * Public sign-in page. `next` is validated server-side to a same-origin path
 * so the form can never be bounced to an external URL.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const rawNext = searchParams.next;
  const next =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-muted px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-white">
            <Activity className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold leading-4 text-ink">
              Welfare Console
            </span>
            <span className="block text-2xs leading-4 text-ink-faint">{SCHOOL_NAME}</span>
          </span>
        </div>

        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <h1 className="text-base font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1 text-xs text-ink-muted">
            Use the account provisioned for you by the school administrator.
          </p>

          <LoginForm next={next} />
        </div>

        <p className="mt-4 text-center text-2xs text-ink-faint">
          Unauthorised access to student welfare data is logged and audited.
        </p>
      </div>
    </div>
  );
}
