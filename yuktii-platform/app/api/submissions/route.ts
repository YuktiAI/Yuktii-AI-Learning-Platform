import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionSync } from '@/lib/auth';
import { getStageAccess, SUBMISSION_RATE_LIMIT_MINUTES } from '@/lib/stage-access';

const schema = z.object({
  enrollmentId: z.string().min(1),
  stageId: z.string().min(1),
  contentUrl: z.string().url(),
  contentNote: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = getSessionSync();
  if (!session) return NextResponse.json({ error: 'Log in first' }, { status: 401 });

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { enrollmentId, stageId, contentUrl, contentNote } = parsed.data;

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        submissions: { select: { stageId: true, selfCheckCompleted: true } },
        track: { include: { stages: true } },
      },
    });
    if (!enrollment || enrollment.studentId !== session.studentId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // ── Server-side stage access & pacing gate ──────────────────────────────
    const access = await getStageAccess(enrollmentId, stageId, session.studentId);
    if (!access.canSubmit) {
      if (access.state === 'SCENARIO_OPEN_SUBMISSION_LOCKED') {
        return NextResponse.json(
          {
            error: access.reason || 'Stage submissions are locked by pacing rules.',
            code: 'STAGE_NOT_OPEN',
            opensAt: access.submissionOpensAt,
          },
          { status: 403 }
        );
      }
      return NextResponse.json(
        {
          error: access.reason || 'Submission not allowed for this stage.',
          code: access.state,
        },
        { status: 403 }
      );
    }

    // ── Rate limit check (e.g. 10 minutes between submissions per stage) ────
    const lastSub = await prisma.submissionRecord.findFirst({
      where: { enrollmentId, stageId },
      orderBy: { submittedAt: 'desc' },
      select: { submittedAt: true },
    });
    if (lastSub) {
      const elapsedMs = Date.now() - new Date(lastSub.submittedAt).getTime();
      const cooldownMs = SUBMISSION_RATE_LIMIT_MINUTES * 60 * 1000;
      if (elapsedMs < cooldownMs) {
        const minsLeft = Math.ceil((cooldownMs - elapsedMs) / 60000);
        return NextResponse.json(
          {
            error: `Please wait ${minsLeft} minute${minsLeft > 1 ? 's' : ''} before submitting again.`,
            code: 'RATE_LIMITED',
          },
          { status: 429 }
        );
      }
    }

    // ── Save or update submission, preserving pass status ───────────────────
    const existing = await prisma.submission.findUnique({
      where: { enrollmentId_stageId: { enrollmentId, stageId } },
      select: { selfCheckCompleted: true, aiEvalPassed: true, aiEvalScore: true },
    });

    const submission = await prisma.submission.upsert({
      where: { enrollmentId_stageId: { enrollmentId, stageId } },
      update: {
        contentUrl,
        contentNote,
        // Never revoke a pass or completed status on resubmit
        selfCheckCompleted: existing?.selfCheckCompleted || false,
        aiEvalPassed: existing?.aiEvalPassed || false,
      },
      create: {
        enrollmentId,
        stageId,
        contentUrl,
        contentNote,
      },
    });

    return NextResponse.json({ submission });
  } catch (err) {
    console.error('[submissions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
