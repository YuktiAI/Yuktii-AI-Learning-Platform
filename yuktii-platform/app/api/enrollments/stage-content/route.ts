import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { generateMasterProject } from '@/lib/ai-generator/generateMasterProject';
import { getOrGenerateStageContent } from '@/lib/ai-generator/getOrGenerateStageContent';
import { logError } from '@/lib/error-handler';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const schema = z.object({
  enrollmentId: z.string().min(1),
  stageNumber: z.number().int().min(1),
  force: z.boolean().optional(),
});

/**
 * GET or POST /api/enrollments/stage-content
 *
 * Fetches or asynchronously generates on demand the personalized AI stage content.
 * Supports force=true to explicitly trigger or re-trigger generation on any stage.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const enrollmentId = searchParams.get('enrollmentId') || '';
  const stageNumber = parseInt(searchParams.get('stageNumber') || '1', 10);
  const force = searchParams.get('force') === 'true' || searchParams.get('retry') === 'true';

  return handleStageContent(enrollmentId, stageNumber, force);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const force = Boolean(parsed.data.force || (body as any).retry);
    return handleStageContent(parsed.data.enrollmentId, parsed.data.stageNumber, force);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

async function handleStageContent(enrollmentId: string, stageNumber: number, force: boolean = false) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      track: {
        include: {
          domain: true,
          stages: { orderBy: { stageNumber: 'asc' } },
        },
      },
    },
  });

  if (!enrollment || (enrollment.studentId !== session.studentId && session.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  }

  const stage = enrollment.track.stages.find((s) => s.stageNumber === stageNumber);
  if (!stage) {
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
  }

  // 1. Check if already generated and SUCCESS (unless user forced regeneration)
  if (!force) {
    const existing = await prisma.stageGeneratedContent.findUnique({
      where: {
        enrollmentId_stageNumber: {
          enrollmentId,
          stageNumber,
        },
      },
    });

    if (existing && existing.generationStatus === 'SUCCESS' && existing.problemStatement && existing.problemStatement.trim().length > 0) {
      return NextResponse.json({
        ok: true,
        status: 'ready',
        content: {
          id: existing.id,
          enrollmentId: existing.enrollmentId,
          stageNumber: existing.stageNumber,
          title: existing.title || `Stage ${existing.stageNumber}`,
          problemStatement: existing.problemStatement,
          nonTechnicalExplanation: existing.nonTechnicalExplanation || '',
          technicalExplanation: existing.technicalExplanation || '',
          requirements: safeParse(existing.requirements, []),
          acceptanceCriteria: safeParse(existing.acceptanceCriteria, []),
          estimatedEffort: existing.estimatedEffort || '2-3 hours',
          generationStatus: existing.generationStatus,
        },
      });
    }
  }

  // 2. If master project is not yet locked, lock it first
  if (!enrollment.aiVariantLockedAt || !enrollment.aiVariantJson) {
    try {
      const { name: domainName, slug: domainSlug } = enrollment.track.domain;
      const { levelName } = enrollment.track;
      console.log(`[stage-content] Auto-generating master project for enrollment ${enrollment.id}...`);
      const master = await generateMasterProject(domainName, levelName, domainSlug);
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          aiVariantJson: JSON.stringify(master),
          aiVariantGeneratedAt: new Date(),
          aiVariantLockedAt: new Date(),
        },
      });
    } catch (e: any) {
      console.error('[stage-content] Master project generation failed:', e?.message || e);
      return NextResponse.json(
        {
          ok: false,
          status: 'failed',
          error: 'Failed to generate track master project scenario. Please try again.',
        },
        { status: 500 }
      );
    }
  }

  // 3. Generate stage content
  try {
    console.log(`[stage-content] Generating custom scenario for stage ${stageNumber} (enrollment ${enrollmentId}, force=${force})...`);
    const generated = await getOrGenerateStageContent({
      enrollmentId,
      stageNumber,
      totalStages: enrollment.track.stages.length,
      domainSlug: enrollment.track.domain.slug,
      domainName: enrollment.track.domain.name,
      levelName: enrollment.track.levelName,
      learningObjectives: stage.learningObjectives || '',
      force,
    });

    return NextResponse.json({
      ok: true,
      status: 'ready',
      content: {
        id: generated.id,
        enrollmentId: generated.enrollmentId,
        stageNumber: generated.stageNumber,
        title: generated.title || `Stage ${generated.stageNumber}`,
        problemStatement: generated.problemStatement,
        nonTechnicalExplanation: generated.nonTechnicalExplanation || '',
        technicalExplanation: generated.technicalExplanation || '',
        requirements: generated.requirements,
        acceptanceCriteria: generated.acceptanceCriteria,
        estimatedEffort: generated.estimatedEffort,
        generationStatus: generated.generationStatus,
      },
    });
  } catch (err: any) {
    await logError({
      service: 'ai-stage-generation',
      error: err,
      context: { enrollmentId, stageNumber, domainSlug: enrollment.track.domain.slug },
    });

    return NextResponse.json(
      {
        ok: false,
        status: 'failed',
        error: err?.message || 'Failed to generate custom stage scenario with AI.',
      },
      { status: 500 }
    );
  }
}

function safeParse(str: string | null | undefined, fallback: any) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
