/**
 * scripts/backfill-stage-progress.ts
 *
 * Populates StageProgress records for all existing students who passed
 * stages before the time-gate system was introduced.
 *
 * Rules applied:
 *  - For each enrollment, walk through all stages in stageNumber order.
 *  - A stage is considered "passed" if it has a completed Evaluation with finalScore >= 50,
 *    or a Submission with aiEvalPassed === true.
 *  - When a stage is passed:
 *    1. Upsert StageProgress for that stage with status='PASSED', passedAt, bestScore.
 *    2. If a next stage exists, upsert StageProgress for it with:
 *       - scenarioUnlockedAt = passedAt of the current stage
 *       - submissionOpensAt  = passedAt + gapDays (computed from formula)
 *       - status             = 'OPEN' if opensAt is in the past, 'SCENARIO_OPEN' otherwise
 *  - If submissionOpensAt <= now, the status is set to 'OPEN' immediately
 *    (so existing students aren't blocked retroactively).
 *
 * Usage:
 *   npx ts-node --project tsconfig.json -e "require('./scripts/backfill-stage-progress')"
 *   -- or --
 *   npx tsx scripts/backfill-stage-progress.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function calculateDefaultGapDays(trackDurationDays: number, stageCount: number): number {
  if (stageCount <= 0) return 0;
  return Math.round(trackDurationDays / stageCount);
}

function getStageGapDays(
  stageNumber: number,
  trackDurationDays: number,
  stageCount: number,
  gapDaysOverride?: number | null,
): number {
  if (stageNumber <= 1) return 0;
  if (typeof gapDaysOverride === 'number' && gapDaysOverride >= 0) return gapDaysOverride;
  return calculateDefaultGapDays(trackDurationDays, stageCount);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function run() {
  console.log('=== Backfill StageProgress ===');
  const now = new Date();
  let upserted = 0;
  let skipped = 0;

  // Load all enrollments with their track + stages + evaluations + submissions
  const enrollments = await prisma.enrollment.findMany({
    include: {
      track: {
        include: {
          stages: { orderBy: { stageNumber: 'asc' } },
        },
      },
      evaluations: {
        orderBy: { completedAt: 'asc' },
      },
      submissions: true,
      stageProgresses: true,
    },
  });

  console.log(`Processing ${enrollments.length} enrollment(s)…`);

  for (const enrollment of enrollments) {
    const stages = enrollment.track.stages;
    const stageCount = stages.length;
    const trackDuration = enrollment.track.duration;

    for (const stage of stages) {
      const stageId = stage.id;
      const stageNumber = stage.stageNumber;

      // ── 1. Determine if this stage has been passed ──────────────────────────
      // Check Evaluation records
      const completedEvals = enrollment.evaluations.filter(
        (e) =>
          e.stageId === stageId &&
          ['completed', 'needs_review'].includes(e.status) &&
          (e.finalScore ?? 0) >= 50,
      );

      // Check old Submission record (aiEvalPassed legacy path)
      const passedSubmission = enrollment.submissions.find(
        (s) => s.stageId === stageId && s.aiEvalPassed === true,
      );

      const passed = completedEvals.length > 0 || !!passedSubmission;
      if (!passed) {
        skipped++;
        continue;
      }

      // Find the best score & earliest pass timestamp
      const bestScore =
        completedEvals.length > 0
          ? Math.max(...completedEvals.map((e) => e.finalScore ?? 0))
          : (passedSubmission?.aiEvalScore ?? 100);

      // Use the earliest completed eval timestamp as passedAt
      // (first time the student passed, not latest resubmission)
      const passedAt: Date = (() => {
        if (completedEvals.length > 0) {
          const timestamps = completedEvals
            .map((e) => e.completedAt)
            .filter((d): d is Date => d instanceof Date);
          if (timestamps.length > 0) return new Date(Math.min(...timestamps.map((d) => d.getTime())));
        }
        if (passedSubmission?.aiEvalAt) return new Date(passedSubmission.aiEvalAt);
        return new Date(enrollment.enrolledAt);
      })();

      // ── 2. Upsert StageProgress for THIS stage ────────────────────────────
      const existingProgress = enrollment.stageProgresses.find((p) => p.stageId === stageId);
      if (existingProgress?.status === 'PASSED') {
        // Already correctly set — skip to avoid clobbering real passedAt
        skipped++;
        continue;
      }

      await prisma.stageProgress.upsert({
        where: { enrollmentId_stageId: { enrollmentId: enrollment.id, stageId } },
        update: {
          status: 'PASSED',
          passedAt,
          bestScore: Math.round(bestScore),
        },
        create: {
          enrollmentId: enrollment.id,
          stageId,
          userId: enrollment.studentId,
          status: 'PASSED',
          passedAt,
          bestScore: Math.round(bestScore),
          scenarioUnlockedAt: new Date(enrollment.enrolledAt),
          submissionOpensAt: new Date(enrollment.enrolledAt),
        },
      });
      upserted++;

      // ── 3. Unlock next stage if it exists ────────────────────────────────────
      const nextStage = stages.find((s) => s.stageNumber === stageNumber + 1);
      if (!nextStage) continue;

      const nextStageId = nextStage.id;
      const existingNextProgress = enrollment.stageProgresses.find((p) => p.stageId === nextStageId);

      // Don't downgrade a stage that's already PASSED or OPEN
      if (existingNextProgress?.status === 'PASSED') {
        skipped++;
        continue;
      }

      const gapDays = getStageGapDays(
        nextStage.stageNumber,
        trackDuration,
        stageCount,
        nextStage.gapDaysOverride,
      );

      const opensAt = addDays(passedAt, gapDays);
      const nextStatus = opensAt <= now ? 'OPEN' : 'SCENARIO_OPEN';

      await prisma.stageProgress.upsert({
        where: { enrollmentId_stageId: { enrollmentId: enrollment.id, stageId: nextStageId } },
        update: {
          // Only update if not already fully open / passed
          ...(existingNextProgress?.status !== 'OPEN'
            ? {
                scenarioUnlockedAt: passedAt,
                submissionOpensAt: opensAt,
                status: nextStatus,
              }
            : {}),
        },
        create: {
          enrollmentId: enrollment.id,
          stageId: nextStageId,
          userId: enrollment.studentId,
          status: nextStatus,
          scenarioUnlockedAt: passedAt,
          submissionOpensAt: opensAt,
        },
      });
      upserted++;
    }
  }

  console.log(`Done. Upserted: ${upserted}, Skipped (already correct or not passed): ${skipped}`);
  await prisma.$disconnect();
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
