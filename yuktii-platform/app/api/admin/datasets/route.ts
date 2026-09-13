import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdminSync } from '@/lib/auth';

const schema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  domainTags: z.string().min(1),
  sourcePlatform: z.enum(['Kaggle', 'UCI', 'HuggingFace', 'DataGov', 'Other']),
  description: z.string().optional().default(''),
});

export async function GET(req: NextRequest) {
  try {
    requireAdminSync();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const domain = req.nextUrl.searchParams.get('domain') ?? undefined;
  const datasets = await prisma.datasetResource.findMany({
    where: domain ? { domainTags: { contains: domain } } : undefined,
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ datasets });
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
  const dataset = await prisma.datasetResource.create({ data: parsed.data });
  return NextResponse.json({ dataset }, { status: 201 });
}
