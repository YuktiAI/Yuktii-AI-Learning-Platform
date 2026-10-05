/**
 * lib/stage-access.ts — Shared server-computed stage access state machine
 *
 * Single source of truth for whether a student can view a scenario and submit.
 * Shared between the UI (TrackDetailClient / SubmissionForm) and API routes
 * (/api/submissions and /api/evaluations/submit) so they never disagree.
 */

import { prisma } from '@/lib/prisma';
import { getStageGapDays, calculateSubmissionOpensAt, isGateBypassed } from './stage-gate';

export type StageAccessState =
  | 'LOCKED_PREREQUISITE'
  | 'SCENARIO_OPEN_SUBMISSION_LOCKED'
  | 'OPEN'
  | 'EVALUATING';

export interface StageAccess {
  state: StageAccessState;
  canSubmit: boolean;
  submissionOpensAt?: string; // ISO string when SCENARIO_OPEN_SUBMISSION_LOCKED
  reason?: string;            // Friendly text for the UI
  isPassed: boolean;
  bestScore?: number | null;
  stageNumber: number;
}

/** Rate limit constant: 1 submission every N minutes */
export const SUBMISSION_RATE_LIMIT_MINUTES = parseInt(
  process.env.SUBMISSION_RATE_LIMIT_MINUTES || '10',
  10
);

/**
 * Computes access state for a given enrollment and stage.
 */
export async function getStageAccess(
  enrollmentId: string,
  stageId: string,
  studentId: string
): Promise<StageAccess> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      track: {
        include: {
          stages: { orderBy: { stageNumber: 'asc' } },
        },
      },
      submissions: true,
      evaluations: {
        orderBy: { createdAt: 'desc' },
      },
      stageProgresses: true,
    },
  });

  if (!enrollment || enrollment.studentId !== studentId) {
    throw new Error('Enrollment not found or unauthorized');
  }

  const stages = enrollment.track.stages;
  const currentStage = stages.find((s) => s.id === stageId);
  if (!currentStage) {
    throw new Error('Stage not found');
  }

  const stageNumber = currentStage.stageNumber;

  // 1. Check current stage pass status & best score
  const currentStageEvals = enrollment.evaluations.filter((e) => e.stageId === stageId);
  const completedEvals = currentStageEvals.filter(
    (e) => ['completed', 'needs_review'].includes(e.status) && e.finalScore !== null
  );
  const currentProgress = enrollment.stageProgresses.find((p) => p.stageId === stageId);

  const bestScore = completedEvals.length > 0
    ? Math.max(...completedEvals.map((e) => e.finalScore ?? 0))
    : currentProgress?.bestScore ?? null;

  const isPassed =
    (currentProgress?.status === 'PASSED') ||
    (bestScore !== null && bestScore >= 50) ||
    enrollment.submissions.some((s) => s.stageId === stageId && s.aiEvalPassed === true);

  // 2. Prerequisite check (Stage N > 1 requires Stage N - 1 genuinely passed)
  if (stageNumber > 1) {
    const prevStage = stages.find((s) => s.stageNumber === stageNumber - 1);
    if (!prevStage) {
      return {
        state: 'LOCKED_PREREQUISITE',
        canSubmit: false,
        reason: `Previous stage not found.`,
        isPassed: false,
        bestScore: null,
        stageNumber,
      };
    }

    const prevStageEvals = enrollment.evaluations.filter((e) => e.stageId === prevStage.id);
    const prevCompletedEvals = prevStageEvals.filter(
      (e) => ['completed', 'needs_review'].includes(e.status) && (e.finalScore ?? 0) >= 50
    );
    const prevProgress = enrollment.stageProgresses.find((p) => p.stageId === prevStage.id);
    const prevSubmission = enrollment.submissions.find((s) => s.stageId === prevStage.id);

    const prevPassed =
      (prevProgress?.status === 'PASSED') ||
      prevCompletedEvals.length > 0 ||
      prevSubmission?.aiEvalPassed === true ||
      (prevProgress?.bestScore !== null && (prevProgress?.bestScore ?? 0) >= 50);

    if (!prevPassed) {
      return {
        state: 'LOCKED_PREREQUISITE',
        canSubmit: false,
        reason: `Stage ${stageNumber} will unlock after you complete Stage ${stageNumber - 1}.`,
        isPassed: false,
        bestScore: null,
        stageNumber,
      };
    }
  }

  // 3. In-flight check: reject new submission while previous evaluation is queued or running
  const inFlightEval = currentStageEvals.find((e) => ['queued', 'running'].includes(e.status));
  if (inFlightEval) {
    return {
      state: 'EVALUATING',
      canSubmit: false,
      reason: 'Your last submission is still being evaluated. Please wait for the evaluation report before resubmitting.',
      isPassed,
      bestScore,
      stageNumber,
    };
  }

  // 4. Time-gate check (applies only to the first submission of later stages)
  // If the stage is already passed, the student has unlocked it permanently for resubmission.
  if (!isPassed && stageNumber > 1 && !isGateBypassed()) {
    const now = new Date();
    let opensAt: Date | null = null;

    if (currentProgress?.submissionOpensAt) {
      opensAt = new Date(currentProgress.submissionOpensAt);
    } else {
      // Calculate from prerequisite stage's pass timestamp
      const prevStage = stages.find((s) => s.stageNumber === stageNumber - 1);
      const prevProgress = prevStage
        ? enrollment.stageProgresses.find((p) => p.stageId === prevStage.id)
        : null;
      const prevEval = prevStage
        ? enrollment.evaluations.find((e) => e.stageId === prevStage.id && ['completed', 'needs_review'].includes(e.status) && (e.finalScore ?? 0) >= 50)
        : null;

      const passedAt = prevProgress?.passedAt || prevEval?.completedAt || enrollment.enrolledAt;
      const gapDays = getStageGapDays(
        stageNumber,
        enrollment.track.duration,
        stages.length,
        currentStage.gapDaysOverride
      );
      opensAt = calculateSubmissionOpensAt(new Date(passedAt), gapDays);
    }

    if (opensAt && now < opensAt) {
      const formattedDate = opensAt.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      return {
        state: 'SCENARIO_OPEN_SUBMISSION_LOCKED',
        canSubmit: false,
        submissionOpensAt: opensAt.toISOString(),
        reason: `Stage ${stageNumber} submission is locked. Please complete the Stage ${stageNumber} activity and submit after ${formattedDate} IST.`,
        isPassed: false,
        bestScore: null,
        stageNumber,
      };
    }
  }

  // 5. Open for submission (or resubmission)
  return {
    state: 'OPEN',
    canSubmit: true,
    reason: isPassed
      ? 'Stage completed! You can resubmit with new commits at any time to improve your score. Your existing pass and best score are permanently preserved.'
      : undefined,
    isPassed,
    bestScore,
    stageNumber,
  };
}

/**
 * Computes access states for all stages in a track for a given enrollment.
 * Reduces database lookups when rendering the track dashboard.
 */
export async function getAllStagesAccess(
  enrollmentId: string,
  studentId: string
): Promise<Record<string, StageAccess>> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      track: {
        include: {
          stages: { orderBy: { stageNumber: 'asc' } },
        },
      },
      submissions: true,
      evaluations: {
        orderBy: { createdAt: 'desc' },
      },
      stageProgresses: true,
    },
  });

  if (!enrollment || enrollment.studentId !== studentId) {
    throw new Error('Enrollment not found or unauthorized');
  }

  const stages = enrollment.track.stages;
  const accessMap: Record<string, StageAccess> = {};
  const passedStages = new Set<string>();

  // Pass 1: compute pass status & bestScore for each stage
  for (const stage of stages) {
    const stageEvals = enrollment.evaluations.filter((e) => e.stageId === stage.id);
    const completedEvals = stageEvals.filter(
      (e) => ['completed', 'needs_review'].includes(e.status) && e.finalScore !== null
    );
    const currentProgress = enrollment.stageProgresses.find((p) => p.stageId === stage.id);

    const bestScore = completedEvals.length > 0
      ? Math.max(...completedEvals.map((e) => e.finalScore ?? 0))
      : currentProgress?.bestScore ?? null;

    const isPassed =
      (currentProgress?.status === 'PASSED') ||
      (bestScore !== null && bestScore >= 50) ||
      enrollment.submissions.some((s) => s.stageId === stage.id && s.aiEvalPassed === true);

    if (isPassed) {
      passedStages.add(stage.id);
    }
  }

  // Pass 2: compute StageAccess for each stage
  for (const stage of stages) {
    const stageNumber = stage.stageNumber;
    const stageEvals = enrollment.evaluations.filter((e) => e.stageId === stage.id);
    const currentProgress = enrollment.stageProgresses.find((p) => p.stageId === stage.id);
    const completedEvals = stageEvals.filter(
      (e) => ['completed', 'needs_review'].includes(e.status) && e.finalScore !== null
    );
    const bestScore = completedEvals.length > 0
      ? Math.max(...completedEvals.map((e) => e.finalScore ?? 0))
      : currentProgress?.bestScore ?? null;
    const isPassed = passedStages.has(stage.id);

    // Prerequisite check
    if (stageNumber > 1) {
      const prevStage = stages.find((s) => s.stageNumber === stageNumber - 1);
      const prevPassed = prevStage ? (
        passedStages.has(prevStage.id) ||
        enrollment.submissions.some((s) => s.stageId === prevStage.id && s.aiEvalPassed === true)
      ) : false;
      if (!prevStage || !prevPassed) {
        accessMap[stage.id] = {
          state: 'LOCKED_PREREQUISITE',
          canSubmit: false,
          reason: `Stage ${stageNumber} will unlock after you complete Stage ${stageNumber - 1}.`,
          isPassed: false,
          bestScore: null,
          stageNumber,
        };
        continue;
      }
    }

    // In-flight check
    const inFlightEval = stageEvals.find((e) => ['queued', 'running'].includes(e.status));
    if (inFlightEval) {
      accessMap[stage.id] = {
        state: 'EVALUATING',
        canSubmit: false,
        reason: 'Your last submission is still being evaluated. Please wait for the evaluation report before resubmitting.',
        isPassed,
        bestScore,
        stageNumber,
      };
      continue;
    }

    // Time-gate check
    if (!isPassed && stageNumber > 1 && !isGateBypassed()) {
      const now = new Date();
      let opensAt: Date | null = null;
      if (currentProgress?.submissionOpensAt) {
        opensAt = new Date(currentProgress.submissionOpensAt);
      } else {
        const prevStage = stages.find((s) => s.stageNumber === stageNumber - 1);
        const prevProgress = prevStage ? enrollment.stageProgresses.find((p) => p.stageId === prevStage.id) : null;
        const prevEval = prevStage
          ? enrollment.evaluations.find((e) => e.stageId === prevStage.id && ['completed', 'needs_review'].includes(e.status) && (e.finalScore ?? 0) >= 50)
          : null;
        const passedAt = prevProgress?.passedAt || prevEval?.completedAt || enrollment.enrolledAt;
        const gapDays = getStageGapDays(
          stageNumber,
          enrollment.track.duration,
          stages.length,
          stage.gapDaysOverride
        );
        opensAt = calculateSubmissionOpensAt(new Date(passedAt), gapDays);
      }

      if (opensAt && now < opensAt) {
        const formattedDate = opensAt.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        accessMap[stage.id] = {
          state: 'SCENARIO_OPEN_SUBMISSION_LOCKED',
          canSubmit: false,
          submissionOpensAt: opensAt.toISOString(),
          reason: `Stage ${stageNumber} submission is locked. Please complete the Stage ${stageNumber} activity and submit after ${formattedDate} IST.`,
          isPassed: false,
          bestScore: null,
          stageNumber,
        };
        continue;
      }
    }

    // Open for submission / resubmission
    accessMap[stage.id] = {
      state: 'OPEN',
      canSubmit: true,
      reason: isPassed
        ? 'Stage completed! You can resubmit with new commits at any time to improve your score. Your existing pass and best score are permanently preserved.'
        : undefined,
      isPassed,
      bestScore,
      stageNumber,
    };
  }

  return accessMap;
}
