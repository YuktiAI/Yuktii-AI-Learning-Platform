import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const track = await prisma.track.update({ where: { id: params.id }, data: body });
  return NextResponse.json({ track });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await prisma.track.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
