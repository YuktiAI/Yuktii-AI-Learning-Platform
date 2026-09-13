import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdminSync } from '@/lib/auth';

const schema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  iconKey: z.string().optional(),
});

export async function GET() {
  try {
    requireAdminSync();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const domains = await prisma.domain.findMany({
      include: { tracks: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ domains });
  } catch (err) {
    console.error('[admin/domains GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const domain = await prisma.domain.create({ data: parsed.data });
    return NextResponse.json({ domain }, { status: 201 });
  } catch (err) {
    console.error('[admin/domains POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
