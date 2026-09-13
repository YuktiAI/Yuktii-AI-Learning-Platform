import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminSync, getAdminSessionSync } from '@/lib/auth';
import { z } from 'zod';

const resolveSchema = z.object({
  resolution: z.string().optional(),
});

/** GET /api/admin/error-logs/[id] — returns full detail including stack trace */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try { requireAdminSync(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const log = await prisma.errorLog.findUnique({ where: { id: params.id } });
    if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ log });
  } catch (err: any) {
    console.error('[admin/error-logs/:id GET]', err);
    return NextResponse.json({ error: 'Failed to fetch error log' }, { status: 500 });
  }
}

/** PATCH /api/admin/error-logs/[id] — mark error as resolved */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let adminEmail = 'admin@yuktiiai.in';
  try {
    const session = requireAdminSync();
    if (session?.email) adminEmail = session.email;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = resolveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const log = await prisma.errorLog.findUnique({ where: { id: params.id } });
    if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updated = await prisma.errorLog.update({
      where: { id: params.id },
      data: {
        resolvedAt: log.resolvedAt ? null : new Date(), // toggle resolved
        resolvedBy: log.resolvedAt ? null : adminEmail,
        resolution: log.resolvedAt ? null : (parsed.data.resolution ?? null),
      },
    });

    return NextResponse.json({
      success: true,
      resolved: !!updated.resolvedAt,
      log: updated,
    });
  } catch (err: any) {
    console.error('[admin/error-logs/:id PATCH]', err);
    return NextResponse.json({ error: 'Failed to update error log' }, { status: 500 });
  }
}
