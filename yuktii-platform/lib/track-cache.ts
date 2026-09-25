/**
 * track-cache.ts — DEPRECATED (Phase 5.2)
 *
 * This in-memory cache is not safe on multi-instance deployments (Render/Vercel).
 * Each instance has its own memory; entries written by one instance are never
 * visible to another, and stale data is never invalidated across the fleet.
 *
 * The DB fetch with lean Prisma selects is fast enough without caching.
 * All functions are kept as no-ops so existing call-sites compile without errors.
 *
 * TODO: remove this file entirely once all call-sites have been cleaned up.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CachedTrackData = {
  enrollment: any;
  allCompletedEvals: any[];
  allStageGeneratedContents: any[];
  allEvaluations: any[];
  cachedAt: number;
};

/** @deprecated No-op — in-memory cache removed in Phase 5.2 */
export function getCachedTrack(_id: string): CachedTrackData | null {
  return null;
}

/** @deprecated No-op — in-memory cache removed in Phase 5.2 */
export function setCachedTrack(_id: string, _data: Omit<CachedTrackData, 'cachedAt'>): void {
  // intentionally empty
}

/** @deprecated No-op — in-memory cache removed in Phase 5.2 */
export function invalidateTrackCache(_id?: string): void {
  // intentionally empty
}
