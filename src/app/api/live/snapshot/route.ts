import { NextResponse } from 'next/server';
import { jsonOk } from '@/lib/api';
import { getEngine } from '@/lib/sim/engine';
import type { LiveSnapshot } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Point-in-time snapshot of the simulation. Used by the SSE client as a
 * fallback transport (short polling) when the event stream is unavailable.
 */
export async function GET() {
  const engine = getEngine();
  try {
    await engine.ensureReady();
  } catch {
    // Serve whatever in-memory state exists; the UI shows a degraded badge.
  }
  const snapshot: LiveSnapshot = engine.getSnapshot();
  return NextResponse.json(snapshot, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
