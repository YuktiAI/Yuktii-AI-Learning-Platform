/**
 * POST /api/admin/backfill-stage-progress
 *
 * Idempotent backfill: for every active enrollment, compute and upsert
 * StageProgress rows (submissionOpensAt, status, bestScore) derived from
 * existing Evaluation records. Safe to re-run at any time.
 *
 * Admin-only. Returns { processed, created, updated, errors } counts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { getStageGapDays, calculateSubmissionOpensAt } from '@/lib/stage-gate';

export async function POST(_req: NextRequest) {
  try {
    requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let processed = 0;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  // Load all active enrollments with their stages and evaluations
  const enrollments = await prisma.enrollment.findMany({
    where: { status: { in: ['IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'active', 'completed'] } },
    include: {
      track: {
        include: {
          stages: { orderBy: { stageNumber: 'asc' } },
        },
      },
      evaluations: {
        where: { status: { in: ['completed', 'needs_review'] } },
        orderBy: { completedAt: 'asc' },
      },
      stageProgresses: true,
    },
  });

  for (const enrollment of enrollments) {
    processed++;
    const stages = enrollment.track.stages;
    const totalStages = stages.length;
    const trackDuration = enrollment.track.duration;

    try {
      for (const stage of stages) {
        // Find best passing evaluation for this stage
        const stageEvals = enrollment.evaluations
          .filter((e) => e.stageId === stage.id && (e.finalScore ?? 0) >= 50)
          .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
        const bestPassEval = stageEvals[0] ?? null;
        const bestScore = bestPassEval?.finalScore ?? null;
        const isPassed = bestScore !== null && bestScore >= 50;
        const passedAt = bestPassEval?.completedAt ?? null;

        // Compute submissionOpensAt for this stage
        let submissionOpensAt: Date | null = null;
        if (stage.stageNumber > 1) {
          const prevStage = stages.find((s) => s.stageNumber === stage.stageNumber - 1);
          if (prevStage) {
            const prevBestPassEval = enrollment.evaluations
              .filter((e) => e.stageId === prevStage.id && (e.finalScore ?? 0) >= 50)
              .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0] ?? null;

            if (prevBestPassEval?.completedAt) {
              const gapDays = getStageGapDays(
                stage.stageNumber,
                trackDuration,
                totalStages,
                stage.gapDaysOverride,
              );
              submissionOpensAt = calculateSubmissionOpensAt(
                new Date(prevBestPassEval.completedAt),
                gapDays,
              );
            }
          }
        }

        const existingProgress = enrollment.stageProgresses.find(
          (p) => p.stageId === stage.id,
        );

        const newStatus = isPassed
          ? 'PASSED'
          : submissionOpensAt && new Date() < submissionOpensAt
          ? 'SCENARIO_OPEN'
          : 'OPEN';

        if (existingProgress) {
          await prisma.stageProgress.update({
            where: { id: existingProgress.id },
            data: {
              status: isPassed ? 'PASSED' : newStatus,
              bestScore: bestScore ?? existingProgress.bestScore,
              passedAt: passedAt ? new Date(passedAt) : existingProgress.passedAt,
              submissionOpensAt: submissionOpensAt ?? existingProgress.submissionOpensAt,
            },
          });
          updated++;
        } else {
          await prisma.stageProgress.create({
            data: {
              enrollmentId: enrollment.id,
              stageId: stage.id,
              userId: enrollment.studentId,
              status: newStatus,
              bestScore,
              passedAt: passedAt ? new Date(passedAt) : null,
              submissionOpensAt,
            },
          });
          created++;
        }

      }
    } catch (err) {
      errors.push(`enrollment ${enrollment.id}: ${String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    created,
    updated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
