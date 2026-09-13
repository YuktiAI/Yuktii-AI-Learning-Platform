import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminSync } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    requireAdminSync();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const datasets = await prisma.datasetResource.findMany({ select: { id: true, url: true } });
  const results: { id: string; url: string; healthy: boolean }[] = [];

  await Promise.allSettled(
    datasets.map(async (d) => {
      let healthy = false;
      try {
        const res = await fetch(d.url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(6000),
        });
        healthy = res.ok;
      } catch {
        healthy = false;
      }
      await prisma.datasetResource.update({
        where: { id: d.id },
        data: { isHealthy: healthy, lastCheckedAt: new Date() },
      });
      results.push({ id: d.id, url: d.url, healthy });
    })
  );

  const healthyCount = results.filter((r) => r.healthy).length;
  return NextResponse.json({
    total: datasets.length,
    healthy: healthyCount,
    broken: datasets.length - healthyCount,
    results,
  });
}
