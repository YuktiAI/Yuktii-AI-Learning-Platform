/**
 * POST /api/evaluations/submit
 *
 * Accepts a student's GitHub repository URL for a specific enrollment+stage,
 * creates a SubmissionRecord + Evaluation row (status="queued"), and enqueues
 * a BullMQ job for the evaluation worker to process.
 *
 * This is the entry point for the full AI evaluation pipeline.
 * The existing /api/submissions/evaluate route remains for the quick Groq
 * self-check (optional pre-submission readiness tool).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionSync } from '@/lib/auth';
import { enqueueEvaluation } from '@/lib/evaluation-queue';
import { runInlineEvaluation } from '@/lib/inline-evaluator';
import { logError, STUDENT_SAFE_ERROR } from '@/lib/error-handler';
import { getStageAccess, SUBMISSION_RATE_LIMIT_MINUTES } from '@/lib/stage-access';

const schema = z.object({
  enrollmentId: z.string().min(1),
  stageId:      z.string().min(1),
  repoUrl:      z.string().url().refine(
    url => url.includes('github.com'),
    { message: 'Please submit a public GitHub repository URL (e.g. https://github.com/username/repo).' }
  ),
});

// Normalize repo URL (mirrors the worker's normalizeRepoUrl function)
function normalizeRepoUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .trim();
}

async function getGitHubHeadSha(repoUrl: string): Promise<string | null> {
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?\/?$/i);
  if (!match) return null;
  const response = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}/commits/HEAD`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'yuktii-evaluator' }, cache: 'no-store',
  });
  if (!response.ok) return null;
  return ((await response.json()) as { sha?: string }).sha || null;
}

export async function POST(req: NextRequest) {
  const session = getSessionSync();
  if (!session) return NextResponse.json({ error: 'Log in first' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { enrollmentId, stageId, repoUrl } = parsed.data;

  try {

  // ── Load enrollment + stage context ───────────────────────────────────────
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

  if (!enrollment || enrollment.studentId !== session.studentId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const stage = enrollment.track.stages.find(s => s.id === stageId);
  if (!stage) {
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
  }

  // ── Section 10: Stage unlock timeline gate ────────────────────────────────
  // Students must wait a minimum time before submitting each stage.
  // Formula: minHours = (trackDays / stageCount) × 0.4 × 24
  // Unlock timestamps are pre-computed and stored as JSON on Enrollment.stageUnlockSchedule.
  // For resubmissions (existing completed evaluation), this gate is bypassed.
  const access = await getStageAccess(enrollmentId, stageId, session.studentId);
  if (!access.canSubmit) {
    return NextResponse.json({ error: access.reason || 'Submission is not available for this stage.', code: access.state === 'SCENARIO_OPEN_SUBMISSION_LOCKED' ? 'STAGE_NOT_OPEN' : access.state, opensAt: access.submissionOpensAt }, { status: 403 });
  }
  const latestRecord = await prisma.submissionRecord.findFirst({ where: { enrollmentId, stageId }, orderBy: { submittedAt: 'desc' }, select: { submittedAt: true } });
  if (latestRecord && Date.now() - latestRecord.submittedAt.getTime() < SUBMISSION_RATE_LIMIT_MINUTES * 60_000) {
    return NextResponse.json({ error: 'Please wait a few minutes before submitting another evaluation.', code: 'RATE_LIMITED' }, { status: 429 });
  }
  // ── End timeline gate ─────────────────────────────────────────────────────

  // ── Prevent duplicate in-flight evaluations ────────────────────────────────
  const existingEval = await prisma.evaluation.findFirst({
    where: {
      enrollmentId,
      stageId,
      status: { in: ['queued', 'running'] },
    },
  });
  if (existingEval) {
    return NextResponse.json({
      evaluationId: existingEval.id,
      status:       existingEval.status,
      message:      'An evaluation is already in progress for this stage.',
    });
  }

  // ── Same-URL resubmission detection ───────────────────────────────────────
  // If the student submits the same repo URL that was already evaluated for
  // this stage (completed), return the existing result immediately.
  // A new evaluation is only created when the URL is different (new repo or commit).
  const normalizedRepoUrl = normalizeRepoUrl(repoUrl);
  const headSha = await getGitHubHeadSha(repoUrl);
  const existingCompletedEval = headSha ? await prisma.evaluation.findFirst({
    where: {
      enrollmentId,
      stageId,
      status: 'completed',
      submissionRecord: { normalizedRepoUrl, commitSha: headSha },
    },
    orderBy: { completedAt: 'desc' },
    select: { id: true, status: true, finalScore: true },
  }) : null;
  if (existingCompletedEval) {
    return NextResponse.json({
      evaluationId: existingCompletedEval.id,
      status:       'completed',
      finalScore:   existingCompletedEval.finalScore,
      message:      'No new GitHub commit was found. Pushing new commits is required to improve your score.',
      cached:       true,
    });
  }

  // ── Load the locked project spec ──────────────────────────────────────────
  const generatedContent = await prisma.stageGeneratedContent.findUnique({
    where: {
      enrollmentId_stageNumber: {
        enrollmentId,
        stageNumber: stage.stageNumber,
      },
    },
  });

  let projectSpec = {
    problemStatement:   '',
    requirements:       [] as string[],
    acceptanceCriteria: [] as string[],
    estimatedEffort:    '',
  };

  if (generatedContent) {
    try {
      projectSpec = {
        problemStatement:   generatedContent.problemStatement,
        requirements:       JSON.parse(generatedContent.requirements),
        acceptanceCriteria: JSON.parse(generatedContent.acceptanceCriteria),
        estimatedEffort:    generatedContent.estimatedEffort,
      };
    } catch { /* will be loaded by worker from DB */ }
  }

  // ── Create SubmissionRecord + Evaluation in a transaction ─────────────────
  // normalizedRepoUrl already computed above in same-URL check

  // Workstream D: determine active implementation path
  const stageProgress = await prisma.stageProgress.findUnique({
    where: { enrollmentId_stageId: { enrollmentId, stageId } },
    select: { implementationPath: true },
  });
  const activePath = stageProgress?.implementationPath || enrollment.implementationPath || enrollment.iotMode || null;

  const { submissionRecord, evaluation } = await prisma.$transaction(async (tx) => {
    const submissionRecord = await tx.submissionRecord.create({
      data: {
        enrollmentId,
        stageId,
        submittedUrl:       repoUrl,
        normalizedRepoUrl,
        commitSha:          headSha,
        specVersion:        generatedContent?.specVersion || 'v2.0',
        specHash:           generatedContent?.specHash || null,
        implementationPath: activePath,
      },
    });

    const evaluation = await tx.evaluation.create({
      data: {
        submissionRecordId: submissionRecord.id,
        enrollmentId,
        stageId,
        status:             'queued',
        currentStageLabel:  'Queued — waiting to start…',
        specVersion:        generatedContent?.specVersion || 'v2.0',
        specHash:           generatedContent?.specHash || null,
      },
    });

    // Also persist implementationPath to classic Submission table
    await tx.submission.upsert({
      where: { enrollmentId_stageId: { enrollmentId, stageId } },
      update: {
        contentUrl: repoUrl,
        implementationPath: activePath,
      },
      create: {
        enrollmentId,
        stageId,
        contentUrl: repoUrl,
        implementationPath: activePath,
      },
    });

    // Link evaluation back to submission record
    await tx.submissionRecord.update({
      where: { id: submissionRecord.id },
      data:  { evaluation: { connect: { id: evaluation.id } } },
    });

    return { submissionRecord, evaluation };
  });

  // ── Enqueue BullMQ job ─────────────────────────────────────────────────────
  const jobId = await enqueueEvaluation({
    evaluationId:       evaluation.id,
    submissionRecordId: submissionRecord.id,
    enrollmentId,
    stageId,
    repoUrl,
    normalizedRepoUrl,
    studentId:   session.studentId,
    domainSlug:  enrollment.track.domain.slug,
    stageNumber: stage.stageNumber,
    totalStages: enrollment.track.stages.length,
    projectSpec,
  });

  if (!jobId) {
    // Do not switch to a less rigorous inline/LLM-only evaluator when the
    // queue is unavailable. A failed evaluation is honest; a fallback score is not.
    await prisma.evaluation.update({
      where: { id: evaluation.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        currentStageLabel: 'Evaluation unavailable — the worker is not configured.',
        errorMessage: 'Evaluation queue is unavailable. Configure Redis and start the evaluation worker before retrying.',
      },
    });
    return NextResponse.json({
      error: 'Evaluation service is unavailable. This submission was not scored; retry once the evaluation worker is restored.',
    }, { status: 503 });
  }

    return NextResponse.json({
      evaluationId:  evaluation.id,
      status:        'queued',
      message:       'Evaluation queued successfully. This typically takes 1–3 minutes.',
      jobId,
    });
  } catch (err) {
    const { studentMessage } = await logError({
      service: 'evaluation-submit',
      error: err,
      context: { studentId: session.studentId },
    });
    return NextResponse.json({ error: studentMessage }, { status: 500 });
  }
}
