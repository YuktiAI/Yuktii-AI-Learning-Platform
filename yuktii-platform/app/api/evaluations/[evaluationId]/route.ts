/**
 * GET /api/evaluations/[evaluationId]
 *
 * Returns the current state of an evaluation.
 * Polled by the dashboard every 10s while status is "queued" or "running".
 *
 * Returns full evaluation data when completed (scores, report, requirement results).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionSync } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { evaluationId: string } }
) {
  const session = getSessionSync();
  if (!session) return NextResponse.json({ error: 'Log in first' }, { status: 401 });

  const { evaluationId } = params;

  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: {
      submissionRecord: {
        select: {
          enrollmentId: true,
          submittedUrl: true,
          commitSha:    true,
          submittedAt:  true,
        },
      },
    },
  });

  if (!evaluation) {
    return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 });
  }

  // Security: ensure the evaluation belongs to this student's enrollment
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: evaluation.enrollmentId },
    select: { studentId: true },
  });

  if (!enrollment || enrollment.studentId !== session.studentId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Parse JSON fields for the response
  const safeParseJson = <T>(str: string | null | undefined, fallback: T): T => {
    if (!str) return fallback;
    try { return JSON.parse(str) as T; } catch { return fallback; }
  };

  // Find previous evaluation if this is a resubmission
  let previousEvaluation = null;
  if (evaluation.previousEvaluationId) {
    previousEvaluation = await prisma.evaluation.findUnique({
      where: { id: evaluation.previousEvaluationId },
      select: { id: true, finalScore: true, completedAt: true },
    });
  }

  return NextResponse.json({
    id:                 evaluation.id,
    status:             evaluation.status,
    currentStageLabel:  evaluation.currentStageLabel,
    finalScore:         evaluation.finalScore,
    categoryScores:     safeParseJson(evaluation.categoryScores, null),
    requirementResults: safeParseJson(evaluation.requirementResults, []),
    gitHistoryAnalysis: safeParseJson(evaluation.gitHistoryAnalysis, null),
    mentorReport:       safeParseJson(evaluation.mentorReport, null),
    deterministicChecks: safeParseJson(evaluation.deterministicChecks, null),
    openHandsFindings:  safeParseJson(evaluation.openHandsFindings, null),
    sweAgentFindings:   safeParseJson(evaluation.sweAgentFindings, []),
    errorMessage:       evaluation.errorMessage,
    startedAt:          evaluation.startedAt,
    completedAt:        evaluation.completedAt,
    createdAt:          evaluation.createdAt,
    scoreDelta:         evaluation.scoreDelta,
    previousEvaluation,
    submissionRecord:   evaluation.submissionRecord,
  });
}
