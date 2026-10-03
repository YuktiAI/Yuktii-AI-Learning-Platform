import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

const schema = z.object({
  enrollmentId: z.string().min(1),
  stageId: z.string().optional(),
  stageNumber: z.number().int().optional(),
  implementationPath: z.enum(['hardware', 'simulation']),
});

/**
 * POST /api/enrollments/set-implementation-path
 *
 * Stores the student's implementation path ('hardware' | 'simulation')
 * on StageProgress and Enrollment.
 *
 * Rules (Workstream D):
 * 1. Allowed to change BEFORE the first submission only.
 * 2. Once a submission has been made for this stage, it is locked.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { enrollmentId, stageId, stageNumber, implementationPath } = parsed.data;

    // Verify enrollment belongs to student (or admin)
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

    // Resolve target stage
    let targetStageId = stageId;
    if (!targetStageId && stageNumber) {
      const stage = enrollment.track.stages.find((s) => s.stageNumber === stageNumber);
      if (stage) targetStageId = stage.id;
    }
    if (!targetStageId && enrollment.track.stages.length > 0) {
      targetStageId = enrollment.track.stages[0].id;
    }

    // If stage is resolved, check if a submission already exists
    if (targetStageId) {
      const existingSubmission = await prisma.submission.findUnique({
        where: {
          enrollmentId_stageId: {
            enrollmentId,
            stageId: targetStageId,
          },
        },
      });

      const submissionRecordCount = await prisma.submissionRecord.count({
        where: {
          enrollmentId,
          stageId: targetStageId,
        },
      });

      if ((existingSubmission && existingSubmission.contentUrl) || submissionRecordCount > 0) {
        return NextResponse.json(
          {
            error:
              'Implementation path is locked for this stage because a submission has already been made. You cannot switch paths after submitting.',
            isLocked: true,
          },
          { status: 400 }
        );
      }

      // Upsert StageProgress with implementationPath
      await prisma.stageProgress.upsert({
        where: {
          enrollmentId_stageId: {
            enrollmentId,
            stageId: targetStageId,
          },
        },
        update: { implementationPath },
        create: {
          enrollmentId,
          stageId: targetStageId,
          userId: enrollment.studentId,
          status: 'OPEN',
          implementationPath,
        },
      });
    }

    // Update enrollment-level implementationPath (and sync iotMode if IoT)
    const isIot = enrollment.track.domain.slug.toLowerCase().includes('iot');
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        implementationPath,
        ...(isIot ? { iotMode: implementationPath } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      implementationPath,
      message: `Implementation path set to ${implementationPath}`,
    });
  } catch (err: any) {
    console.error('[set-implementation-path]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
