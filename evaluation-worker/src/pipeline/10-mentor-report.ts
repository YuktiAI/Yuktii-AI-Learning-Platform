/**
 * 10-mentor-report.ts — Stage 10: AI mentor report generation.
 *
 * Generates a structured, mentor-style evaluation report using Claude.
 * The report is NOT generic praise/criticism — it references specific
 * repository evidence, requirement failures, and gives concrete recommendations.
 *
 * Report structure (distinct JSON sections for clean dashboard rendering):
 *  - score:        final score
 *  - strengths:    array of specific strengths with repository evidence
 *  - gaps:         array of specific gaps with technical reasoning
 *  - reasoning:    paragraph explaining why the score landed where it did
 *  - improvements: array of concrete, actionable improvement recommendations
 *  - nextSteps:    array of suggested next things to learn/fix/implement
 */

import { callLlmWithFallback } from '../llm/llm-provider.js';
import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import type { PipelineContext, MentorReport } from '../pipeline-context.js';

export async function generateMentorReport(ctx: PipelineContext): Promise<void> {
  const { evaluationId, job } = ctx;

  logger.info('Generating mentor report', { evaluationId, stage: 'mentorReport' });

  const prompt = buildMentorPrompt(ctx);

  try {
    const res = await callLlmWithFallback({
      taskName: 'mentor-report',
      taskType: 'cognitive',
      systemPrompt: 'You are a senior technical mentor at a professional internship platform. Give students honest, specific, actionable feedback. Always reference specific evidence. Output ONLY valid JSON. No markdown.',
      userPrompt: prompt,
      temperature: 0.3,
      maxTokens: 4096,
      responseFormat: 'json_object',
    });
    const rawResponse = res.rawText;

    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object in mentor report response');

    const parsed = JSON.parse(jsonMatch[0]);

    const report: MentorReport = {
      score:        ctx.finalScore ?? 0,
      strengths:    ensureStringArray(parsed.strengths, 3),
      gaps:         ensureStringArray(parsed.gaps, 3),
      reasoning:    String(parsed.reasoning ?? 'Score reflects the evaluation findings above.'),
      improvements: ensureStringArray(parsed.improvements, 3),
      nextSteps:    ensureStringArray(parsed.nextSteps, 3),
    };

    ctx.mentorReport = report;

    // Persist
    const prisma = getPrisma();
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: { mentorReport: JSON.stringify(report) },
    });

    logger.info('Mentor report generated', {
      evaluationId,
      stage: 'mentorReport',
      strengthsCount:    report.strengths.length,
      gapsCount:         report.gaps.length,
      improvementsCount: report.improvements.length,
    });
  } catch (err) {
    logger.error('Mentor report generation failed', { evaluationId, stage: 'mentorReport', error: String(err) });

    // Fallback: generate a minimal report from the structured data we already have
    ctx.mentorReport = buildFallbackReport(ctx);
    const prisma = getPrisma();
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: { mentorReport: JSON.stringify(ctx.mentorReport) },
    });
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildMentorPrompt(ctx: PipelineContext): string {
  const { job } = ctx;
  const categories = ctx.categoryScores;
  const reqs = ctx.requirementResults;

  const passedReqs  = reqs.filter(r => r.status === 'PASS').map(r => `✓ ${r.reqText} — ${r.evidence}`);
  const failedReqs  = reqs.filter(r => r.status === 'FAIL').map(r => `✗ ${r.reqText} — Missing: ${r.missing}`);
  const partialReqs = reqs.filter(r => r.status === 'PARTIAL').map(r => `◐ ${r.reqText} — ${r.evidence} | Missing: ${r.missing}`);

  const categoryBreakdown = categories ? `
Category Scores:
- Requirements (25% weight):  ${categories.requirements}/100
- Functionality (20% weight): ${categories.functionality}/100
- Code Quality (15% weight):  ${categories.codeQuality}/100
- Architecture (10% weight):  ${categories.architecture}/100
- Dev Process (10% weight):   ${categories.devProcess}/100
- Testing (5% weight):        ${categories.testing}/100
- Documentation (5% weight):  ${categories.documentation}/100
- Security (5% weight):       ${categories.security}/100
- Innovation (5% weight):     ${categories.innovation}/100
` : '';

  const resubmissionContext = (job as any).resubmission
    ? `\nNOTE: This is a RESUBMISSION. Previous score: ${(job as any).resubmission.previousFinalScore}/100. Current score: ${ctx.finalScore}/100.`
    : '';

  return `
You are writing a mentor evaluation report for a student who submitted a GitHub repository for assessment.

## Student's Project: ${job.domainSlug} domain, Stage ${job.stageNumber} of ${job.totalStages}

## Final Score: ${ctx.finalScore}/100${resubmissionContext}

${categoryBreakdown}

## Requirement Results:
PASSED (${passedReqs.length}):
${passedReqs.join('\n') || '(none)'}

PARTIAL (${partialReqs.length}):
${partialReqs.join('\n') || '(none)'}

FAILED (${failedReqs.length}):
${failedReqs.join('\n') || '(none)'}

## OpenHands Analysis:
${ctx.openHandsResult?.skipped ? 'Agent evaluation was skipped (submission did not pass basic checks).' : ctx.openHandsResult?.summary ?? '(not available)'}

## Mini-SWE-Agent Findings:
${ctx.sweAgentFindings.map(f => `• ${f.originalClaim}: ${f.verdict} — ${f.conclusion}`).join('\n') || '(none)'}

## Git Development Process:
${ctx.gitHistoryResult?.summary ?? '(not available)'}

## Your task:
Write a structured mentor report as JSON with these exact fields:
{
  "strengths": [
    "Specific strength 1 with repository evidence (e.g., 'Clean modular design in auth.py — functions are well-named and single-responsibility')",
    "Specific strength 2 with evidence",
    "Specific strength 3 with evidence (add more if warranted)"
  ],
  "gaps": [
    "Specific gap 1 with technical reasoning (e.g., 'JWT token expiry not handled in middleware — tokens never expire which is a security risk')",
    "Specific gap 2 with evidence",
    "Specific gap 3 (add more for each failing requirement)"
  ],
  "reasoning": "1-2 paragraphs: why this score? What specifically pushed it up or down? Reference concrete findings.",
  "improvements": [
    "Actionable improvement 1 (specific, doable — e.g., 'Add try/catch around database calls in routes/user.py and return appropriate HTTP status codes')",
    "Actionable improvement 2",
    "Actionable improvement 3"
  ],
  "nextSteps": [
    "Suggested next learning step 1 (e.g., 'Study JWT refresh token patterns and implement token rotation')",
    "Next step 2",
    "Next step 3"
  ]
}

Be specific. Reference actual files and requirements. Don't use vague language. Make it feel like real mentor feedback.
`.trim();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function ensureStringArray(value: unknown, minLength: number): string[] {
  if (!Array.isArray(value)) return Array(minLength).fill('Not available');
  const strings = value.map(String).filter(s => s.length > 0);
  return strings.length > 0 ? strings : Array(minLength).fill('Not available');
}

function buildFallbackReport(ctx: PipelineContext): MentorReport {
  const passCount = ctx.requirementResults.filter(r => r.status === 'PASS').length;
  const failCount = ctx.requirementResults.filter(r => r.status === 'FAIL').length;
  const score     = ctx.finalScore ?? 0;

  return {
    score,
    strengths:    ctx.requirementResults.filter(r => r.status === 'PASS')
                    .slice(0, 3).map(r => `Requirement met: ${r.reqText}`),
    gaps:         ctx.requirementResults.filter(r => r.status === 'FAIL')
                    .slice(0, 3).map(r => `Not implemented: ${r.reqText}. ${r.missing}`),
    reasoning:    `Score of ${score}/100 reflects ${passCount} passed and ${failCount} failed requirements out of ${ctx.requirementResults.length} total. See category breakdown for details.`,
    improvements: ['Review failing requirements and implement missing functionality.',
                   'Add tests to verify your implementation works correctly.',
                   'Improve README documentation to explain your approach clearly.'],
    nextSteps:    ['Review the failing requirements listed above.',
                   'Study the acceptance criteria for your project spec.',
                   'Consider resubmitting after addressing the gaps.'],
  };
}
