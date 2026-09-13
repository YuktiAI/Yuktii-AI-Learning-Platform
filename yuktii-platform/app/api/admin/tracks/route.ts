import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdminSync } from '@/lib/auth';

const schema = z.object({
  domainId: z.string().min(1),
  duration: z.number().int().refine((v) => [30, 45, 60, 75, 90].includes(v), 'Must be 30/45/60/75/90'),
  levelName: z.enum(['FOUNDATION', 'FOUNDATION_PLUS', 'PRACTITIONER', 'APPLIED_PRACTITIONER', 'CAPSTONE']),
  certificateName: z.string().min(1),
  price: z.number().int().nonnegative(),
  isPublished: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    requireAdminSync();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const domainId = req.nextUrl.searchParams.get('domainId') || undefined;
  const tracks = await prisma.track.findMany({
    where: domainId ? { domainId } : undefined,
    include: { domain: true, stages: true },
    orderBy: [{ domainId: 'asc' }, { duration: 'asc' }],
  });
  return NextResponse.json({ tracks });
}

export async function POST(req: NextRequest) {
  try {
    requireAdminSync();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const track = await prisma.track.create({ data: parsed.data });
  return NextResponse.json({ track }, { status: 201 });
}
