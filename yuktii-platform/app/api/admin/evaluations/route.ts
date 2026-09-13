import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionSync } from '@/lib/auth';

const postSchema = z.object({
  submissionId: z.string().min(1),
  action: z.enum(['approve', 'override']),
  pass: z.boolean().optional(),
  score: z.number().optional(),
  feedback: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = getSessionSync();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const submissions = await prisma.submission.findMany({
      where: {
        OR: [
          { flaggedForManualReview: true },
          { evaluationEligibleAt: { not: null } },
        ],
      },
      include: {
        enrollment: {
          include: {
            student: { select: { id: true, name: true, email: true } },
            track: { include: { domain: true } },
          },
        },
        stage: { select: { id: true, stageNumber: true, title: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return NextResponse.json({ submissions });
  } catch (err) {
    console.error('[admin/evaluations GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = getSessionSync();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { submissionId, action, pass, score, feedback, notes } = parsed.data;

    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        enrollment: {
          include: {
            track: { include: { stages: { orderBy: { stageNumber: 'asc' } } } },
          },
        },
      },
    });

    if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const finalPass = action === 'override' ? (pass ?? sub.aiEvalPassed ?? false) : (sub.aiEvalPassed ?? false);
    const finalScore = action === 'override' ? (score ?? sub.aiEvalScore ?? 0) : (sub.aiEvalScore ?? 0);
    const finalFeedback = action === 'override' ? (feedback ?? sub.aiEvalFeedback ?? '') : (sub.aiEvalFeedback ?? '');

    const updated = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        manualReviewStatus: action === 'approve' ? 'APPROVED' : 'OVERRIDDEN',
        manualReviewNotes: notes ?? '',
        aiEvalPassed: finalPass,
        aiEvalScore: finalScore,
        aiEvalFeedback: finalFeedback,
        evaluationReleasedAt: new Date(),
        selfCheckCompleted: finalPass,
      },
    });

    // Handle track completion & certificate release if passed
    if (finalPass) {
      const enrollmentId = sub.enrollmentId;
      const totalStages = sub.enrollment.track.stages.length;
      const completedCount = await prisma.submission.count({
        where: { enrollmentId, selfCheckCompleted: true },
      });

      if (totalStages > 0 && completedCount >= totalStages) {
        const publicCertificateId = randomBytes(6).toString('hex').toUpperCase();
        const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/verify/${publicCertificateId}`;
        const qrCodeUrl = await QRCode.toDataURL(verifyUrl);

        await prisma.$transaction([
          prisma.enrollment.update({
            where: { id: enrollmentId },
            data: { status: 'COMPLETED', completedAt: new Date() },
          }),
          prisma.certificate.upsert({
            where: { enrollmentId },
            update: {},
            create: { enrollmentId, publicCertificateId, qrCodeUrl },
          }),
        ]);
      }
    }

    return NextResponse.json({ ok: true, submission: updated });
  } catch (err) {
    console.error('[admin/evaluations POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
