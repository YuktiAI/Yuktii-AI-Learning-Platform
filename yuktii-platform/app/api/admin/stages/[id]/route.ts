import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { z } from 'zod';

const patchSchema = z.object({
  // gapDaysOverride: null = use default formula, number = admin-set gap in days
  gapDaysOverride: z.number().int().min(0).nullable().optional(),
  title: z.string().min(1).max(120).optional(),
  plainLanguageIntro: z.string().optional(),
  learningObjectives: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  // Only update fields explicitly provided in the request body
  const updateData: Record<string, unknown> = {};
  if ('gapDaysOverride' in parsed.data) updateData.gapDaysOverride = parsed.data.gapDaysOverride;
  if ('title' in parsed.data) updateData.title = parsed.data.title;
  if ('plainLanguageIntro' in parsed.data) updateData.plainLanguageIntro = parsed.data.plainLanguageIntro;
  if ('learningObjectives' in parsed.data) updateData.learningObjectives = parsed.data.learningObjectives;

  const stage = await prisma.stage.update({ where: { id: params.id }, data: updateData });
  return NextResponse.json({ stage });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await prisma.stage.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
