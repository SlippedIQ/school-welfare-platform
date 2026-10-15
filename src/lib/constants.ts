/** Static platform-level constants shared by the UI. */

export const SCHOOL_NAME = 'Greenwood Public School';

export const SCHOOL_TAGLINE = 'Welfare & Monitoring Console';

/** Simulation cadence echoed in the UI (kept in sync via the .env default). */
export const SIM_TICK_SECONDS = Math.max(
  1,
  Math.round((Number(process.env.SIM_TICK_MS ?? 4000) || 4000) / 1000),
);
