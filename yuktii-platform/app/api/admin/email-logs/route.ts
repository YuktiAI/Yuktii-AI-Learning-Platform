import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminSync } from '@/lib/auth';
import { resendCertificateEmail } from '@/lib/certificate-generator';

export async function GET(req: NextRequest) {
  try {
    requireAdminSync();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(50, Math.max(10, parseInt(searchParams.get('limit') || '25', 10)));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (status && (status === 'sent' || status === 'failed')) {
    where.status = status;
  }
  if (search) {
    where.OR = [
      { recipientEmail: { contains: search } },
      { subject: { contains: search } },
      { errorMessage: { contains: search } },
    ];
  }

  try {
    const [total, logs] = await Promise.all([
      prisma.emailLog.count({ where }),
      prisma.emailLog.findMany({
        where,
        orderBy: { attemptedAt: 'desc' },
        skip,
        take: limit,
        include: {
          enrollment: {
            include: {
              student: { select: { id: true, name: true, email: true } },
              track: { select: { id: true, certificateName: true } },
            },
          },
        },
      }),
    ]);

    const sentCount = await prisma.emailLog.count({ where: { status: 'sent' } });
    const failedCount = await prisma.emailLog.count({ where: { status: 'failed' } });

    return NextResponse.json({
      logs,
      total,
      page,
      limit,
      stats: {
        total,
        sent: sentCount,
        failed: failedCount,
      },
    });
  } catch (err: any) {
    console.error('[admin/email-logs GET]', err);
    return NextResponse.json({ error: 'Failed to fetch email logs' }, { status: 500 });
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
    const { logId } = body;
    if (!logId) {
      return NextResponse.json({ error: 'logId is required' }, { status: 400 });
    }

    const result = await resendCertificateEmail(logId);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Resend failed' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Email resent successfully' });
  } catch (err: any) {
    console.error('[admin/email-logs POST]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
