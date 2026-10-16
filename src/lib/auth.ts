/**
 * Server-side session authentication.
 *
 * - Passwords are scrypt-hashed (src/lib/password.ts).
 * - Sessions are opaque random tokens stored in the DB, delivered in an
 *   HTTP-only cookie; expired rows are pruned opportunistically.
 * - Page guards redirect to /login; API guards return ready-made 401/403
 *   responses (see requireApiUser).
 */

import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import { db } from '@/lib/db';
import { isUserRole, type UserRole } from '@/lib/types';

export const SESSION_COOKIE = 'sw_session';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  /** Present for TEACHER accounts — links to the Teacher record. */
  teacherId: string | null;
}

/* -------------------------------------------------------------------------- */
/* Tokens & sessions                                                          */
/* -------------------------------------------------------------------------- */

export function getSessionToken(): string | undefined {
  return cookies().get(SESSION_COOKIE)?.value;
}

/** Creates a DB-backed session and returns its opaque token. */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  await db.session.create({
    data: { token, userId, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
  });
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  return token;
}

/** Removes the session row for the given token (no-op when absent). */
export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.session.deleteMany({ where: { token } });
}

/** Resolves the signed-in user from the session cookie, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = getSessionToken();
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          teacherId: true,
        },
      },
    },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  const { id, username, displayName, role, teacherId } = session.user;
  // A row with an unknown role (e.g. data edited out-of-band) is not a valid
  // session — the login route performs the same validation with a clear error.
  if (!isUserRole(role)) return null;
  return { id, username, displayName, role, teacherId };
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                      */
/* -------------------------------------------------------------------------- */

/** Post-login landing route for each role. */
export function homeForRole(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'TEACHER':
      return '/teacher';
    case 'NURSE':
      return '/nurse';
  }
}

/**
 * Server-component guard: redirects anonymous visitors to /login and users
 * without a permitted role to their own portal. `redirect` throws, so callers
 * must not wrap this in try/catch.
 */
export async function requirePageUser(roles?: readonly UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (roles && !roles.includes(user.role)) redirect(homeForRole(user.role));
  return user;
}

interface ApiAuthOk {
  user: SessionUser;
  error: null;
}
interface ApiAuthFail {
  user: null;
  error: NextResponse;
}
export type ApiAuth = ApiAuthOk | ApiAuthFail;

/**
 * Route-handler guard. Usage:
 *   const auth = await requireApiUser(['ADMIN']);
 *   if (auth.error) return auth.error;
 */
export async function requireApiUser(roles?: readonly UserRole[]): Promise<ApiAuth> {
  const user = await getSessionUser();
  if (!user) {
    return { user: null, error: jsonError('Sign in to continue', 401) };
  }
  if (roles && !roles.includes(user.role)) {
    return {
      user: null,
      error: jsonError('Your account does not have permission to do that', 403),
    };
  }
  return { user, error: null };
}

/* -------------------------------------------------------------------------- */
/* Cookie helpers (route handlers)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Sets the session cookie. `secure` is derived from the request so it works
 * behind Render's HTTPS proxy and for plain-HTTP local development alike.
 */
export function setSessionCookie(response: NextResponse, token: string, request: Request): void {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const proto = forwardedProto ?? new URL(request.url).protocol.replace(':', '');
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: proto === 'https',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
