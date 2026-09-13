/**
 * 09b-sanity-scorer.ts — Section 9.4 Sanity Scorer + Human Review Flagging
 *
 * Runs an independent second-opinion evaluation via Groq (llama-3.3-70b-versatile)
 * to verify the score produced by the multi-agent pipeline.
 *
 * Discrepancy checks:
 * - If |finalScore - sanityScore| > 20: flags evaluation for human review (score_discrepancy).
 * - If finalScore is on the pass/fail boundary (65-75): flags for human review (boundary_case).
 * - Flags prevent automatic certificate release until an admin reviews or approves.
 */

import { callLlmWithFallback, extractAndParseJson } from '../llm/llm-provider.js';
import { logger } from '../logger.js';
import type { PipelineContext } from '../pipeline-context.js';

export async function runSanityScorer(ctx: PipelineContext): Promise<void> {
  const { evaluationId, finalScore, job } = ctx;
  const currentScore = finalScore ?? 50;

  logger.info('Running sanity scorer (independent second opinion)', {
    evaluationId,
    stage: 'sanityScorer',
    currentScore,
  });

  let sanityScore = currentScore;
  let rationale = 'Default sanity review';

  try {
    const summaryContext = [
      `Stage: ${job.stageNumber} of ${job.totalStages} (${job.domainSlug})`,
      `Problem Statement: ${job.projectSpec.problemStatement}`,
      `Requirements: ${job.projectSpec.requirements.join('; ')}`,
      `Deterministic Checks: Readme=${ctx.deterministicChecks?.readmeFound}, Build=${ctx.deterministicChecks?.buildSucceeds}, TestsPassed=${ctx.deterministicChecks?.testsPassCount}, TestsFailed=${ctx.deterministicChecks?.testsFailCount}`,
      `Requirements Assessed: ${ctx.requirementResults.map(r => `${r.reqId}:${r.status}`).join(', ')}`,
    ].join('\n');

    const prompt = `You are an independent Senior Curriculum Quality Auditor reviewing an internship student's project submission.
Provide an objective, calibrated score from 0 to 100 based on this evidence:

${summaryContext}

Output ONLY valid JSON with this exact schema:
{
  "score": 0-100,
  "rationale": "1-2 sentence justification for this score"
}`;

    const res = await callLlmWithFallback<{ score: number; rationale?: string }>({
      taskName: 'sanity-scorer',
      taskType: 'audit',
      systemPrompt: 'You are an objective engineering quality auditor. Output only valid JSON.',
      userPrompt: prompt,
      temperature: 0.2,
      maxTokens: 500,
      responseFormat: 'json_object',
    });

    const parsed = res.json ?? extractAndParseJson(res.rawText);
    if (typeof parsed?.score === 'number') {
      sanityScore = Math.min(100, Math.max(0, Math.round(parsed.score)));
      rationale = String(parsed.rationale || 'Audited');
      logger.info('Sanity scorer succeeded', { provider: res.provider, model: res.modelUsed, sanityScore });
    }
  } catch (err) {
    logger.warn('Sanity scorer overall call failed — using baseline check', {
      evaluationId,
      error: String(err),
    });
    sanityScore = currentScore;
  }

  const sanityDiff = Math.abs(currentScore - sanityScore);
  ctx.sanityScore = sanityScore;
  ctx.sanityDiff = sanityDiff;

  logger.info('Sanity score computed', {
    evaluationId,
    primaryScore: currentScore,
    sanityScore,
    sanityDiff,
    rationale,
  });

  // Flag condition 1: Score discrepancy > 20 points
  if (sanityDiff > 20) {
    ctx.flaggedForHumanReview = true;
    ctx.humanReviewReason = ctx.humanReviewReason || 'score_discrepancy';
    logger.warn('Evaluation flagged for human review: score discrepancy > 20 points', {
      evaluationId,
      primaryScore: currentScore,
      sanityScore,
      sanityDiff,
    });
  }

  // Flag condition 2: Boundary case (65 - 75 score range around pass threshold 70)
  if (currentScore >= 65 && currentScore <= 75) {
    ctx.flaggedForHumanReview = true;
    ctx.humanReviewReason = ctx.humanReviewReason || 'boundary_case';
    logger.info('Evaluation flagged for human review: score on pass/fail boundary (65-75)', {
      evaluationId,
      currentScore,
    });
  }
}
