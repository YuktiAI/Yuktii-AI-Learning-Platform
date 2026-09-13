import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionSync } from '@/lib/auth';
import { getOrGenerateStageContent } from '@/lib/ai-generator/getOrGenerateStageContent';
import { AiGenerationError } from '@/lib/ai-generator/AiGenerationError';
import { logError } from '@/lib/error-handler';

const schema = z.object({
  enrollmentId: z.string().min(1),
  stageNumber: z.number().int().min(1),
});

/**
 * POST /api/enrollments/regenerate-stage
 *
 * Allows a student to retry stage content generation after a FAILED attempt.
 * Deletes the FAILED row (if one exists) and re-calls getOrGenerateStageContent.
 * If generation succeeds, returns the new content.
 * If it fails again, returns a 503 error with an explicit message.
 *
 * This endpoint is ONLY callable by the enrolled student — not by other students or admins.
 */
export async function POST(req: NextRequest) {
  const session = getSessionSync();
  if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { enrollmentId, stageNumber } = parsed.data;

  // Verify the session student owns this enrollment
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { track: { include: { domain: true, stages: { orderBy: { stageNumber: 'asc' } } } } },
  });

  if (!enrollment || enrollment.studentId !== session.studentId) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  }

  // Delete the existing FAILED row (if any) to allow regeneration
  await prisma.stageGeneratedContent.deleteMany({
    where: { enrollmentId, stageNumber, generationStatus: 'FAILED' },
  });

  const stage = enrollment.track.stages.find(s => s.stageNumber === stageNumber);
  if (!stage) {
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
  }

  try {
    const content = await getOrGenerateStageContent({
      enrollmentId,
      stageNumber,
      totalStages: enrollment.track.stages.length,
      domainSlug:  enrollment.track.domain.slug,
      domainName:  enrollment.track.domain.name,
      levelName:   enrollment.track.levelName,
      learningObjectives: stage.learningObjectives,
    });

    return NextResponse.json({ ok: true, content });
  } catch (err) {
    await logError({
      service: 'groq-stage-regeneration',
      error: err,
      context: { studentId: session.studentId },
    });
    return NextResponse.json(
      { error: 'Stage content generation failed — please try again in a few minutes.' },
      { status: 503 }
    );
  }
}
