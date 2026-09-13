/**
 * mini-swe-agent.ts — mini-SWE-agent integration for focused investigation.
 *
 * mini-SWE-agent is the SECONDARY focused investigator. It takes specific
 * claims flagged by OpenHands and investigates ONLY those claims — not a
 * full re-evaluation.
 *
 * Repository: https://github.com/All-Hands-AI/mini-swe-agent
 * (The actively maintained lightweight SWE-agent from All-Hands-AI)
 *
 * Integration approach:
 *  - When mini-SWE-agent Python package is available in sandbox: invoke natively.
 *  - Fallback: targeted Claude-powered investigation (same structured output).
 *
 * Each claim from OpenHands becomes one focused mini-SWE-agent task:
 *  "OpenHands flagged: [claim]. Investigate: is it implemented, where, does it work,
 *   what's missing, is there test coverage? Cite specific files/functions."
 */

import { callLlmWithFallback } from '../llm/llm-provider.js';
import { CLAUDE_MODEL_SWE_AGENT, SWE_AGENT_MAX_ITERATIONS } from '../config.js';
import { runCommandInSandbox, readFileFromSandbox } from '../sandbox/e2b-sandbox.js';
import { logger } from '../logger.js';
import type { OpenHandsFinding, SweAgentFinding } from '../pipeline-context.js';

// ── Public API ─────────────────────────────────────────────────────────────────

export async function investigateClaim(params: {
  claim:           OpenHandsFinding;
  sandboxId:       string;
  sandboxRepoPath: string;
  evaluationId:    string;
  claimIndex:      number;
}): Promise<SweAgentFinding> {
  const { claim, sandboxId, sandboxRepoPath, evaluationId, claimIndex } = params;

  logger.info(`mini-SWE-agent investigating claim ${claimIndex + 1}`, {
    evaluationId,
    stage: 'sweAgent',
    claim: claim.claim.slice(0, 80),
  });

  // Check if mini-SWE-agent is available in the sandbox
  const agentCheck = await runCommandInSandbox(
    sandboxId,
    'python3 -c "import mini_swe_agent; print(\'available\')" 2>&1',
    10_000
  );

  if (agentCheck.stdout.includes('available')) {
    logger.info('mini-SWE-agent found — using native integration', { evaluationId });
    return investigateWithMiniSweAgent(params);
  }

  // Claude-powered fallback
  logger.info('mini-SWE-agent not in sandbox — using Claude targeted investigation', { evaluationId });
  return investigateWithClaude(params);
}

// ── Native mini-SWE-agent invocation ──────────────────────────────────────────
async function investigateWithMiniSweAgent(params: {
  claim:           OpenHandsFinding;
  sandboxId:       string;
  sandboxRepoPath: string;
  evaluationId:    string;
}): Promise<SweAgentFinding> {
  const { claim, sandboxId, sandboxRepoPath, evaluationId } = params;

  const task = buildInvestigationTask(claim);
  const agentScript = `
import json
import sys
from mini_swe_agent import Agent

agent = Agent(
    model="${CLAUDE_MODEL_SWE_AGENT}",
    max_iterations=${SWE_AGENT_MAX_ITERATIONS},
    repo_path="${sandboxRepoPath}",
    read_only=True
)

result = agent.run(task="""${task.replace(/"/g, '\\"')}""")
finding = {
    "originalClaim": "${claim.claim.replace(/"/g, '\\"')}",
    "verdict": result.verdict if hasattr(result, 'verdict') else "partially_confirmed",
    "fileEvidence": result.evidence if hasattr(result, 'evidence') else [],
    "conclusion": str(result.conclusion if hasattr(result, 'conclusion') else result)
}
print("FINDING_JSON:" + json.dumps(finding))
`.trim();

  const result = await runCommandInSandbox(
    sandboxId,
    `cd "${sandboxRepoPath}" && python3 -c "${agentScript.replace(/\n/g, '; ')}" 2>&1`,
    5 * 60_000 // 5 min per claim
  );

  // Extract the JSON output
  const jsonLine = result.stdout.split('\n').find(l => l.startsWith('FINDING_JSON:'));
  if (jsonLine) {
    try {
      const parsed = JSON.parse(jsonLine.replace('FINDING_JSON:', ''));
      return {
        originalClaim: String(parsed.originalClaim),
        verdict:       parsed.verdict ?? 'partially_confirmed',
        fileEvidence:  Array.isArray(parsed.fileEvidence) ? parsed.fileEvidence : [],
        conclusion:    String(parsed.conclusion ?? ''),
      };
    } catch { /* fall through to Claude */ }
  }

  // If native parsing failed, use Claude to structure the output
  return investigateWithClaude(params);
}

// ── Claude targeted investigation fallback ────────────────────────────────────
async function investigateWithClaude(params: {
  claim:           OpenHandsFinding;
  sandboxId:       string;
  sandboxRepoPath: string;
  evaluationId:    string;
}): Promise<SweAgentFinding> {
  const { claim, sandboxId, sandboxRepoPath, evaluationId } = params;

  // First: gather targeted file evidence using grep/find
  const fileEvidence = await gatherFileEvidence(claim, sandboxId, sandboxRepoPath);

  // Build context from the relevant files
  const evidenceContext = fileEvidence.map(fe =>
    `File: ${fe.file}\n${fe.snippet ?? '(Could not read file)'}`
  ).join('\n\n---\n\n');

  const task = buildInvestigationTask(claim);

  const systemPrompt = `You are a focused code investigator. You investigate specific technical claims 
about a software repository. Examine only the files relevant to the claim and produce precise, 
evidence-backed findings with file and function references. Be specific and cite actual code.
Respond with raw JSON only (no markdown).`;

  const userMessage = `${task}

## Evidence from repository (files found via targeted search):
${evidenceContext || '(No relevant files found via automated search)'}

Investigate the claim carefully based on the evidence above.
Output your finding as JSON with this exact structure:
{
  "originalClaim": "${claim.claim}",
  "verdict": "confirmed|partially_confirmed|not_found|already_implemented",
  "fileEvidence": [
    {
      "file": "path/to/file.py",
      "function": "function_name (if applicable)",
      "lineRange": "L10-L25 (if applicable)",
      "snippet": "relevant code snippet"
    }
  ],
  "conclusion": "1-2 sentences: what IS implemented, what is MISSING, and why this matters"
}`;

  let fullResponse = '';
  let gaveUp = false;

  try {
    const res = await callLlmWithFallback({
      taskName: 'swe-agent-investigation',
      taskType: 'scoring',
      systemPrompt,
      userPrompt: userMessage,
      temperature: 0.1,
      maxTokens: 2000,
      responseFormat: 'json_object',
    });
    fullResponse = res.rawText;
  } catch (err) {
    gaveUp = true;
    logger.warn('mini-SWE-agent all models failed', { evaluationId, error: String(err) });
  }

  logger.info(`mini-SWE-agent claim investigated (gaveUp=${gaveUp})`, { evaluationId, stage: 'sweAgent' });
  return parseSweAgentOutput(fullResponse, claim.claim, gaveUp);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildInvestigationTask(claim: OpenHandsFinding): string {
  const fileHint = claim.filePaths.length > 0
    ? `Relevant files flagged: ${claim.filePaths.join(', ')}.`
    : '';

  return `OpenHands flagged this issue: "${claim.claim}". ${fileHint}

Investigate this specific claim ONLY. Answer:
1. Is it implemented? Where? (file, function, line range)
2. Does the implementation work correctly based on the code?
3. What is missing or broken, if anything?
4. Is there test coverage for this feature?
5. Cite specific files and functions as evidence.

Do NOT re-evaluate the entire project — focus only on this claim.`;
}

async function gatherFileEvidence(
  claim:           OpenHandsFinding,
  sandboxId:       string,
  sandboxRepoPath: string
): Promise<Array<{ file: string; snippet?: string }>> {
  const evidence: Array<{ file: string; snippet?: string }> = [];

  // Search for keywords from the claim
  const keywords = claim.claim
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !['that', 'this', 'with', 'from', 'have', 'been', 'appears', 'incomplete'].includes(w))
    .slice(0, 3);

  // Also use explicitly flagged file paths
  for (const filePath of claim.filePaths.slice(0, 3)) {
    const content = await readFileFromSandbox(sandboxId, filePath);
    if (content) {
      evidence.push({ file: filePath, snippet: content.slice(0, 800) });
    }
  }

  // Grep for keywords
  if (keywords.length > 0 && evidence.length < 3) {
    const grepPattern = keywords.join('\\|');
    const grepResult = await runCommandInSandbox(
      sandboxId,
      `grep -rnI "${grepPattern}" "${sandboxRepoPath}" --exclude-dir=".git" --exclude-dir="node_modules" 2>/dev/null | head -5 || true`,
      10_000
    );
    if (grepResult.stdout) {
      for (const line of grepResult.stdout.trim().split('\n').filter(Boolean).slice(0, 3)) {
        const parts = line.split(':');
        if (parts[0]) {
          evidence.push({ file: parts[0], snippet: line.slice(0, 500) });
        }
      }
    }
  }

  return evidence;
}

function parseSweAgentOutput(rawOutput: string, originalClaim: string, gaveUp: boolean = false): SweAgentFinding {
  const jsonMatch = rawOutput.match(/\{[\s\S]*"verdict"[\s\S]*"conclusion"[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      originalClaim,
      verdict:      'partially_confirmed',
      fileEvidence: [],
      conclusion:   rawOutput.slice(0, 500) || 'Investigation inconclusive — could not parse structured output.',
      gaveUp,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const validVerdicts = ['confirmed', 'partially_confirmed', 'not_found', 'already_implemented'];
    return {
      originalClaim: String(parsed.originalClaim ?? originalClaim),
      verdict:       validVerdicts.includes(parsed.verdict) ? parsed.verdict : 'partially_confirmed',
      fileEvidence:  Array.isArray(parsed.fileEvidence) ? parsed.fileEvidence : [],
      conclusion:    String(parsed.conclusion ?? ''),
      gaveUp,
    };
  } catch {
    return {
      originalClaim,
      verdict:      'partially_confirmed',
      fileEvidence: [],
      conclusion:   rawOutput.slice(0, 500),
    };
  }
}
