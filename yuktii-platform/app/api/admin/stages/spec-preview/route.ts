import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

/**
 * GET /api/admin/stages/spec-preview
 * Query params: enrollmentId (required), stageNumber (required)
 *
 * Returns the full spec JSON (including hiddenTestCases) for admin review,
 * plus URL reachability metadata and spec version info.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const enrollmentId = searchParams.get('enrollmentId') || '';
  const stageNumber = parseInt(searchParams.get('stageNumber') || '1', 10);

  if (!enrollmentId || isNaN(stageNumber)) {
    return NextResponse.json({ error: 'enrollmentId and stageNumber are required' }, { status: 400 });
  }

  const content = await prisma.stageGeneratedContent.findUnique({
    where: { enrollmentId_stageNumber: { enrollmentId, stageNumber } },
    select: {
      id: true,
      stageNumber: true,
      title: true,
      generationStatus: true,
      generationVersion: true,
      generationModel: true,
      specVersion: true,
      specHash: true,
      projectSpec: true,
      generatedAt: true,
      difficultyTier: true,
      enrollment: {
        select: {
          id: true,
          implementationPath: true,
          track: {
            select: {
              levelName: true,
              domain: { select: { name: true, slug: true } },
            },
          },
        },
      },
    },
  });

  if (!content) {
    return NextResponse.json({ error: 'Stage content not found — the student has not triggered generation yet' }, { status: 404 });
  }

  let parsedSpec: any = null;
  let parseError: string | null = null;
  if (content.projectSpec) {
    try {
      parsedSpec = JSON.parse(content.projectSpec);
    } catch (e: any) {
      parseError = `Spec JSON parse error: ${e?.message}`;
    }
  }

  return NextResponse.json({
    ok: true,
    meta: {
      enrollmentId,
      stageNumber: content.stageNumber,
      title: content.title,
      generationStatus: content.generationStatus,
      generationModel: content.generationModel,
      generationVersion: content.generationVersion,
      specVersion: content.specVersion,
      specHash: content.specHash,
      generatedAt: content.generatedAt,
      difficultyTier: content.difficultyTier,
      domain: content.enrollment?.track?.domain?.name ?? null,
      domainSlug: content.enrollment?.track?.domain?.slug ?? null,
      levelName: content.enrollment?.track?.levelName ?? null,
      implementationPath: content.enrollment?.implementationPath ?? null,
    },
    // Full spec for admin — includes hiddenTestCases
    specJson: parsedSpec,
    specRaw: content.projectSpec,
    parseError,
  });
}

const regenerateSchema = z.object({
  enrollmentId: z.string().min(1),
  stageNumber: z.number().int().min(1),
});

/**
 * POST /api/admin/stages/spec-preview
 * Body: { enrollmentId, stageNumber }
 *
 * Forces regeneration of the spec for a given enrollment+stage, creating a new
 * specVersion/specHash without mutating historical submissions. Any existing
 * submissions keep their original specVersion/specHash (stored on SubmissionRecord
 * and Evaluation at submission time).
 *
 * Uses force=true in getOrGenerateStageContent so it overwrites the cached row.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = regenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { enrollmentId, stageNumber } = parsed.data;

  // Load enrollment context required for generation
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

  if (!enrollment) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  }

  const stage = enrollment.track.stages.find((s) => s.stageNumber === stageNumber);
  if (!stage) {
    return NextResponse.json({ error: 'Stage not found in this enrollment track' }, { status: 404 });
  }

  if (!enrollment.aiVariantLockedAt || !enrollment.aiVariantJson) {
    return NextResponse.json({ error: 'Master project not yet generated for this enrollment' }, { status: 409 });
  }

  try {
    const { getOrGenerateStageContent } = await import('@/lib/ai-generator/getOrGenerateStageContent');
    const result = await getOrGenerateStageContent({
      enrollmentId,
      stageNumber,
      totalStages: enrollment.track.stages.length,
      domainSlug: enrollment.track.domain.slug,
      domainName: enrollment.track.domain.name,
      levelName: enrollment.track.levelName,
      learningObjectives: stage.learningObjectives || '',
      force: true, // admin-triggered regeneration
    });

    return NextResponse.json({
      ok: true,
      message: `Spec regenerated successfully (specVersion: ${result.projectSpec?.specVersion ?? 'v2.0'})`,
      specHash: result.projectSpec ? require('crypto').createHash('sha256').update(JSON.stringify(result.projectSpec)).digest('hex') : null,
      specVersion: result.projectSpec?.specVersion ?? null,
    });
  } catch (err: any) {
    console.error('[admin/spec-preview] Regeneration failed:', err?.message || err);
    return NextResponse.json(
      { error: 'Spec regeneration failed. Check error logs for details.' },
      { status: 500 }
    );
  }
}
