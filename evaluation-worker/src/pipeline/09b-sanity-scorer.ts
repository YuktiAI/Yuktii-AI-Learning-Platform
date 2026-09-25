/**
 * 09b-sanity-scorer.ts — Section 9.4 Sanity Scorer + Human Review Flagging
 *
 * Runs an independent second-opinion evaluation via Gemini (cross-provider)
 * to verify the score produced by the multi-agent pipeline.
 *
 * A-1 PATCH: Disagreement check is FLAG-ONLY — the score is NEVER modified here.
 * A large delta between primary (Groq-based) and sanity (Gemini) scorers usually
 * means one scorer is wrong, not that the student's work is wrong. The right
 * resolution is human review, not an automatic score penalty.
 *
 * Flagging conditions:
 *  1. |primaryScore - sanityScore| > 20 → flagged: 'scorer_disagreement'
 *  2. primaryScore in boundary zone (65–75) → flagged: 'boundary_case'
 *
 * Neither condition modifies ctx.finalScore or ctx.passed.
 * Flagged evaluations sit in 'needs_review' until an admin acts.
 */

import { callLlmWithFallback, extractAndParseJson } from '../llm/llm-provider.js';
import { logger } from '../logger.js';
import type { PipelineContext } from '../pipeline-context.js';

const SANITY_DISAGREEMENT_THRESHOLD = 20;
const BOUNDARY_LOW  = 65;
const BOUNDARY_HIGH = 75;

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
      role: 'sanity-scorer',
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
    logger.warn('Sanity scorer overall call failed — using primary score as fallback', {
      evaluationId,
      error: String(err),
    });
    sanityScore = currentScore;
  }

  const sanityDiff = Math.abs(currentScore - sanityScore);
  ctx.sanityScore = sanityScore;
  ctx.sanityDiff  = sanityDiff;
  // scorerDisagreementDelta stored for admin visibility regardless of whether it triggers a flag
  ctx.scorerDisagreementDelta = sanityDiff;

  logger.info('Sanity score computed', {
    evaluationId,
    primaryScore: currentScore,
    sanityScore,
    sanityDiff,
    rationale,
  });

  // ── Flag condition 1: Significant scorer disagreement ─────────────────────
  // A-1 PATCH: This is FLAG-ONLY. The real score stays at ctx.finalScore.
  // Do NOT cap, do NOT overwrite ctx.finalScore, do NOT set ctx.passed here.
  // The student sees "under review" (not "failed") until a human decides.
  if (sanityDiff > SANITY_DISAGREEMENT_THRESHOLD) {
    ctx.flaggedForHumanReview = true;
    ctx.humanReviewReason = ctx.humanReviewReason || 'scorer_disagreement';
    logger.warn('[sanity] Evaluation flagged for review: scorer disagreement', {
      evaluationId,
      primaryScore: currentScore,
      sanityScore,
      sanityDiff,
      note: 'Score NOT modified — flag-only per A-1 spec. Admin must resolve.',
    });
  }

  // ── Flag condition 2: Score on pass/fail boundary ─────────────────────────
  // Scores in 65–75 range are close enough to the threshold that small LLM
  // variance could flip the outcome — require a human to confirm.
  if (currentScore >= BOUNDARY_LOW && currentScore <= BOUNDARY_HIGH) {
    ctx.flaggedForHumanReview = true;
    ctx.humanReviewReason = ctx.humanReviewReason || 'boundary_case';
    logger.warn('[sanity] Evaluation flagged for review: boundary score', {
      evaluationId,
      currentScore,
    });
  }

  // NOTE: ctx.passed is computed in 11-save-results.ts where both the hard-gate
  // result and flaggedForHumanReview are both visible. Do not set it here.
}
