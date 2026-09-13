import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdminSync } from '@/lib/auth';

const schema = z.object({
  trackId: z.string().min(1),
  stageNumber: z.number().int().positive(),
  title: z.string().min(1),
  learningObjectives: z.string().min(1),
  plainLanguageIntro: z.string().min(1),
  taskTemplate: z.string().min(1),
  modelAnswer: z.string().min(1),
  rubricJson: z.any(),
});

export async function GET(req: NextRequest) {
  try {
    requireAdminSync();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const trackId = req.nextUrl.searchParams.get('trackId') || undefined;
  const stages = await prisma.stage.findMany({
    where: trackId ? { trackId } : undefined,
    orderBy: [{ trackId: 'asc' }, { stageNumber: 'asc' }],
  });
  return NextResponse.json({ stages });
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
  const { rubricJson, ...rest } = parsed.data;
  const stage = await prisma.stage.create({
    data: {
      ...rest,
      rubricJson: rubricJson ?? [],
    },
  });
  return NextResponse.json({ stage }, { status: 201 });
}
