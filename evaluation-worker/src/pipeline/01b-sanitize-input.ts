/**
 * 01b-sanitize-input.ts — Section 9.5 Prompt Injection Defense
 *
 * Scans repository files (README, code comments, commit messages) and student inputs
 * for adversarial prompt injection patterns designed to hijack LLM evaluators.
 *
 * Actions:
 * - Detects injection vectors (DAN mode, override instructions, simulated system prompts).
 * - Neutralizes malicious text in context before sending to Anthropic/Groq.
 * - Flags evaluation for human review if active injection attempts are detected.
 */

import { runCommandInSandbox, readFileFromSandbox } from '../sandbox/e2b-sandbox.js';
import { logger } from '../logger.js';
import type { PipelineContext } from '../pipeline-context.js';

const INJECTION_PATTERNS: Array<{ name: string; regex: RegExp; severity: 'high' | 'medium' }> = [
  {
    name: 'ignore_instructions',
    regex: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
    severity: 'high',
  },
  {
    name: 'score_hijack',
    regex: /(give|award|assign)\s+(me\s+)?(full\s+marks|100(\/100)?|maximum\s+score|perfect\s+score)/i,
    severity: 'high',
  },
  {
    name: 'system_tag_simulation',
    regex: /(<\s*system\s*>|\[\s*system\s*\]|\[\s*system\s+override\s*\])/i,
    severity: 'high',
  },
  {
    name: 'roleplay_jailbreak',
    regex: /(you\s+are\s+now\s+in\s+DAN\s+mode|jailbreak|bypass\s+all\s+rules)/i,
    severity: 'high',
  },
  {
    name: 'rubric_override',
    regex: /(override\s+rubric|skip\s+evaluation|always\s+return\s+pass|mark\s+as\s+pass)/i,
    severity: 'high',
  },
  {
    name: 'eval_property_spoof',
    regex: /(aiEvalScore\s*:\s*100|finalScore\s*:\s*100|status\s*:\s*['"]completed['"])/i,
    severity: 'medium',
  },
];

/**
 * Sanitize a string by stripping or redacting known injection triggers.
 */
export function sanitizePromptText(input: string): string {
  if (!input) return '';
  let sanitized = input;
  for (const { regex } of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(regex, '[POTENTIAL INJECTION REMOVED]');
  }
  return sanitized;
}

/**
 * Run prompt injection audit across the sandbox repository.
 */
export async function sanitizeAndAuditInputs(ctx: PipelineContext): Promise<void> {
  const { evaluationId, sandboxId, sandboxRepoPath } = ctx;
  if (!sandboxId || !sandboxRepoPath) return;

  logger.info('Running prompt injection defense scan', { evaluationId, stage: 'sanitizeInput' });

  const flags: Array<{ pattern: string; location: string; snippet: string }> = [];

  // 1. Audit README
  const readme = await readFileFromSandbox(sandboxId, `${sandboxRepoPath}/README.md`)
    || await readFileFromSandbox(sandboxId, `${sandboxRepoPath}/readme.md`);

  if (readme) {
    for (const pattern of INJECTION_PATTERNS) {
      const match = readme.match(pattern.regex);
      if (match) {
        flags.push({
          pattern: pattern.name,
          location: 'README.md',
          snippet: match[0],
        });
      }
    }
  }

  // 2. Audit recent git commit messages
  const gitLogResult = await runCommandInSandbox(
    sandboxId,
    `git -C "${sandboxRepoPath}" log -n 10 --pretty=format:"%s" 2>/dev/null || true`,
    10_000
  );
  if (gitLogResult.stdout) {
    for (const pattern of INJECTION_PATTERNS) {
      const match = gitLogResult.stdout.match(pattern.regex);
      if (match) {
        flags.push({
          pattern: pattern.name,
          location: 'git commit log',
          snippet: match[0],
        });
      }
    }
  }

  // 3. Scan code comments using grep
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.severity === 'high') {
      const keyword = pattern.name === 'ignore_instructions'
        ? 'ignore.*instructions'
        : pattern.name === 'score_hijack'
        ? 'full marks\\|maximum score'
        : pattern.name === 'system_tag_simulation'
        ? '\\[SYSTEM\\]\\|<system>'
        : 'jailbreak';

      const grepRes = await runCommandInSandbox(
        sandboxId,
        `grep -rnI "${keyword}" "${sandboxRepoPath}" --exclude-dir=".git" --exclude-dir="node_modules" 2>/dev/null | head -5 || true`,
        10_000
      );

      if (grepRes.stdout.trim()) {
        flags.push({
          pattern: pattern.name,
          location: 'source code',
          snippet: grepRes.stdout.trim().slice(0, 150),
        });
      }
    }
  }

  if (flags.length > 0) {
    ctx.promptInjectionFlags.push(...flags);
    ctx.flaggedForHumanReview = true;
    ctx.humanReviewReason = 'prompt_injection_detected';
    logger.warn('Prompt injection patterns detected in submission', {
      evaluationId,
      flagCount: flags.length,
      patterns: flags.map(f => f.pattern),
    });
  } else {
    logger.info('Prompt injection scan clean — 0 vectors found', { evaluationId });
  }
}
