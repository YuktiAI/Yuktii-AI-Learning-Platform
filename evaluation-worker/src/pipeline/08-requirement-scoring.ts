/**
 * 08-requirement-scoring.ts — Stage 8: Per-requirement PASS/PARTIAL/FAIL scoring.
 *
 * For every requirement in the original Groq-generated spec:
 *  1. Check deterministic findings (did a related endpoint/file exist?)
 *  2. Check OpenHands findings (did it assess this requirement?)
 *  3. Check mini-SWE-agent findings (was a related claim confirmed/denied?)
 *  4. Synthesize into PASS / PARTIAL / FAIL with evidence + missing description
 *
 * This is the authoritative per-requirement record — it feeds the scoring engine
 * and is shown in the dashboard requirement table.
 */

import { callLlmWithFallback } from '../llm/llm-provider.js';
import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import type {
  PipelineContext,
  RequirementResult,
  RequirementStatus,
} from '../pipeline-context.js';

export async function scoreRequirements(ctx: PipelineContext): Promise<void> {
  const { evaluationId, job } = ctx;
  const { requirements } = job.projectSpec;

  if (requirements.length === 0) {
    logger.warn('No requirements in spec — cannot score requirements', { evaluationId, stage: 'reqScoring' });
    ctx.requirementResults = [];
    return;
  }

  logger.info('Scoring requirements', {
    evaluationId,
    stage: 'reqScoring',
    requirementsCount: requirements.length,
  });

  // Build context summary for Claude
  const context = buildScoringContext(ctx);

  // Score all requirements in a single Claude call (more efficient than per-requirement)
  const requirementsList = requirements.map((r, i) => `REQ-${i + 1}: ${r}`).join('\n');

  const prompt = `
You are scoring a student's software project against its original requirements.

## Original Requirements:
${requirementsList}

## Evaluation Evidence:
${context}

## Task:
For EACH requirement (REQ-1 through REQ-${requirements.length}), determine:
- status: "PASS" (clearly implemented and works), "PARTIAL" (partially implemented or unclear), or "FAIL" (not implemented or broken)
- evidence: specific file/function/code reference that supports your assessment (be precise)
- missing: for PARTIAL/FAIL, what specifically is missing or broken

Output ONLY valid JSON — an array with one entry per requirement:
[
  {
    "reqId": "REQ-1",
    "reqText": "exact requirement text",
    "status": "PASS|PARTIAL|FAIL",
    "evidence": "specific evidence from repository",
    "missing": "what is missing (empty string if PASS)"
  }
]
`.trim();

  try {
    const res = await callLlmWithFallback({
      taskName: 'requirement-scoring',
      taskType: 'scoring',
      systemPrompt: 'You are a precise technical evaluator. Output only valid JSON. No markdown, no code fences.',
      userPrompt: prompt,
      temperature: 0.1,
      maxTokens: 4096,
      responseFormat: 'json_object',
    });
    const rawResponse = res.rawText;

    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      reqId:   string;
      reqText: string;
      status:  string;
      evidence: string;
      missing:  string;
    }>;

    const validStatuses: RequirementStatus[] = ['PASS', 'PARTIAL', 'FAIL'];
    const results: RequirementResult[] = parsed.map((r, i) => ({
      reqId:    r.reqId ?? `REQ-${i + 1}`,
      reqText:  r.reqText ?? (requirements[i] ?? ''),
      status:   validStatuses.includes(r.status as RequirementStatus)
                  ? (r.status as RequirementStatus)
                  : 'PARTIAL',
      evidence: r.evidence ?? '',
      missing:  r.missing ?? '',
    }));

    ctx.requirementResults = results;

    // Persist
    const prisma = getPrisma();
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: { requirementResults: JSON.stringify(results) },
    });

    const passCount    = results.filter(r => r.status === 'PASS').length;
    const partialCount = results.filter(r => r.status === 'PARTIAL').length;
    const failCount    = results.filter(r => r.status === 'FAIL').length;

    logger.info('Requirement scoring complete', {
      evaluationId,
      stage: 'reqScoring',
      passCount,
      partialCount,
      failCount,
    });
  } catch (err) {
    logger.error('Requirement scoring failed', { evaluationId, stage: 'reqScoring', error: String(err) });
    // Fallback: create PARTIAL entries for all requirements
    ctx.requirementResults = requirements.map((r, i) => ({
      reqId:    `REQ-${i + 1}`,
      reqText:  r,
      status:   'PARTIAL' as RequirementStatus,
      evidence: 'Scoring engine could not determine status from available evidence.',
      missing:  '',
    }));
  }
}

// ── Context builder for the scoring prompt ────────────────────────────────────
function buildScoringContext(ctx: PipelineContext): string {
  const sections: string[] = [];

  // Deterministic checks summary
  if (ctx.deterministicChecks) {
    const d = ctx.deterministicChecks;
    sections.push(`### Deterministic Checks
- README present: ${d.readmeFound}
- Build/install succeeds: ${d.buildSucceeds}
- Tests found and run: ${d.testsRun} (passed: ${d.testsPassCount}, failed: ${d.testsFailCount})
- Code files with functions found: ${d.endpointsFound.join(', ') || 'none'}
`);
  }

  // OpenHands summary
  if (ctx.openHandsResult && !ctx.openHandsResult.skipped) {
    sections.push(`### OpenHands Broad Evaluation Summary
${ctx.openHandsResult.summary}

Flagged Issues:
${ctx.openHandsResult.flaggedIssues.map(f => `- [${f.severity.toUpperCase()}] ${f.claim}`).join('\n') || '(none flagged)'}
`);
  }

  // mini-SWE-agent findings
  if (ctx.sweAgentFindings.length > 0) {
    sections.push(`### mini-SWE-agent Investigation Findings
${ctx.sweAgentFindings.map(f =>
  `Claim: "${f.originalClaim}"\nVerdict: ${f.verdict}\nConclusion: ${f.conclusion}`
).join('\n\n')}
`);
  }

  // Git history signal
  if (ctx.gitHistoryResult) {
    sections.push(`### Development Process Signal
${ctx.gitHistoryResult.summary}
Commits: ${ctx.gitHistoryResult.commitCount}, Duration: ${ctx.gitHistoryResult.durationDays} days
`);
  }

  return sections.join('\n') || 'Limited evaluation evidence available.';
}
