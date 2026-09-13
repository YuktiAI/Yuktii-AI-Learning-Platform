import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionSync } from '@/lib/auth';

const schema = z.object({ enrollmentId: z.string().min(1), stageId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const session = getSessionSync();
  if (!session) return NextResponse.json({ error: 'Log in first' }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
    include: { track: { include: { stages: true } }, submissions: true },
  });
  if (!enrollment || enrollment.studentId !== session.studentId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.submission.update({
    where: {
      enrollmentId_stageId: { enrollmentId: parsed.data.enrollmentId, stageId: parsed.data.stageId },
    },
    data: { selfCheckCompleted: true },
  });

  const totalStages = enrollment.track.stages.length;
  const completedCount = await prisma.submission.count({
    where: { enrollmentId: enrollment.id, selfCheckCompleted: true },
  });

  const isTrackComplete = totalStages > 0 && completedCount >= totalStages;

  if (isTrackComplete) {
    const publicCertificateId = randomBytes(6).toString('hex').toUpperCase();
    const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/verify/${publicCertificateId}`;
    const qrCodeUrl = await QRCode.toDataURL(verifyUrl);

    await prisma.$transaction([
      prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      }),
      prisma.certificate.upsert({
        where: { enrollmentId: enrollment.id },
        update: {},
        create: { enrollmentId: enrollment.id, publicCertificateId, qrCodeUrl },
      }),
    ]);
    // Note: rendering the certificate to a stored PDF (pdfUrl) is a Phase 2
    // follow-up once S3/Cloudinary credentials are wired in — see .env.example
  }

  return NextResponse.json({ ok: true, trackComplete: isTrackComplete });
}
