import { getEngine } from '@/lib/sim/engine';

/**
 * Instructs the shared simulation engine to re-read students and classrooms
 * after a CRUD mutation so live dashboards pick up changes immediately.
 * Failures are logged but never break the request that triggered them.
 */
export async function syncEngineRoster(): Promise<void> {
  try {
    await getEngine().syncRoster();
  } catch (error) {
    console.error('[engine] roster sync failed after mutation:', error);
  }
}
