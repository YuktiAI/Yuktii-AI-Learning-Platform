import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionSync } from '@/lib/auth';
import { generateMasterProject } from '@/lib/ai-generator/generateMasterProject';

const schema = z.object({
  enrollmentId: z.string().min(1),
  iotMode: z.enum(['hardware', 'simulation']),
});

export async function POST(req: NextRequest) {
  const session = getSessionSync();
  if (!session) return NextResponse.json({ error: 'Log in first' }, { status: 401 });

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { enrollmentId, iotMode } = parsed.data;

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { track: { include: { domain: true, stages: { orderBy: { stageNumber: 'asc' } } } } },
    });

    if (!enrollment || enrollment.studentId !== session.studentId) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    // Save iotMode (hardware vs simulation)
    const updated = await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { iotMode },
      include: { track: { include: { domain: true, stages: { orderBy: { stageNumber: 'asc' } } } } },
    });

    // Trigger Master Project Generation with selected iotMode
    try {
      const { name: domainName, slug: domainSlug } = updated.track.domain;
      const { levelName } = updated.track;

      const masterProject = await generateMasterProject(domainName, levelName, domainSlug);

      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: {
          aiVariantJson: JSON.stringify(masterProject),
          aiVariantGeneratedAt: new Date(),
          aiVariantLockedAt: new Date(),
        },
      });

      return NextResponse.json({ ok: true, iotMode, masterProject });
    } catch (e) {
      console.error('[set-iot-mode] Master project generation threw:', e);
      return NextResponse.json({ ok: true, iotMode, message: 'IoT mode saved. Project generation pending.' });
    }
  } catch (err) {
    console.error('[set-iot-mode]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
