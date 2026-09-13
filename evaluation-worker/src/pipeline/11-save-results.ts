/**
 * 11-save-results.ts — Stage 11: Save final results and trigger certificate.
 *
 * - Marks Evaluation.status = "completed"
 * - Sets completedAt timestamp
 * - If finalScore >= EVALUATION_PASS_SCORE and this is the final/capstone stage:
 *     → Sets Submission.selfCheckCompleted = true (same mechanism as existing flow)
 *     → Triggers certificate generation if all stages complete (same logic as evaluate route)
 * - Records scoreDelta for resubmissions
 */

import { randomBytes } from 'crypto';
import QRCode from 'qrcode';
import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import { EVALUATION_PASS_SCORE } from '../config.js';
import type { PipelineContext } from '../pipeline-context.js';

export async function saveResults(ctx: PipelineContext): Promise<void> {
  const { evaluationId, job } = ctx;
  const { enrollmentId, stageId, stageNumber, totalStages } = job;
  const prisma = getPrisma();

  const finalScore = ctx.finalScore ?? 0;
  const passed     = finalScore >= EVALUATION_PASS_SCORE;
  const isCapstone = stageNumber === totalStages;

  logger.info('Saving evaluation results', {
    evaluationId,
    stage: 'saving',
    finalScore,
    passed,
    isCapstone,
  });

  const needsReview = Boolean(ctx.flaggedForHumanReview);
  const evaluationStatus = needsReview ? 'needs_review' : 'completed';
  const stageLabel = needsReview ? 'Flagged for Human Review' : 'Evaluation complete';

  // ── Mark evaluation completed or needs_review ─────────────────────────────
  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: {
      status:                evaluationStatus,
      completedAt:           new Date(),
      currentStageLabel:     stageLabel,
      harnessType:           ctx.harnessType ?? 'broad',
      harnessVersion:        ctx.harnessVersion ?? '1.0',
      sanityScore:           ctx.sanityScore ?? null,
      sanityDiff:            ctx.sanityDiff ?? null,
      flaggedForHumanReview: needsReview,
      humanReviewReason:     ctx.humanReviewReason ?? null,
      agentTrajectory:       ctx.agentTrajectory.length > 0 ? JSON.stringify(ctx.agentTrajectory) : null,
      promptInjectionFlags:  ctx.promptInjectionFlags.length > 0 ? JSON.stringify(ctx.promptInjectionFlags) : null,
    },
  });

  // ── Update Submission if passed AND not flagged for human review ──────────
  // If flagged for review, the submission remains pending until admin approves.
  if (isCapstone && !needsReview) {
    await prisma.submission.updateMany({
      where: { enrollmentId, stageId },
      data: {
        aiEvalScore:          finalScore,
        aiEvalFeedback:       ctx.mentorReport?.reasoning ?? '',
        aiEvalPassed:         passed,
        aiEvalAt:             new Date(),
        selfCheckCompleted:   passed,
        evaluationReleasedAt: new Date(),
      },
    });

    // ── Certificate trigger (same logic as existing /api/submissions/evaluate) ─
    if (passed) {
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        include: {
          track: { include: { stages: true } },
          submissions: { where: { selfCheckCompleted: true } },
        },
      });

      if (enrollment) {
        const completedCount  = enrollment.submissions.length;
        const totalStagesCount = enrollment.track.stages.length;
        const trackComplete   = totalStagesCount > 0 && completedCount >= totalStagesCount;

        if (trackComplete) {
          logger.info('All stages complete — issuing certificate', { evaluationId, enrollmentId });

          const publicCertificateId = randomBytes(6).toString('hex').toUpperCase();
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
              create: { enrollmentId, publicCertificateId, qrCodeUrl },
            }),
          ]);

          logger.info('Certificate issued', { evaluationId, enrollmentId, publicCertificateId });
        }
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
    isCapstone,
    stage: 'saving',
  });
}
