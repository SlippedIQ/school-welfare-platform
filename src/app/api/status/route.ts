/** Public, non-identifying platform status for the landing page. */

import { jsonOk } from '@/lib/api';
import { getEngine } from '@/lib/sim/engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Aggregate counters only — no student names, readings, or alert contents —
 * so the marketing page can show a live strip without a session.
 */
export async function GET() {
  const engine = getEngine();
  await engine.ensureReady().catch(() => undefined);
  const { metrics, seq, updatedAt } = engine.getSnapshot();
  return jsonOk({ metrics, seq, updatedAt });
}
