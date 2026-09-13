import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdminSync } from '@/lib/auth';
import { generateAndDeliverCertificate } from '@/lib/certificate-generator';
import { logError } from '@/lib/error-handler';

const reviewActionSchema = z.object({
  evaluationId: z.string().min(1),
  action: z.enum(['approve', 'override']),
  newScore: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    requireAdminSync();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const reviews = await prisma.evaluation.findMany({
      where: {
        OR: [
          { status: 'needs_review' },
          { flaggedForHumanReview: true },
        ],
      },
      include: {
        enrollment: {
          include: {
            student: { select: { id: true, name: true, email: true, college: true } },
            track: { include: { domain: true, stages: { orderBy: { stageNumber: 'asc' } } } },
          },
        },
        submissionRecord: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ reviews });
  } catch (err: any) {
    const { studentMessage } = await logError({ service: 'admin-reviews-get', error: err });
    return NextResponse.json({ error: studentMessage }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    requireAdminSync();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = reviewActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { evaluationId, action, newScore, notes } = parsed.data;

    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: {
        enrollment: {
          include: {
            track: { include: { stages: { orderBy: { stageNumber: 'asc' } } } },
            student: true,
          },
        },
      },
    });

    if (!evaluation) {
      return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 });
    }

    const scoreToSet = action === 'override' && newScore !== undefined
      ? newScore
      : (evaluation.finalScore ?? 70);

    const isPassed = scoreToSet >= 70;

    // Update evaluation
    const updatedEval = await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: 'completed',
        flaggedForHumanReview: false,
        finalScore: scoreToSet,
        humanReviewReason: notes ? `[Admin Action: ${action.toUpperCase()}] ${notes}` : evaluation.humanReviewReason,
        completedAt: new Date(),
        currentStageLabel: `Review completed by Admin (${action.toUpperCase()}: ${scoreToSet}/100)`,
      },
    });

    // Update corresponding submission
    await prisma.submission.updateMany({
      where: {
        enrollmentId: evaluation.enrollmentId,
        stageId: evaluation.stageId,
      },
      data: {
        aiEvalScore: scoreToSet,
        aiEvalPassed: isPassed,
        selfCheckCompleted: isPassed,
        evaluationReleasedAt: new Date(),
        manualReviewStatus: action === 'approve' ? 'APPROVED' : 'OVERRIDDEN',
        manualReviewNotes: notes ?? null,
      },
    });

    // If passed, check if all stages complete to trigger certificate
    let certificateIssued = false;
    if (isPassed) {
      const totalStages = evaluation.enrollment.track.stages.length;
      const completedCount = await prisma.submission.count({
        where: {
          enrollmentId: evaluation.enrollmentId,
          selfCheckCompleted: true,
        },
      });

      if (totalStages > 0 && completedCount >= totalStages) {
        await generateAndDeliverCertificate(evaluation.id, evaluation.enrollmentId);
        certificateIssued = true;
      }
    }

    return NextResponse.json({
      success: true,
      evaluation: updatedEval,
      certificateIssued,
      message: `Evaluation ${action === 'approve' ? 'approved' : 'overridden'} successfully.`,
    });
  } catch (err: any) {
    const { studentMessage } = await logError({ service: 'admin-reviews-post', error: err });
    return NextResponse.json({ error: studentMessage }, { status: 500 });
  }
}
