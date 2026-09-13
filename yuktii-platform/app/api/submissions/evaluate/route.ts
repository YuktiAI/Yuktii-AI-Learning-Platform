import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionSync } from '@/lib/auth';
import { evaluateSubmission } from '@/lib/ai-evaluator';
import { logError } from '@/lib/error-handler';

const schema = z.object({
  enrollmentId: z.string().min(1),
  stageId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = getSessionSync();
  if (!session) return NextResponse.json({ error: 'Log in first' }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { enrollmentId, stageId } = parsed.data;

  // Load enrollment with full context
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      track: {
        include: {
          domain: true,
          stages: { orderBy: { stageNumber: 'asc' } },
        },
      },
      submissions: true,
    },
  });

  if (!enrollment || enrollment.studentId !== session.studentId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const stage = await prisma.stage.findUnique({ where: { id: stageId } });
  if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 });

  // ── Server-side stage progression gate ───────────────────────────────────
  if (stage.stageNumber > 1) {
    const prevStage = await prisma.stage.findUnique({
      where: { trackId_stageNumber: { trackId: stage.trackId, stageNumber: stage.stageNumber - 1 } },
      select: { id: true },
    });
    if (prevStage) {
      const prevSub = enrollment.submissions.find((s) => s.stageId === prevStage.id);
      if (!prevSub?.selfCheckCompleted) {
        return NextResponse.json(
          { error: `Complete Stage ${stage.stageNumber - 1} before evaluating Stage ${stage.stageNumber}.` },
          { status: 403 }
        );
      }
    }
  }

  // ── Section 10: Stage unlock timeline gate (0.4x multiplier) ─────────────
  if (enrollment.stageUnlockSchedule) {
    try {
      const schedule = JSON.parse(enrollment.stageUnlockSchedule) as Record<string, string>;
      const unlockIso = schedule[String(stage.stageNumber)];
      if (unlockIso) {
        const unlockAt = new Date(unlockIso);
        const now = new Date();
        if (now < unlockAt) {
          const msLeft = unlockAt.getTime() - now.getTime();
          const hoursLeft = Math.ceil(msLeft / (1000 * 60 * 60));
          const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
          const label = hoursLeft > 48 ? `${daysLeft} days` : `${hoursLeft} hours`;
          return NextResponse.json(
            {
              error: `Stage ${stage.stageNumber} evaluation is locked by pacing rules. Unlocks in approximately ${label}.`,
              unlocksAt: unlockAt.toISOString(),
              gateLocked: true,
            },
            { status: 403 }
          );
        }
      }
    } catch {
      // fail open if parse fails
    }
  }
  // ── End gate ─────────────────────────────────────────────────────────────

  const submission = enrollment.submissions.find((s) => s.stageId === stageId);
  if (!submission || !submission.contentUrl) {
    return NextResponse.json(
      { error: 'No submission found. Please submit your work URL first.' },
      { status: 400 }
    );
  }

  // Parse rubric items
  let rubricItems: string[] = [];
  try {
    const r = JSON.parse(stage.rubricJson);
    rubricItems = Array.isArray(r) ? r : [];
  } catch {
    rubricItems = [];
  }

  // Run LLM evaluation
  const result = await evaluateSubmission({
    domain: enrollment.track.domain.name,
    level: enrollment.track.levelName,
    stageTitle: stage.title,
    taskTemplate: stage.taskTemplate,
    modelAnswer: stage.modelAnswer,
    rubricItems,
    submissionUrl: submission.contentUrl ?? '',
    submissionNotes: submission.contentNote ?? '',
  });

  // ── 5-Day Evaluation Wait Period & QA Flagging for IoT Final Capstone Stage ──
  const isIoTDomain = enrollment.track.domain.slug === 'iot';
  const isFinalStage = stage.stageNumber === enrollment.track.stages.length;
  const isIoTFinalCapstone = isIoTDomain && isFinalStage;

  const now = new Date();
  let evaluationEligibleAt = submission.evaluationEligibleAt;

  if (isIoTFinalCapstone && !evaluationEligibleAt) {
    // Set 5-day hold period from submission time
    evaluationEligibleAt = new Date(submission.submittedAt.getTime() + 5 * 24 * 60 * 60 * 1000);
  }

  // 15% random spot-check QA flag for IoT capstone
  const shouldFlagQA = isIoTFinalCapstone && !submission.flaggedForManualReview && Math.random() < 0.15;
  const flaggedForManualReview = submission.flaggedForManualReview || shouldFlagQA;

  const isEligibleNow = !isIoTFinalCapstone || (
    evaluationEligibleAt !== null &&
    now >= evaluationEligibleAt &&
    (!flaggedForManualReview || (submission.manualReviewStatus === 'APPROVED' || submission.manualReviewStatus === 'OVERRIDDEN'))
  );

  // Persist AI evaluation result
  await prisma.submission.update({
    where: { enrollmentId_stageId: { enrollmentId, stageId } },
    data: {
      aiEvalScore: result.score,
      aiEvalFeedback: result.feedback,
      aiEvalPassed: result.pass,
      aiEvalAt: new Date(),
      evaluationEligibleAt,
      flaggedForManualReview,
      manualReviewStatus: flaggedForManualReview && !submission.manualReviewStatus ? 'PENDING' : submission.manualReviewStatus,
      // Only mark selfCheckCompleted and evaluationReleasedAt if eligible now
      selfCheckCompleted: isEligibleNow ? result.pass : false,
      evaluationReleasedAt: isEligibleNow ? (submission.evaluationReleasedAt || new Date()) : null,
    },
  });

  let trackComplete = false;

  if (isEligibleNow && result.pass) {
    const totalStages = enrollment.track.stages.length;
    const completedCount = await prisma.submission.count({
      where: { enrollmentId, selfCheckCompleted: true },
    });
    trackComplete = totalStages > 0 && completedCount >= totalStages;

    // Note: Certificate generation is exclusively owned by the evaluation worker pipeline
    // (evaluation-worker/src/pipeline/11-save-results.ts) once the final stage is evaluated and passed.
  }

  if (!isEligibleNow) {
    return NextResponse.json({
      score: null,
      feedback: null,
      pass: null,
      heldInWaitPeriod: true,
      evaluationEligibleAt,
      message: `Your IoT capstone submission is currently under evaluation. Your results and verifiable certificate will be released on ${evaluationEligibleAt?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`,
    });
  }

  return NextResponse.json({ ...result, trackComplete, heldInWaitPeriod: false, evaluationEligibleAt });
}

// Note: No top-level catch here — evaluateSubmission and prisma calls bubble up naturally.
// The calling code above handles expected errors inline. If an unhandled error reaches a caller
// that wraps this in wrapApiRoute, it would be caught. For now, main errors (LLM failures)
// are caught within evaluateSubmission itself or in the evaluation worker pipeline.
