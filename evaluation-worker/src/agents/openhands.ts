/**
 * openhands.ts — OpenHands (All-Hands-AI/OpenHands) integration.
 *
 * OpenHands is the PRIMARY broad evaluator agent. It performs a wide
 * multi-file analysis of the repository: structure, code quality,
 * architecture, requirement completion, error handling, security.
 *
 * Integration approach:
 *  - OpenHands exposes a Python SDK and a REST API.
 *  - When running in E2B, we invoke OpenHands via its Python SDK inside
 *    the sandbox (it has access to the cloned repo files).
 *  - When running locally (dev), we invoke it via subprocess or use a
 *    simplified Claude-only fallback that mimics OpenHands' output format.
 *
 * OpenHands GitHub: https://github.com/All-Hands-AI/OpenHands
 *
 * IMPORTANT: OpenHands is instructed to READ and ANALYZE ONLY.
 * It must NOT modify the repository. The prompt explicitly states this.
 */

import { callLlmWithFallback } from '../llm/llm-provider.js';
import { OPENHANDS_MAX_ITERATIONS } from '../config.js';
import { runCommandInSandbox, readFileFromSandbox } from '../sandbox/e2b-sandbox.js';
import { logger } from '../logger.js';
import type { OpenHandsFinding, OpenHandsResult } from '../pipeline-context.js';

// ── OpenHands invocation ──────────────────────────────────────────────────────
// Phase 1 implementation: We use Claude directly with an OpenHands-style
// multi-turn agentic prompt. When your infrastructure is ready for full
// OpenHands deployment (Docker/E2B with OpenHands server), swap in the
// OpenHands Python SDK call below and remove the Claude fallback.

export async function runOpenHandsEvaluation(params: {
  sandboxId:        string;
  sandboxRepoPath:  string;
  projectSpec:      { problemStatement: string; requirements: string[]; acceptanceCriteria: string[] };
  deterministicSummary: string;
  domainSlug:       string;
  evaluationId:     string;
}): Promise<OpenHandsResult> {
  const { sandboxId, sandboxRepoPath, projectSpec, deterministicSummary, domainSlug, evaluationId } = params;

  logger.info('Starting OpenHands evaluation', { evaluationId, stage: 'openHands', domainSlug });

  // ── Step 1: Gather repository context for OpenHands ───────────────────────
  const repoContext = await gatherRepoContext(sandboxId, sandboxRepoPath, evaluationId);

  // ── Step 2: Run OpenHands via Python SDK in sandbox (preferred) ────────────
  // Check if OpenHands is available in the sandbox
  const ohCheck = await runCommandInSandbox(
    sandboxId,
    'python3 -c "import openhands; print(openhands.__version__)" 2>&1',
    15_000
  );

  if (ohCheck.exitCode === 0) {
    logger.info('OpenHands Python SDK found in sandbox — using native integration', { evaluationId });
    return runOpenHandsNative(params, repoContext);
  }

  // ── Step 3: Claude fallback (Phase 1) ─────────────────────────────────────
  // Full OpenHands-equivalent analysis via Claude's extended thinking mode.
  // Replace with native OpenHands SDK once infra is set up.
  logger.info('OpenHands SDK not in sandbox — using Claude agentic fallback', { evaluationId });
  return runOpenHandsViaClaude(projectSpec, repoContext, deterministicSummary, domainSlug, evaluationId);
}

// ── Repository context gathering ─────────────────────────────────────────────
async function gatherRepoContext(
  sandboxId:       string,
  sandboxRepoPath: string,
  evaluationId:    string
): Promise<string> {
  const sections: string[] = [];

  // File tree (top 2 levels)
  const treeResult = await runCommandInSandbox(
    sandboxId,
    `find "${sandboxRepoPath}" -maxdepth 3 -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/__pycache__/*" -not -path "*/.venv/*" | head -80 2>&1`,
    15_000
  );
  sections.push(`=== Repository File Tree ===\n${treeResult.stdout}`);

  // README content
  const readmeContent = await readFileFromSandbox(sandboxId, `${sandboxRepoPath}/README.md`)
    || await readFileFromSandbox(sandboxId, `${sandboxRepoPath}/readme.md`)
    || '(No README found)';
  sections.push(`=== README ===\n${readmeContent.slice(0, 3000)}`);

  // Key source files (up to 5, max 1500 chars each)
  const sourceFiles = await runCommandInSandbox(
    sandboxId,
    `find "${sandboxRepoPath}" -maxdepth 4 \\( -name "*.py" -o -name "*.js" -o -name "*.ts" -o -name "*.java" \\) -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/__pycache__/*" | grep -v test | head -5 2>&1`,
    10_000
  );

  for (const filePath of sourceFiles.stdout.trim().split('\n').filter(Boolean).slice(0, 5)) {
    const relPath = filePath.replace(sandboxRepoPath, '').replace(/^\//, '');
    const content = await readFileFromSandbox(sandboxId, filePath);
    if (content) {
      sections.push(`=== ${relPath} ===\n${content.slice(0, 1500)}`);
    }
  }

  // Dependencies file
  const reqFile = await readFileFromSandbox(sandboxId, `${sandboxRepoPath}/requirements.txt`)
    || await readFileFromSandbox(sandboxId, `${sandboxRepoPath}/package.json`)
    || await readFileFromSandbox(sandboxId, `${sandboxRepoPath}/pom.xml`)
    || '(No dependency file found)';
  sections.push(`=== Dependencies ===\n${reqFile.slice(0, 1000)}`);

  logger.debug('Repo context gathered', { evaluationId, sections: sections.length });
  return sections.join('\n\n');
}

// ── Native OpenHands SDK invocation ──────────────────────────────────────────
async function runOpenHandsNative(
  params:      any,
  repoContext: string
): Promise<OpenHandsResult> {
  const { sandboxId, sandboxRepoPath, projectSpec, evaluationId } = params;

  // Invoke OpenHands Python SDK inside the sandbox
  const ohScript = `
import json
import sys
from openhands.core.main import run_controller
from openhands.core.config import load_app_config

config = load_app_config()
task = """${buildOpenHandsPrompt(projectSpec, repoContext, params.deterministicSummary).replace(/"/g, '\\"')}"""

result = run_controller(config=config, task=task, headless_mode=True, max_iterations=${OPENHANDS_MAX_ITERATIONS})
print(json.dumps({"summary": str(result), "rawLog": ""}))
`.trim();

  const result = await runCommandInSandbox(
    sandboxId,
    `cd "${sandboxRepoPath}" && python3 -c "${ohScript.replace(/\n/g, '; ')}" 2>&1`,
    10 * 60 * 1000 // 10 min
  );

  try {
    const parsed = JSON.parse(result.stdout.trim().split('\n').pop() ?? '{}');
    return parseOpenHandsOutput(parsed.summary ?? '', evaluationId);
  } catch {
    return parseOpenHandsOutput(result.stdout, evaluationId);
  }
}

// ── Groq agentic fallback (Phase 1 implementation) ───────────────────────────
// Uses Groq (free, fast) instead of Anthropic to avoid credit requirements.
async function runOpenHandsViaClaude(
  projectSpec:          { problemStatement: string; requirements: string[]; acceptanceCriteria: string[] },
  repoContext:          string,
  deterministicSummary: string,
  domainSlug:           string,
  evaluationId:         string
): Promise<OpenHandsResult> {
  const prompt = buildOpenHandsPrompt(projectSpec, repoContext, deterministicSummary);

  const systemPrompt = `You are a senior technical evaluation agent. You analyze software repositories 
exhaustively and produce structured evaluation findings. You ONLY read and analyze — you never modify code.
Output a JSON object with this exact structure (no markdown, raw JSON only):
{
  "summary": "2-3 paragraph overall assessment",
  "flaggedIssues": [
    { "claim": "specific technical claim", "severity": "high|medium|low", "filePaths": ["relevant/file.py"] }
  ],
  "requirementAssessment": [
    { "requirement": "text", "status": "PASS|PARTIAL|FAIL", "evidence": "code evidence", "missing": "what is missing" }
  ],
  "qualitySignals": {
    "errorHandling": "assessment",
    "codeOrganization": "assessment",
    "documentation": "assessment",
    "securityPractices": "assessment",
    "testCoverage": "assessment"
  }
}`;

  const trajectory: Array<{ step: number; agent: string; action: string; summary: string; timestamp: string }> = [];

  try {
    logger.info('OpenHands: calling LLM for repository analysis', { evaluationId });

    const res = await callLlmWithFallback({
      taskName: 'openhands-analysis',
      taskType: 'cognitive',
      systemPrompt,
      userPrompt: prompt,
      temperature: 0.2,
      maxTokens: 4000,
      responseFormat: 'json_object',
    });
    const rawResponse = res.rawText;

    trajectory.push({
      step: 1,
      agent: `OpenHands-${res.provider.toUpperCase()}`,
      action: 'full_analysis',
      summary: rawResponse.slice(0, 200).replace(/\n/g, ' '),
      timestamp: new Date().toISOString(),
    });

    logger.info(`OpenHands analysis complete via ${res.provider} (${res.modelUsed})`, { evaluationId, stage: 'openHands' });
    return parseOpenHandsOutput(rawResponse, evaluationId, { gaveUp: false, trajectory });
  } catch (err) {
    logger.error('OpenHands Groq fallback failed', { evaluationId, error: String(err) });
    // Return a minimal valid result so the pipeline continues
    return {
      summary: 'Automated analysis could not complete due to API error. Scores based on deterministic checks.',
      flaggedIssues: [],
      rawLog: String(err),
      skipped: true,
      gaveUp: true,
      trajectory,
    };
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildOpenHandsPrompt(
  projectSpec:          { problemStatement: string; requirements: string[]; acceptanceCriteria: string[] },
  repoContext:          string,
  deterministicSummary: string
): string {
  const requirementsList = projectSpec.requirements
    .map((r, i) => `  REQ-${i + 1}: ${r}`)
    .join('\n');

  const criteriaList = projectSpec.acceptanceCriteria
    .map((c, i) => `  AC-${i + 1}: ${c}`)
    .join('\n');

  return `
You are evaluating a student's GitHub repository submission for a professional internship project.

## ORIGINAL PROJECT SPECIFICATION (do not alter this)

Problem Statement:
${projectSpec.problemStatement}

Requirements:
${requirementsList}

Acceptance Criteria:
${criteriaList}

## DETERMINISTIC CHECK RESULTS (already run)
${deterministicSummary}

## REPOSITORY CONTENTS
${repoContext}

## YOUR EVALUATION TASK

Analyze this repository against the specification above like a senior technical mentor.
Evaluate: repository structure, source code architecture, dependencies, configuration,
README/documentation, tests, implementation quality, functionality, requirement completion,
error handling, and basic security practices.

DO NOT modify any code. This is a read-only analysis.

For each requirement (REQ-1 through REQ-N), assess: implemented/partial/not implemented,
with specific file and function references as evidence.

Flag specific claims that need deeper investigation (e.g. "authentication appears incomplete —
no JWT verification found in auth.py") for the mini-SWE-agent to investigate.

Output your complete analysis as valid JSON matching the schema in your system prompt.
`.trim();
}

// ── Output parser ─────────────────────────────────────────────────────────────
function parseOpenHandsOutput(
  rawOutput: string,
  evaluationId: string,
  extra?: { gaveUp?: boolean; trajectory?: Array<{ step: number; agent: string; action: string; summary: string; timestamp: string }> }
): OpenHandsResult {
  // Extract JSON block from the response
  const jsonMatch = rawOutput.match(/\{[\s\S]*"flaggedIssues"[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn('Could not parse OpenHands JSON output — using summary extraction', { evaluationId });
    return {
      summary:       rawOutput.slice(0, 2000),
      flaggedIssues: extractFlaggedIssuesFromText(rawOutput),
      rawLog:        rawOutput.slice(0, 10_000),
      skipped:       false,
      gaveUp:        extra?.gaveUp ?? false,
      trajectory:    extra?.trajectory ?? [],
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const flaggedIssues: OpenHandsFinding[] = (parsed.flaggedIssues ?? []).map((f: any) => ({
      claim:     String(f.claim ?? ''),
      severity:  (f.severity ?? 'medium') as 'high' | 'medium' | 'low',
      filePaths: Array.isArray(f.filePaths) ? f.filePaths : [],
    }));

    return {
      summary:       String(parsed.summary ?? ''),
      flaggedIssues,
      rawLog:        rawOutput.slice(0, 10_000),
      skipped:       false,
      gaveUp:        extra?.gaveUp ?? false,
      trajectory:    extra?.trajectory ?? [],
    };
  } catch (err) {
    logger.warn('JSON parse error in OpenHands output', { evaluationId, error: String(err) });
    return {
      summary:       rawOutput.slice(0, 2000),
      flaggedIssues: extractFlaggedIssuesFromText(rawOutput),
      rawLog:        rawOutput.slice(0, 10_000),
      skipped:       false,
      gaveUp:        extra?.gaveUp ?? false,
      trajectory:    extra?.trajectory ?? [],
    };
  }
}

// Fallback: extract flagged issues from plain text using keyword patterns
function extractFlaggedIssuesFromText(text: string): OpenHandsFinding[] {
  const findings: OpenHandsFinding[] = [];
  const patterns = [
    /appears\s+(incomplete|missing|broken|not\s+implemented)[^.]*\./gi,
    /no\s+(authentication|validation|error\s+handling|tests?)[^.]*\./gi,
    /missing\s+[^.]+\./gi,
    /incomplete\s+[^.]+\./gi,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern) ?? [];
    for (const match of matches.slice(0, 3)) {
      if (match.length > 10 && match.length < 200) {
        findings.push({ claim: match.trim(), severity: 'medium', filePaths: [] });
      }
    }
  }

  return findings.slice(0, 5); // cap at 5 auto-extracted findings
}
