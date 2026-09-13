/**
 * 05-openhands-eval.ts — Stage 5: OpenHands broad evaluation.
 */

import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import { runOpenHandsEvaluation } from '../agents/openhands.js';
import type { PipelineContext } from '../pipeline-context.js';

export async function runOpenHands(ctx: PipelineContext): Promise<void> {
  const { evaluationId, job, sandboxId, sandboxRepoPath, deterministicChecks } = ctx;

  // If deterministic gate already set openHandsResult (skipped), don't overwrite
  if (ctx.openHandsResult?.skipped) {
    logger.info('OpenHands skipped (deterministic gate)', { evaluationId, stage: 'openHands' });
    return;
  }

  if (!sandboxId || !sandboxRepoPath) {
    throw new Error('Sandbox not initialized before OpenHands stage.');
  }

  const deterministicSummary = deterministicChecks
    ? [
        `README found: ${deterministicChecks.readmeFound}`,
        `Build succeeds: ${deterministicChecks.buildSucceeds}`,
        `Tests run: ${deterministicChecks.testsRun}`,
        `Tests passed: ${deterministicChecks.testsPassCount}, failed: ${deterministicChecks.testsFailCount}`,
        `Entry points found: ${deterministicChecks.endpointsFound.join(', ') || 'none'}`,
      ].join('\n')
    : 'Deterministic checks not available';

  const result = await runOpenHandsEvaluation({
    sandboxId,
    sandboxRepoPath,
    projectSpec:          job.projectSpec,
    deterministicSummary,
    domainSlug:           job.domainSlug,
    evaluationId,
  });

  ctx.openHandsResult = result;

  if (result.trajectory && result.trajectory.length > 0) {
    ctx.agentTrajectory.push(...result.trajectory);
  }

  if (result.gaveUp) {
    ctx.flaggedForHumanReview = true;
    ctx.humanReviewReason = ctx.humanReviewReason || 'agent_gave_up';
    logger.warn('OpenHands gave up — flagged for human review', { evaluationId });
  }

  // Persist immediately
  const prisma = getPrisma();
  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: {
      openHandsFindings: JSON.stringify({
        summary:       result.summary,
        flaggedIssues: result.flaggedIssues,
        rawLog:        result.rawLog.slice(0, 5000),
      }),
    },
  });

  logger.info('OpenHands complete', {
    evaluationId,
    stage: 'openHands',
    flaggedIssuesCount: result.flaggedIssues.length,
    gaveUp: result.gaveUp,
  });
}
