/**
 * 10b-model-answer.ts — Stage 10b: Dynamic per-student model answer generation.
 *
 * Generates a personalised model answer based on:
 *   1. The student's specific AI-generated project spec (problem statement, requirements)
 *   2. What the student built (from evaluation evidence: deterministicChecks, requirementResults)
 *   3. What they missed (from requirement PARTIAL/FAIL results)
 *
 * The result is stored in ctx.dynamicModelAnswer and then saved to Evaluation.modelAnswer
 * by Stage 11. It replaces the generic static Stage.modelAnswer field shown to students.
 */

import { callLlmWithFallback } from '../llm/llm-provider.js';
import { logger } from '../logger.js';
import type { PipelineContext } from '../pipeline-context.js';

export async function generateModelAnswer(ctx: PipelineContext): Promise<void> {
  const { evaluationId, job, requirementResults } = ctx;
  const { projectSpec, domainSlug, stageNumber } = job;

  if (!projectSpec.problemStatement && projectSpec.requirements.length === 0) {
    logger.warn('No project spec available for model answer generation', { evaluationId });
    ctx.dynamicModelAnswer = null;
    return;
  }

  logger.info('Generating dynamic model answer', { evaluationId, stage: 'modelAnswer', stageNumber });

  // Build what the student was supposed to do
  const requirementsList = projectSpec.requirements
    .map((r, i) => `${i + 1}. ${r}`)
    .join('\n');

  const acceptanceCriteriaList = projectSpec.acceptanceCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join('\n');

  // Build what they missed from requirement scoring
  const failedReqs = requirementResults
    .filter(r => r.status === 'FAIL' || r.status === 'PARTIAL')
    .map(r => `- ${r.reqId} [${r.status}]: ${r.reqText}\n  Missing: ${r.missing}`)
    .join('\n');

  const passedReqs = requirementResults
    .filter(r => r.status === 'PASS')
    .map(r => `- ${r.reqId}: ${r.reqText}`)
    .join('\n');

  const prompt = `You are a senior mentor writing a model answer for a student who just completed Stage ${stageNumber} of a ${domainSlug} project.

## Their Project Assignment

**Problem Statement:**
${projectSpec.problemStatement}

**Requirements:**
${requirementsList}

**Acceptance Criteria:**
${acceptanceCriteriaList}

## What the Student Implemented (from evaluation)

**Requirements PASSED:**
${passedReqs || '(none fully passed)'}

**Requirements MISSED or PARTIAL:**
${failedReqs || '(all requirements were met)'}

## Your Task

Write a clear, specific model answer for THIS assignment. It must be:
1. Specific to this problem statement — not generic advice
2. Show exactly how each requirement should be implemented
3. For missed/partial requirements, explain the correct approach with concrete examples
4. Include key files, code structure, or commands that a complete solution would have
5. Be written in a helpful mentor tone — not condescending

Format:
- Start with a brief overview of the complete solution
- Then address each requirement in order
- Use code examples or pseudo-code where helpful
- End with "Key things to focus on for improvement" if any requirements were missed

Keep it under 600 words. Be specific to the ${domainSlug} domain.`;

  try {
    const res = await callLlmWithFallback({
      taskName: 'model-answer',
      taskType: 'generation',
      systemPrompt: `You are a senior ${domainSlug} mentor writing a specific, helpful model answer for a student project. Be concrete and specific — not generic.`,
      userPrompt: prompt,
      temperature: 0.3,
      maxTokens: 1200,
    });

    ctx.dynamicModelAnswer = res.rawText.trim();

    logger.info('Dynamic model answer generated', {
      evaluationId,
      stage: 'modelAnswer',
      length: ctx.dynamicModelAnswer.length,
    });
  } catch (err) {
    logger.error('Model answer generation failed (non-fatal)', { evaluationId, error: String(err) });
    // Non-fatal — fall back to null (UI will show static model answer)
    ctx.dynamicModelAnswer = null;
  }
}
