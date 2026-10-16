import { db } from '@/lib/db';
import { jsonError, jsonOk, parseBody, prismaErrorResponse } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { toAlertDTO } from '@/lib/serialize';
import { getEngine } from '@/lib/sim/engine';
import { alertPatchSchema, auditQuerySchema } from '@/lib/validation';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Global alert feed with optional severity/status/text filters. */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = auditQuerySchema.safeParse(params);
  if (!parsed.success) {
    return jsonError('Invalid alert query parameters', 422);
  }

  const { severity, status, search, limit } = parsed.data;

  try {
    const alerts = await db.alertLog.findMany({
      where: {
        ...(severity ? { severity } : {}),
        ...(status === 'READ'
          ? { isRead: true }
          : status === 'UNREAD'
            ? { isRead: false }
            : {}),
        ...(search
          ? {
              OR: [
                { message: { contains: search, mode: 'insensitive' } },
                { student: { fullName: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: { student: { select: { fullName: true, gradeClass: true } } },
      orderBy: { timestamp: 'desc' },
      take: limit ?? 100,
    });

    return jsonOk(alerts.map(toAlertDTO));
  } catch (error) {
    return prismaErrorResponse(error);
  }
}

/** Marks specific alerts (or all of them) as read across every client. */
export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const parsed = await parseBody(request, alertPatchSchema);
  if (parsed.error) return parsed.error;

  try {
    const updated = await getEngine().markAlertsRead(parsed.data);
    return jsonOk({ updated });
  } catch (error) {
    return prismaErrorResponse(error);
  }
}
