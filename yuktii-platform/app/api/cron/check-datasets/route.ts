import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/cron/check-datasets
 *
 * Checks every DatasetResource URL with an HTTP HEAD request and marks it
 * healthy or broken. Call this on a weekly schedule.
 *
 * Requires a CRON_SECRET header to prevent public invocation:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Returns:
 *   { total, healthy, broken, results: [{ id, name, url, isHealthy, statusCode }] }
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;

  // If CRON_SECRET is set, enforce it. If not set, allow unrestricted (dev mode).
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const datasets = await prisma.datasetResource.findMany({
    select: { id: true, name: true, url: true },
  });

  const results: {
    id: string;
    name: string;
    url: string;
    isHealthy: boolean;
    statusCode: number | null;
    error?: string;
  }[] = [];

  // Check each URL with a HEAD request (timeout 8 seconds)
  for (const dataset of datasets) {
    let isHealthy = false;
    let statusCode: number | null = null;
    let errorMsg: string | undefined;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(dataset.url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Yuktii-Dataset-Health-Check/1.0',
        },
      });

      clearTimeout(timeoutId);
      statusCode = res.status;
      // 2xx or 3xx = healthy; 4xx/5xx = broken
      isHealthy = res.status >= 200 && res.status < 400;
    } catch (e: any) {
      if (e.name === 'AbortError') {
        errorMsg = 'Request timed out';
      } else {
        errorMsg = e.message?.slice(0, 120) ?? 'Unknown error';
      }
      isHealthy = false;
    }

    // Update the record
    await prisma.datasetResource.update({
      where: { id: dataset.id },
      data: { isHealthy, lastCheckedAt: new Date() },
    });

    results.push({ id: dataset.id, name: dataset.name, url: dataset.url, isHealthy, statusCode, ...(errorMsg && { error: errorMsg }) });
  }

  const healthy = results.filter((r) => r.isHealthy).length;
  const broken  = results.filter((r) => !r.isHealthy).length;

  console.log(`[cron/check-datasets] Checked ${results.length} datasets — ${healthy} healthy, ${broken} broken`);

  return NextResponse.json({
    total: results.length,
    healthy,
    broken,
    checkedAt: new Date().toISOString(),
    results,
  });
}
