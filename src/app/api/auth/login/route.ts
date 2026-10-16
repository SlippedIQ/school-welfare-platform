/** Session issuance: POST /api/auth/login (username + password -> HTTP-only cookie). */

import { jsonError, jsonOk, parseBody } from '@/lib/api';
import { createSession, homeForRole, setSessionCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { isUserRole, type UserRole } from '@/lib/types';
import { loginSchema } from '@/lib/validation';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Compared against missing accounts so response timing does not reveal
 * which usernames exist. Salt/hash are all zeros — never a valid login.
 */
const DUMMY_HASH = `scrypt$16384$${'0'.repeat(32)}$${'0'.repeat(128)}`;

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, loginSchema);
  if (parsed.error) return parsed.error;

  const user = await db.user.findUnique({ where: { username: parsed.data.username } });
  const passwordOk = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? DUMMY_HASH,
  );

  if (!user || !passwordOk) {
    return jsonError('Incorrect username or password', 401);
  }
  if (!isUserRole(user.role)) {
    return jsonError('This account has no configured role. Contact the administrator.', 403);
  }

  const token = await createSession(user.id);
  const role: UserRole = user.role;

  const response = jsonOk({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role,
    home: homeForRole(role),
  });
  setSessionCookie(response, token, request);
  return response;
}
