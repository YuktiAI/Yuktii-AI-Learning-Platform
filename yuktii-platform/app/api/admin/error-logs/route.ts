import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminSync } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    requireAdminSync();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const severity   = searchParams.get('severity');   // "critical" | "transient" | null
  const service    = searchParams.get('service');    // filter by service name
  const resolved   = searchParams.get('resolved');   // "true" | "false" | null (all)
  const search     = searchParams.get('search');
  const page       = Math.max(1, parseInt(searchParams.get('page')  || '1',  10));
  const limit      = Math.min(50, Math.max(10, parseInt(searchParams.get('limit') || '25', 10)));
  const skip       = (page - 1) * limit;

  const where: any = {};

  if (severity && (severity === 'critical' || severity === 'transient')) {
    where.severity = severity;
  }
  if (service) {
    where.service = { contains: service };
  }
  if (resolved === 'true') {
    where.resolvedAt = { not: null };
  } else if (resolved === 'false') {
    where.resolvedAt = null;
  }
  if (search) {
    where.OR = [
      { service:      { contains: search } },
      { errorMessage: { contains: search } },
      { errorCode:    { contains: search } },
      { studentId:    { contains: search } },
      { enrollmentId: { contains: search } },
      { evaluationId: { contains: search } },
    ];
  }

  try {
    const [total, logs, criticalCount, unresolvedCount] = await Promise.all([
      prisma.errorLog.count({ where }),
      prisma.errorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true, service: true, errorMessage: true, errorCode: true,
          severity: true, studentId: true, enrollmentId: true, evaluationId: true,
          alertCount: true, alertSentAt: true, resolvedAt: true, resolvedBy: true,
          resolution: true, createdAt: true,
        },
      }),
      prisma.errorLog.count({ where: { severity: 'critical', resolvedAt: null } }),
      prisma.errorLog.count({ where: { resolvedAt: null } }),
    ]);

    return NextResponse.json({
      logs, total, page, limit,
      stats: { total, criticalUnresolved: criticalCount, totalUnresolved: unresolvedCount },
    });
  } catch (err: any) {
    console.error('[admin/error-logs GET]', err);
    return NextResponse.json({ error: 'Failed to fetch error logs' }, { status: 500 });
  }
}
