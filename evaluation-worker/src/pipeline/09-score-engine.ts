/**
 * 09-score-engine.ts — Stage 9: Deterministic weighted scoring engine.
 *
 * Computes the final score from requirement results + all evidence signals.
 * Does NOT average agent self-reported scores. Scores are computed from
 * the per-requirement results (requirements category) plus signal-based
 * assessments for each other category.
 *
 * Category weights (must sum to 100):
 *   requirements:  25%  — from requirementResults PASS/PARTIAL/FAIL
 *   functionality: 20%  — from deterministic checks + OpenHands assessment
 *   codeQuality:   15%  — from OpenHands + mini-SWE-agent findings
 *   architecture:  10%  — from OpenHands structural analysis
 *   devProcess:    10%  — from git history analysis
 *   testing:        5%  — from deterministic test results
 *   documentation:  5%  — from README + inline docs signals
 *   security:       5%  — from OpenHands security signals
 *   innovation:     5%  — from OpenHands quality signals
 */

import { callLlmWithFallback } from '../llm/llm-provider.js';
import { CATEGORY_WEIGHTS } from '../config.js';
import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import type { PipelineContext, CategoryScores } from '../pipeline-context.js';

export async function computeFinalScore(ctx: PipelineContext): Promise<void> {
  const { evaluationId } = ctx;

  logger.info('Computing final score', { evaluationId, stage: 'scoreEngine' });

  // ── Category 1: Requirements (25%) — deterministic from req results ─────────
  const requirementsScore = computeRequirementsScore(ctx);

  // ── Categories 2-9: Signal-based — use Claude to assess 0-100 per category ─
  const signalScores = await computeSignalBasedScores(ctx);

  const categoryScores: CategoryScores = {
    requirements:  requirementsScore,
    functionality: signalScores.functionality,
    codeQuality:   signalScores.codeQuality,
    architecture:  signalScores.architecture,
    devProcess:    computeDevProcessScore(ctx),
    testing:       computeTestingScore(ctx),
    documentation: signalScores.documentation,
    security:      signalScores.security,
    innovation:    signalScores.innovation,
  };

  // ── Weighted final score ──────────────────────────────────────────────────
  const finalScore = Math.round(
    (categoryScores.requirements  * CATEGORY_WEIGHTS.requirements  / 100) +
    (categoryScores.functionality * CATEGORY_WEIGHTS.functionality / 100) +
    (categoryScores.codeQuality   * CATEGORY_WEIGHTS.codeQuality   / 100) +
    (categoryScores.architecture  * CATEGORY_WEIGHTS.architecture  / 100) +
    (categoryScores.devProcess    * CATEGORY_WEIGHTS.devProcess    / 100) +
    (categoryScores.testing       * CATEGORY_WEIGHTS.testing       / 100) +
    (categoryScores.documentation * CATEGORY_WEIGHTS.documentation / 100) +
    (categoryScores.security      * CATEGORY_WEIGHTS.security      / 100) +
    (categoryScores.innovation    * CATEGORY_WEIGHTS.innovation    / 100)
  );

  ctx.categoryScores = categoryScores;
  ctx.finalScore     = Math.min(100, Math.max(0, finalScore));

  // Handle resubmission delta
  const resubmission = (ctx.job as any).resubmission;
  let scoreDelta: number | null = null;
  if (resubmission?.previousFinalScore !== undefined) {
    scoreDelta = ctx.finalScore - resubmission.previousFinalScore;
  }

  // Persist
  const prisma = getPrisma();
  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: {
      finalScore:    ctx.finalScore,
      categoryScores: JSON.stringify(categoryScores),
      scoreDelta:    scoreDelta,
    },
  });

  logger.info('Final score computed', {
    evaluationId,
    stage: 'scoreEngine',
    finalScore: ctx.finalScore,
    scoreDelta,
    categories: Object.entries(categoryScores)
      .map(([k, v]) => `${k}:${v}`)
      .join(', '),
  });
}

// ── Requirements score (deterministic from PASS/PARTIAL/FAIL) ─────────────────
function computeRequirementsScore(ctx: PipelineContext): number {
  const results = ctx.requirementResults;
  if (results.length === 0) return 50; // neutral if no requirements

  const totalWeight  = results.length;
  let weightedScore  = 0;

  for (const r of results) {
    if (r.status === 'PASS')    weightedScore += 100;
    if (r.status === 'PARTIAL') weightedScore += 50;
    if (r.status === 'FAIL')    weightedScore += 0;
  }

  return Math.round(weightedScore / totalWeight);
}

// ── Testing score (deterministic from test results) ────────────────────────────
function computeTestingScore(ctx: PipelineContext): number {
  const d = ctx.deterministicChecks;
  if (!d) return 30; // no info = assume minimal

  if (!d.testsRun) return 20; // no test suite at all
  if (d.testsPassCount === 0 && d.testsFailCount === 0) return 30; // tests ran but unclear
  if (d.testsFailCount === 0 && d.testsPassCount > 0) return 90;  // all pass
  if (d.testsPassCount === 0) return 25; // all fail

  const passRate = d.testsPassCount / (d.testsPassCount + d.testsFailCount);
  return Math.round(30 + passRate * 60); // 30–90 range
}

// ── Dev process score (deterministic from git history) ────────────────────────
function computeDevProcessScore(ctx: PipelineContext): number {
  const g = ctx.gitHistoryResult;
  if (!g || g.commitCount === 0) return 30;

  let score = 50; // baseline

  // Commit count signal
  if (g.commitCount >= 10) score += 20;
  else if (g.commitCount >= 5) score += 10;
  else if (g.commitCount <= 2) score -= 20;

  // Duration signal
  if (g.durationDays >= 3) score += 15;
  else if (g.durationDays >= 1) score += 5;

  // Large commit warning
  if (g.largeCommitWarning) score -= 15;

  // Commit message quality (proxy: avg message length)
  const avgMsgLength = g.commitMessages.length > 0
    ? g.commitMessages.reduce((s, m) => s + m.length, 0) / g.commitMessages.length
    : 0;
  if (avgMsgLength >= 20) score += 10;
  else if (avgMsgLength < 5) score -= 10;

  return Math.min(100, Math.max(0, score));
}

// ── Signal-based categories (via Claude) ─────────────────────────────────────
async function computeSignalBasedScores(ctx: PipelineContext): Promise<{
  functionality: number;
  codeQuality:   number;
  architecture:  number;
  documentation: number;
  security:      number;
  innovation:    number;
}> {
  const context = buildScoringContext(ctx);

  const prompt = `
You are computing scores for specific categories of a software project evaluation.

## Evaluation Evidence:
${context}

## Deterministic data already computed:
- Requirements score (from PASS/PARTIAL/FAIL): ${computeRequirementsScore(ctx)}/100
- Testing score (from test results): ${computeTestingScore(ctx)}/100
- Dev process score (from git history): ${computeDevProcessScore(ctx)}/100

## Your task:
Score ONLY these 6 categories from 0-100 based on the evidence above:
1. functionality: Does the code actually work? (runtime behavior, error handling, edge cases)
2. codeQuality: Clean code, naming, structure, no obvious bugs or anti-patterns
3. architecture: Design decisions, separation of concerns, appropriate patterns
4. documentation: README quality, inline comments, API docs if applicable
5. security: No hardcoded secrets, basic input validation, safe practices
6. innovation: Any above-baseline implementation choices, clean APIs, thoughtful design

Be precise. Use the evidence — if there's no information about a category, score it at 50 (neutral).
Output ONLY valid JSON (no markdown):
{
  "functionality": 0-100,
  "codeQuality": 0-100,
  "architecture": 0-100,
  "documentation": 0-100,
  "security": 0-100,
  "innovation": 0-100
}
`.trim();

  const neutral = { functionality: 50, codeQuality: 50, architecture: 50, documentation: 50, security: 50, innovation: 50 };

  try {
    const res = await callLlmWithFallback({
      taskName: 'signal-scoring',
      taskType: 'scoring',
      systemPrompt: 'You are a precise technical scoring engine. Output only valid JSON. No markdown.',
      userPrompt: prompt,
      temperature: 0.1,
      maxTokens: 512,
      responseFormat: 'json_object',
    });
    const rawResponse = res.rawText;

    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return neutral;

    const parsed = JSON.parse(jsonMatch[0]);
    const clamp  = (n: unknown) => Math.min(100, Math.max(0, Number(n) || 50));

    return {
      functionality: clamp(parsed.functionality),
      codeQuality:   clamp(parsed.codeQuality),
      architecture:  clamp(parsed.architecture),
      documentation: clamp(parsed.documentation),
      security:      clamp(parsed.security),
      innovation:    clamp(parsed.innovation),
    };
  } catch (err) {
    logger.error('Signal-based scoring failed — using neutral scores', { error: String(err) });
    return neutral; // never crash the pipeline over scoring
  }
}

function buildScoringContext(ctx: PipelineContext): string {
  const parts: string[] = [];

  if (ctx.deterministicChecks) {
    const d = ctx.deterministicChecks;
    parts.push(`Deterministic: build=${d.buildSucceeds}, readme=${d.readmeFound}, tests=${d.testsRun}(pass:${d.testsPassCount} fail:${d.testsFailCount})`);
  }

  if (ctx.openHandsResult && !ctx.openHandsResult.skipped) {
    parts.push(`OpenHands summary: ${ctx.openHandsResult.summary.slice(0, 800)}`);
  }

  if (ctx.sweAgentFindings.length > 0) {
    parts.push(`SWE findings: ${ctx.sweAgentFindings.map(f => `${f.verdict}: ${f.conclusion.slice(0, 100)}`).join(' | ')}`);
  }

  const passCount = ctx.requirementResults.filter(r => r.status === 'PASS').length;
  const failCount = ctx.requirementResults.filter(r => r.status === 'FAIL').length;
  parts.push(`Requirements: ${passCount} PASS, ${ctx.requirementResults.length - passCount - failCount} PARTIAL, ${failCount} FAIL out of ${ctx.requirementResults.length}`);

  return parts.join('\n');
}
