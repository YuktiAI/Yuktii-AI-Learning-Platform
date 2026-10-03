import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionSync } from '@/lib/auth';
import { isGateBypassed, getStageGapDays, calculateSubmissionOpensAt } from '@/lib/stage-gate';

// ── Test Mode & Development Safety Gate ───────────────────────────────────────
// Allowed only when TEST_MODE="true", BYPASS_STAGE_GATE="true", DISABLE_PAYMENT_GATEWAY="true",
// or in non-production environments. In strict production, returns 404.
function isTestModeAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return (
    process.env.TEST_MODE === 'true' ||
    process.env.BYPASS_STAGE_GATE === 'true' ||
    process.env.DISABLE_PAYMENT_GATEWAY === 'true'
  );
}

export async function POST(req: NextRequest) {
  if (!isTestModeAllowed()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const session = getSessionSync();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { enrollmentId, stageId } = body;

    if (!enrollmentId || !stageId) {
      return NextResponse.json({ error: 'Missing enrollmentId or stageId' }, { status: 400 });
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        track: {
          include: {
            stages: { orderBy: { stageNumber: 'asc' } },
          },
        },
        submissions: true,
      },
    });

    if (!enrollment || enrollment.studentId !== session.studentId) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    const stage = enrollment.track.stages.find((s) => s.id === stageId);
    if (!stage) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    const now = new Date();

    // 1. Upsert Submission
    const submission = await prisma.submission.upsert({
      where: { enrollmentId_stageId: { enrollmentId, stageId } },
      update: {
        selfCheckCompleted: true,
        aiEvalPassed: true,
        aiEvalScore: 100,
        aiEvalFeedback: 'Stage passed via test-mode instant complete.',
        evaluationReleasedAt: now,
        contentUrl: 'https://github.com/yuktii-test/instant-complete',
      },
      create: {
        enrollmentId,
        stageId,
        contentUrl: 'https://github.com/yuktii-test/instant-complete',
        contentNote: 'Completed in test mode',
        selfCheckCompleted: true,
        aiEvalPassed: true,
        aiEvalScore: 100,
        aiEvalFeedback: 'Stage passed via test-mode instant complete.',
        evaluationReleasedAt: now,
      },
    });

    // 2. Record SubmissionRecord and completed Evaluation
    const subRecord = await prisma.submissionRecord.create({
      data: {
        enrollmentId,
        stageId,
        submittedUrl: 'https://github.com/yuktii-test/instant-complete',
        normalizedRepoUrl: 'github.com/yuktii-test/instant-complete',
        commitSha: 'test000000000000000000000000000000000000',
      },
    });

    await prisma.evaluation.create({
      data: {
        submissionRecordId: subRecord.id,
        enrollmentId,
        stageId,
        finalScore: 100,
        status: 'completed',
        currentStageLabel: 'Completed (Test Mode)',
        completedAt: now,
      },
    }).catch(() => {});

    // 3. Update StageProgress for current stage
    await prisma.stageProgress.upsert({
      where: { enrollmentId_stageId: { enrollmentId, stageId } },
      update: {
        status: 'PASSED',
        passedAt: now,
        bestScore: 100,
      },
      create: {
        enrollmentId,
        stageId,
        userId: session.studentId,
        status: 'PASSED',
        passedAt: now,
        bestScore: 100,
      },
    });

    // 4. Unlock next stage progress
    const nextStage = enrollment.track.stages.find((s) => s.stageNumber === stage.stageNumber + 1);
    if (nextStage) {
      const gapDays = isGateBypassed()
        ? 0
        : getStageGapDays(
            nextStage.stageNumber,
            enrollment.track.duration,
            enrollment.track.stages.length,
            nextStage.gapDaysOverride
          );
      const opensAt = isGateBypassed() ? now : calculateSubmissionOpensAt(now, gapDays);

      await prisma.stageProgress.upsert({
        where: { enrollmentId_stageId: { enrollmentId, stageId: nextStage.id } },
        update: {
          scenarioUnlockedAt: now,
          // In test mode with bypass, open immediately
          ...(isGateBypassed() ? { submissionOpensAt: now, status: 'OPEN' } : {}),
        },
        create: {
          enrollmentId,
          stageId: nextStage.id,
          userId: session.studentId,
          status: isGateBypassed() || gapDays === 0 ? 'OPEN' : 'SCENARIO_OPEN',
          scenarioUnlockedAt: now,
          submissionOpensAt: opensAt,
        },
      });
    }

    // 5. Check if track is now complete
    const totalStages = enrollment.track.stages.length;
    const completedStagesCount = await prisma.submission.count({
      where: { enrollmentId, selfCheckCompleted: true },
    });

    let trackComplete = false;
    if (totalStages > 0 && completedStagesCount >= totalStages) {
      trackComplete = true;
      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: { status: 'COMPLETED', completedAt: now },
      });
    }

    return NextResponse.json({
      success: true,
      submission,
      trackComplete,
    });
  } catch (err: any) {
    console.error('[instant-complete]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
