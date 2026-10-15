import { getEngine } from '@/lib/sim/engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_MS = 15_000;

/**
 * Server-Sent Events endpoint that streams simulation snapshots to connected
 * dashboards. Each tick (default 4s) every subscriber receives a `tick` event
 * containing the full `LiveSnapshot`; `snapshot` is sent once on connect.
 */
export async function GET(request: Request) {
  const engine = getEngine();
  // If the database is not migrated yet the engine still serves in-memory
  // (empty) state and recovers on a later tick.
  await engine.ensureReady().catch(() => undefined);

  const encoder = new TextEncoder();
  let dispose: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (event: string, payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
          );
        } catch {
          // Controller already closed by the client going away.
          closed = true;
        }
      };

      send('snapshot', engine.getSnapshot());

      const unsubscribe = engine.subscribe((snapshot) => send('tick', snapshot));
      const heartbeat = setInterval(() => send('ping', { at: Date.now() }), HEARTBEAT_MS);
      heartbeat.unref?.();

      const stop = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      dispose = stop;
      request.signal.addEventListener('abort', stop);
    },
    cancel() {
      dispose?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable proxy buffering so events flush immediately.
      'X-Accel-Buffering': 'no',
    },
  });
}
