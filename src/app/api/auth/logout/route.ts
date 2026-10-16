/** Session revocation: POST /api/auth/logout (idempotent). */

import { jsonOk } from '@/lib/api';
import { clearSessionCookie, destroySession, getSessionToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  await destroySession(getSessionToken());
  const response = jsonOk({ signedOut: true });
  clearSessionCookie(response);
  return response;
}
