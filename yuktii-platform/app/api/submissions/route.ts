import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionSync } from '@/lib/auth';

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

    // ── Server-side stage progression gate ───────────────────────────────────
    const stage = await prisma.stage.findUnique({
      where: { id: stageId },
      select: { stageNumber: true, trackId: true },
    });
    if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 });

    if (stage.stageNumber > 1) {
      // Find the previous stage record
      const prevStage = await prisma.stage.findUnique({
        where: { trackId_stageNumber: { trackId: stage.trackId, stageNumber: stage.stageNumber - 1 } },
        select: { id: true },
      });
      if (prevStage) {
        const prevSubmission = enrollment.submissions.find((s) => s.stageId === prevStage.id);
        if (!prevSubmission?.selfCheckCompleted) {
          return NextResponse.json(
            { error: `Complete Stage ${stage.stageNumber - 1} before submitting Stage ${stage.stageNumber}.` },
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
                error: `Stage ${stage.stageNumber} is locked by pacing rules. It unlocks in approximately ${label}.`,
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

    const submission = await prisma.submission.upsert({
      where: { enrollmentId_stageId: { enrollmentId, stageId } },
      update: { contentUrl, contentNote },
      create: { enrollmentId, stageId, contentUrl, contentNote },
    });

    return NextResponse.json({ submission });
  } catch (err) {
    console.error('[submissions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
