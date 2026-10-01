/**
 * lib/stage-gate.ts — Stage pacing & time-gating logic
 *
 * Rules:
 * - Default gap: round(trackDurationDays / stageCountInTrack)
 *   e.g. 5 stages: 15-day track = 3d, 30-day = 6d, 45-day = 9d, 60-day = 12d.
 * - Stage 1 has NO gate (gapDays = 0, open immediately).
 * - Stage N+1 scenario unlocks immediately when Stage N is passed.
 * - Submission stays locked until `submissionOpensAt` (passedAt + gapDays * 24h).
 * - Admin can override gap days per stage via `Stage.gapDaysOverride`.
 * - Bypass enabled ONLY via server env var: BYPASS_STAGE_GATE="true".
 */

export function calculateDefaultGapDays(trackDurationDays: number, stageCount: number): number {
  if (stageCount <= 0) return 0;
  return Math.round(trackDurationDays / stageCount);
}

export function getStageGapDays(
  stageNumber: number,
  trackDurationDays: number,
  stageCount: number,
  gapDaysOverride?: number | null
): number {
  // Stage 1 never has a time-gate
  if (stageNumber <= 1) return 0;

  // Use admin override if set and non-negative
  if (typeof gapDaysOverride === 'number' && gapDaysOverride >= 0) {
    return gapDaysOverride;
  }

  return calculateDefaultGapDays(trackDurationDays, stageCount);
}

export function calculateSubmissionOpensAt(passedAt: Date, gapDays: number): Date {
  if (gapDays <= 0) return new Date(passedAt);
  const opensAtMs = passedAt.getTime() + gapDays * 24 * 60 * 60 * 1000;
  return new Date(opensAtMs);
}

export function isGateBypassed(): boolean {
  return process.env.BYPASS_STAGE_GATE === 'true';
}
