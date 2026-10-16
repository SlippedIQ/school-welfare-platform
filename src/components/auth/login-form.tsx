'use client';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { api, ApiError } from '@/lib/client';
import { KeyRound, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

interface LoginResponse {
  id: string;
  username: string;
  displayName: string;
  role: 'ADMIN' | 'TEACHER' | 'NURSE';
  home: string;
}

const DEMO_ACCOUNTS = [
  { role: 'Administrator', creds: 'admin / admin123' },
  { role: 'Teacher', creds: 'ananya / ananya123 · vikram / vikram123 · meera / meera123' },
  { role: 'Nurse', creds: 'nurse / nurse123' },
];

/** Username/password form posting to /api/auth/login, then redirecting home. */
export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await api<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      router.replace(next ?? user.home);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Sign-in failed. Please try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
        >
          {error}
        </p>
      ) : null}

      <Field label="Username" required>
        <Input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="e.g. ananya"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={3}
          maxLength={32}
          invalid={error !== null}
          disabled={busy}
        />
      </Field>

      <Field label="Password" required>
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          required
          minLength={6}
          maxLength={128}
          invalid={error !== null}
          disabled={busy}
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={busy}
        icon={<LogIn className="h-4 w-4" />}
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>

      <div className="rounded-md border border-line bg-surface-muted px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-ink-faint">
          <KeyRound className="h-3 w-3" />
          Demo build accounts
        </p>
        <dl className="mt-1.5 space-y-1">
          {DEMO_ACCOUNTS.map((account) => (
            <div key={account.role} className="flex items-baseline justify-between gap-3">
              <dt className="text-2xs text-ink-muted">{account.role}</dt>
              <dd className="truncate text-right font-mono text-2xs text-ink">{account.creds}</dd>
            </div>
          ))}
        </dl>
      </div>
    </form>
  );
}
