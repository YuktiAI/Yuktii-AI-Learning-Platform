import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudentSession } from '@/lib/auth';

// ── Production safety gate ────────────────────────────────────────────────────
// This endpoint exists only for local development. It must NEVER be active in
// production — a student could use it to bypass all evaluation and instantly
// complete any stage. Returning 404 (not 403) avoids even hinting it exists.
if (process.env.NODE_ENV === 'production') {
  console.error('[instant-complete] Route loaded in production — this should not happen. Check your deployment.');
}

export async function POST(req: NextRequest) {
  // ── Hard production gate ──────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { enrollmentId, stageId } = body;

    if (!enrollmentId || !stageId) {
      return NextResponse.json({ error: 'Missing enrollmentId or stageId' }, { status: 400 });
    }

    // Verify ownership
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

    // Upsert submission as passed & completed immediately (test mode)
    const submission = await prisma.submission.upsert({
      where: { enrollmentId_stageId: { enrollmentId, stageId } },
      update: {
        selfCheckCompleted: true,
        aiEvalPassed: true,
        aiEvalScore: 100,
        aiEvalFeedback: 'Stage passed in test mode (link submission turned off).',
        evaluationReleasedAt: new Date(),
        contentUrl: 'https://github.com/testing/test-mode-submission',
      },
      create: {
        enrollmentId,
        stageId,
        contentUrl: 'https://github.com/testing/test-mode-submission',
        contentNote: 'Completed in test mode',
        selfCheckCompleted: true,
        aiEvalPassed: true,
        aiEvalScore: 100,
        aiEvalFeedback: 'Stage passed in test mode (link submission turned off).',
        evaluationReleasedAt: new Date(),
      },
    });

    // Also record a submissionRecord and evaluation record in 'completed' status
    const subRecord = await prisma.submissionRecord.create({
      data: {
        enrollmentId,
        stageId,
        submittedUrl: 'https://github.com/testing/test-mode-submission',
        normalizedRepoUrl: 'github.com/testing/test-mode-submission',
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
        completedAt: new Date(),
      },
    }).catch(() => {});

    // Check if track is now complete
    const totalStages = enrollment.track.stages.length;
    const completedStagesCount = await prisma.submission.count({
      where: { enrollmentId, selfCheckCompleted: true },
    });

    let trackComplete = false;
    if (totalStages > 0 && completedStagesCount >= totalStages) {
      trackComplete = true;
      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: { status: 'COMPLETED', completedAt: new Date() },
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
