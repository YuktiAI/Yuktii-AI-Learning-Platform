/**
 * 06-swe-agent-investigation.ts — Stage 6: mini-SWE-agent focused investigation.
 *
 * For each issue flagged by OpenHands (high/medium severity), tasks mini-SWE-agent
 * with investigating that SPECIFIC claim only. High severity issues always get
 * investigated; medium issues are investigated up to a cap to control cost.
 */

import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import { investigateClaim } from '../agents/mini-swe-agent.js';
import type { PipelineContext } from '../pipeline-context.js';

// Investigate high-severity claims always, medium up to this many, low = skip
const MAX_MEDIUM_INVESTIGATIONS = 3;
const MAX_HIGH_INVESTIGATIONS   = 5;

export async function runSweAgentInvestigation(ctx: PipelineContext): Promise<void> {
  const { evaluationId, sandboxId, sandboxRepoPath, openHandsResult } = ctx;

  if (!sandboxId || !sandboxRepoPath) {
    throw new Error('Sandbox not initialized before mini-SWE-agent stage.');
  }

  let toInvestigate: Array<{ claim: string; severity: 'high' | 'medium' | 'low'; filePaths: string[] }> = [];

  if (ctx.harnessType === 'narrow') {
    // Narrow harness: inspect requirements directly without OpenHands
    logger.info('Running mini-SWE-agent in narrow harness mode on project requirements', { evaluationId });
    toInvestigate = ctx.job.projectSpec.requirements.slice(0, 5).map((req, idx) => ({
      claim: `Requirement ${idx + 1}: ${req}`,
      severity: 'high' as const,
      filePaths: [],
    }));
  } else {
    // Broad harness: inspect issues flagged by OpenHands
    if (!openHandsResult || openHandsResult.flaggedIssues.length === 0) {
      logger.info('No flagged issues — skipping mini-SWE-agent', { evaluationId, stage: 'sweAgent' });
      return;
    }

    // Prioritize: investigate high-severity first, then medium, skip low
    const highIssues   = openHandsResult.flaggedIssues.filter(i => i.severity === 'high').slice(0, MAX_HIGH_INVESTIGATIONS);
    const mediumIssues = openHandsResult.flaggedIssues.filter(i => i.severity === 'medium').slice(0, MAX_MEDIUM_INVESTIGATIONS);
    toInvestigate = [...highIssues, ...mediumIssues];
  }

  logger.info('mini-SWE-agent investigations queued', {
    evaluationId,
    stage: 'sweAgent',
    harnessType: ctx.harnessType,
    totalToInvestigate: toInvestigate.length,
  });

  const findings = [];

  // Investigate sequentially (not parallel) to avoid overwhelming the sandbox
  for (let i = 0; i < toInvestigate.length; i++) {
    const claim = toInvestigate[i];
    try {
      const finding = await investigateClaim({
        claim,
        sandboxId,
        sandboxRepoPath,
        evaluationId,
        claimIndex: i,
      });
      if (finding.gaveUp) {
        ctx.flaggedForHumanReview = true;
        ctx.humanReviewReason = ctx.humanReviewReason || 'agent_gave_up';
      }
      findings.push(finding);
    } catch (err) {
      logger.warn(`mini-SWE-agent failed for claim ${i + 1}`, {
        evaluationId,
        stage: 'sweAgent',
        error: String(err),
      });
      // Record a failed investigation — don't abort the whole pipeline
      findings.push({
        originalClaim: claim.claim,
        verdict:       'partially_confirmed' as const,
        fileEvidence:  [],
        conclusion:    `Investigation failed: ${String(err)}`,
      });
    }
  }

  ctx.sweAgentFindings = findings;

  // Persist
  const prisma = getPrisma();
  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: { sweAgentFindings: JSON.stringify(findings) },
  });

  logger.info('mini-SWE-agent investigations complete', {
    evaluationId,
    stage: 'sweAgent',
    findingsCount: findings.length,
  });
}
