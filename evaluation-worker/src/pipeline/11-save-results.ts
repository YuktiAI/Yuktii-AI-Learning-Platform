/**
 * 11-save-results.ts — Stage 11: Save final results and trigger certificate.
 *
 * - Marks Evaluation.status = "completed"
 * - Sets completedAt timestamp
 * - If finalScore >= EVALUATION_PASS_SCORE, marks Submission as passed
 * - Model answer is only saved to the DB when the student has passed (never visible during failed attempts)
 * - If this is the final/capstone stage and all prior stages are complete → triggers certificate
 * - Capstone stage uses EVALUATION_PASS_SCORE_CAPSTONE (60) not the standard 50
 */

import { createHmac, randomUUID } from 'crypto';
import QRCode from 'qrcode';
import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import { EVALUATION_PASS_SCORE, EVALUATION_PASS_SCORE_CAPSTONE } from '../config.js';
import type { PipelineContext } from '../pipeline-context.js';

// Certificate ID generation mirrored from platform lib/certificate-integrity.ts
// (duplicated here to avoid a cross-package import in the worker)
function generateWorkerCertificate(data: {
  studentId:      string;
  trackId:        string;
  completionDate: string;
  finalScore:     number;
}): { publicCertificateId: string; verificationHash: string } {
  const secret = process.env.CERT_HMAC_SECRET || 'dev-only-cert-secret-not-for-production-use-at-all';
  const publicCertificateId = randomUUID();
  const payload = `${data.studentId}|${data.trackId}|${data.completionDate}|${data.finalScore}`;
  const verificationHash = createHmac('sha256', secret).update(payload).digest('hex');
  return { publicCertificateId, verificationHash };
}


export async function saveResults(ctx: PipelineContext): Promise<void> {
  const { evaluationId, job } = ctx;
  const { enrollmentId, stageId, stageNumber, totalStages } = job;
  const prisma = getPrisma();

  const finalScore = ctx.finalScore ?? 0;
  const isCapstone = stageNumber === totalStages;

  // Capstone stage uses a higher pass threshold (60 vs 50 for standard stages)
  const passThreshold = isCapstone ? EVALUATION_PASS_SCORE_CAPSTONE : EVALUATION_PASS_SCORE;

  // A-2: passed is gated by BOTH hard gates AND the real score threshold.
  // Hard gates (build failure, req pass rate) block certification even if the
  // LLM-scored number looks good.
  const scorePassesThreshold = finalScore >= passThreshold;
  const hardGateFailed = ctx.hardGateFailed;
  const passed = scorePassesThreshold && !hardGateFailed;
  ctx.passed = passed;

  const needsReview = Boolean(ctx.flaggedForHumanReview);

  // A-1: effectivePassed means: score passes AND hard gates pass AND no human review pending.
  // If flagged for review, the submission sits in 'needs_review' — student sees
  // "under review," NOT "failed." The real (unmodified) score is always stored.
  const effectivePassed = passed && !needsReview;

  const evaluationStatus = needsReview ? 'needs_review' : (passed ? 'completed' : 'completed');
  const stageLabel = needsReview
    ? (ctx.humanReviewReason === 'scorer_disagreement'
        ? 'Under Review — Scorer Disagreement'
        : 'Flagged for Human Review')
    : (effectivePassed ? 'Evaluation complete' : 'Evaluation complete');

  logger.info('Saving evaluation results', {
    evaluationId,
    stage: 'saving',
    finalScore,
    passed,
    effectivePassed,
    hardGateFailed,
    hardGateReason: ctx.hardGateReason,
    isCapstone,
    passThreshold,
    needsReview,
  });

  // Model answer: only released after student has truly passed and no review is pending.
  const modelAnswerToStore = effectivePassed ? (ctx.dynamicModelAnswer ?? null) : null;

  // ── Mark evaluation completed or needs_review ─────────────────────────────
  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: {
      status:                  evaluationStatus,
      completedAt:             new Date(),
      currentStageLabel:       stageLabel,
      harnessType:             ctx.harnessType ?? 'broad',
      harnessVersion:          ctx.harnessVersion ?? '1.0',
      sanityScore:             ctx.sanityScore ?? null,
      sanityDiff:              ctx.sanityDiff ?? null,
      flaggedForHumanReview:   needsReview,
      humanReviewReason:       ctx.humanReviewReason ?? null,
      agentTrajectory:         ctx.agentTrajectory.length > 0 ? JSON.stringify(ctx.agentTrajectory) : null,
      promptInjectionFlags:    ctx.promptInjectionFlags.length > 0 ? JSON.stringify(ctx.promptInjectionFlags) : null,
      aiUsageAnalysis:         ctx.aiUsageAnalysis ? JSON.stringify(ctx.aiUsageAnalysis) : null,
      modelAnswer:             modelAnswerToStore,
    } as any,
  });

  // ── Update Submission record — NEVER revoke a prior pass ─────────────────
  // Read existing record to check prior pass status and best score
  const existingSubmission = await prisma.submission.findFirst({
    where: { enrollmentId, stageId },
    select: { aiEvalPassed: true, selfCheckCompleted: true, aiEvalScore: true },
  });

  // A student who previously passed must not be demoted by a lower resubmission score.
  // We preserve the best (highest) historical score and never flip aiEvalPassed back to false.
  const previouslyPassed = existingSubmission?.aiEvalPassed === true || existingSubmission?.selfCheckCompleted === true;
  const previousBestScore = existingSubmission?.aiEvalScore ?? 0;
  const preservedBestScore = Math.max(previousBestScore, finalScore);

  // Only set pass flags if the student passes NOW *or* previously passed
  const finalPassedFlag = effectivePassed || previouslyPassed;
  const finalSelfCheckFlag = effectivePassed || (previouslyPassed && !needsReview);

  await prisma.submission.updateMany({
    where: { enrollmentId, stageId },
    data: {
      aiEvalScore:          preservedBestScore,
      aiEvalFeedback:       ctx.mentorReport?.reasoning ?? '',
      aiEvalPassed:         finalPassedFlag,
      aiEvalAt:             new Date(),
      // selfCheckCompleted gates stage unlock — set when truly passed (never reset)
      selfCheckCompleted:   finalSelfCheckFlag,
      // evaluationReleasedAt controls when the student sees the report
      evaluationReleasedAt: new Date(),
    },
  });

  // ── Upsert StageProgress when stage is newly passed (Workstream B unlock) ─
  // This ensures the next stage's submissionOpensAt is set from this passedAt date.
  if (effectivePassed) {
    try {
      const stage = await prisma.stage.findUnique({
        where: { id: stageId },
        select: { stageNumber: true, trackId: true },
      });
      if (stage) {
        const now = new Date();
        await prisma.stageProgress.upsert({
          where: { enrollmentId_stageId: { enrollmentId, stageId } },
          update: {
            status:    'PASSED',
            passedAt:  now,
            bestScore: preservedBestScore,
          },
          create: {
            enrollmentId,
            stageId,
            userId:    job.studentId,
            status:    'PASSED',
            passedAt:  now,
            bestScore: preservedBestScore,
          },
        });
        const nextStage = await prisma.stage.findFirst({
          where: { trackId: stage.trackId, stageNumber: stage.stageNumber + 1 },
          select: { id: true, gapDaysOverride: true },
        });
        if (nextStage) {
          const track = await prisma.track.findUnique({
            where: { id: stage.trackId },
            select: { duration: true, _count: { select: { stages: true } } },
          });
          if (track) {
            const gapDays = nextStage.gapDaysOverride ?? Math.round(track.duration / Math.max(track._count.stages, 1));
            const opensAt = new Date(now.getTime() + Math.max(0, gapDays) * 86_400_000);
            await prisma.stageProgress.upsert({
              where: { enrollmentId_stageId: { enrollmentId, stageId: nextStage.id } },
              update: {}, // an improved resubmission must never extend this window
              create: { enrollmentId, stageId: nextStage.id, userId: job.studentId, status: opensAt <= now ? 'OPEN' : 'SCENARIO_OPEN', scenarioUnlockedAt: now, submissionOpensAt: opensAt },
            });
          }
        }
        logger.info('StageProgress upserted — stage passed', { evaluationId, stageId, stageNumber });
      }
    } catch (spErr) {
      // Non-fatal: log but don't fail the pipeline
      logger.warn('Failed to upsert StageProgress', { evaluationId, error: String(spErr) });
    }
  }

  // ── Certificate trigger ────────────────────────────────────────────────────
  // Only triggered when capstone stage is passed AND human review is not pending.
  if (isCapstone && effectivePassed) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        track: { include: { stages: true } },
        submissions: { where: { selfCheckCompleted: true } },
      },
    });

    if (enrollment) {
      const completedCount   = enrollment.submissions.length;
      const totalStagesCount = enrollment.track.stages.length;
      const trackComplete    = totalStagesCount > 0 && completedCount >= totalStagesCount;

      if (trackComplete) {
        logger.info('All stages complete — issuing certificate', { evaluationId, enrollmentId });

        // A-3: Full-payload HMAC-SHA256 — bound to studentId|trackId|date|score
        const issueDate = new Date();
        // We need student and track IDs for the HMAC payload
        const enrollmentForCert = await prisma.enrollment.findUnique({
          where: { id: enrollmentId },
          select: { studentId: true, trackId: true },
        });
        const { publicCertificateId, verificationHash } = generateWorkerCertificate({
          studentId:      enrollmentForCert?.studentId ?? enrollmentId,
          trackId:        enrollmentForCert?.trackId   ?? 'unknown',
          completionDate: issueDate.toISOString().slice(0, 10),
          finalScore:     finalScore,
        });

        const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/verify/${publicCertificateId}`;
        let qrCodeUrl = '';
        try {
          qrCodeUrl = await QRCode.toDataURL(verifyUrl);
        } catch (qrErr) {
          logger.warn('QR code generation failed', { evaluationId, error: String(qrErr) });
        }

        await prisma.$transaction([
          prisma.enrollment.update({
            where: { id: enrollmentId },
            data:  { status: 'COMPLETED', completedAt: new Date() },
          }),
          prisma.certificate.upsert({
            where:  { enrollmentId },
            update: {},
            create: { enrollmentId, publicCertificateId, qrCodeUrl, verificationHash },
          }),
        ]);

        logger.info('Certificate issued', { evaluationId, enrollmentId, publicCertificateId });
      }
    }
  }

  // ── Update SubmissionRecord with final commitSha ────────────────────────────
  if (ctx.repoCommitSha) {
    await prisma.submissionRecord.update({
      where: { id: job.submissionRecordId },
      data:  { commitSha: ctx.repoCommitSha },
    }).catch(() => {});
  }

  logger.info('Results saved successfully', {
    evaluationId,
    finalScore,
    passed,
    effectivePassed,
    needsReview,
    hardGateFailed,
    hardGateReason: ctx.hardGateReason,
    scorerDisagreementDelta: ctx.scorerDisagreementDelta,
    isCapstone,
    passThreshold,
    stage: 'saving',
  });
}
