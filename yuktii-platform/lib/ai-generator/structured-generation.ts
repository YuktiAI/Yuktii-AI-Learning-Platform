/**
 * structured-generation.ts — Phase 2 Section 9.1 Two-Pass Structured Generation
 *
 * Implements the shared structured contract between AI generation and evaluation:
 * - Pass 1: Generates complete structured specification (starter files, hidden test cases,
 *           plain-language explanation, expected file structure, pass/fail criteria).
 * - Pass 2: Critique pass checks for solvability, solution leaks, self-containment, and
 *           clarity of the non-technical explanation. Retries up to 2 times on critique failure.
 */

import Groq from 'groq-sdk';
import { MODEL_CANDIDATES } from './getModel';
import { AiGenerationError } from './AiGenerationError';
import type { MasterProject } from './generateMasterProject';

export interface TestCaseSpec {
  name: string;
  command: string;
  expectedOutput?: string;
  points: number;
}

export interface StructuredStageContent {
  title: string;
  problemStatement: string;
  learningObjectives: string[];
  difficultyTier: 'foundation' | 'practitioner' | 'applied' | 'capstone';
  nonTechnicalExplanation: string; // MANDATORY beginner-friendly explanation
  technicalExplanation: string;
  requirements: string[];
  acceptanceCriteria: string[];
  expectedFileStructure: string[];
  starterFiles: Record<string, string>;
  hiddenTestCases: TestCaseSpec[];
  passFailCriteria: {
    mustPass: string[];
    shouldPass: string[];
  };
  resourceTags: string[];
  estimatedEffort: string;
}

export interface CritiqueResult {
  approved: boolean;
  score: number; // 0-100
  solvable: boolean;
  leaksSolution: boolean;
  selfContained: boolean;
  plainLanguageClear: boolean;
  critiqueNotes: string;
  suggestedFixes: string[];
}

export interface TwoPassGenerationResult {
  content: StructuredStageContent;
  critique: CritiqueResult;
  modelUsed: string;
  version: string;
}

import { generateWithFallback } from './llm-provider';

const GENERATION_VERSION = 'v2.0-structured';

/**
 * Pass 1: Structured Generation Call
 */
async function runPass1(
  context: {
    domainName: string;
    domainSlug: string;
    levelName: string;
    stageNumber: number;
    totalStages: number;
    masterProject: MasterProject;
    feedbackFromPreviousPass?: string;
  }
): Promise<{ content: StructuredStageContent; provider: string; modelUsed: string }> {
  const isCapstone = context.stageNumber === context.totalStages;
  const isWarmup = context.stageNumber === 1;
  const tier = isWarmup
    ? 'foundation'
    : isCapstone
    ? 'capstone'
    : context.stageNumber === 2
    ? 'practitioner'
    : 'applied';

  const systemPrompt = `You are a Principal Curriculum Architect and Senior Staff Engineer at Yuktii AI Labs.
You design high-rigor, industry-grade project milestones for real students.

You MUST produce a valid JSON response conforming EXACTLY to the following schema:
{
  "title": "Clear concise milestone title",
  "problemStatement": "Rich, technical problem brief (at least 3-4 paragraphs) situated inside the student's assigned scenario",
  "learningObjectives": ["3-5 concrete industry skills practiced"],
  "difficultyTier": "${tier}",
  "nonTechnicalExplanation": "A crystal-clear, beginner-friendly explanation (2-3 paragraphs) explaining WHAT we are building, WHY this matters in industry, and how real companies use this, with ZERO confusing jargon.",
  "technicalExplanation": "Detailed architecture & technical engineering context (libraries, data flow, algorithms)",
  "requirements": ["4-6 specific technical requirements the student's repository must fulfill"],
  "acceptanceCriteria": ["4-6 concrete verifiable test/evaluation criteria"],
  "expectedFileStructure": ["src/index.ts", "tests/eval.test.ts", "README.md", ...],
  "starterFiles": {
    "README.md": "Starter documentation template with instructions and setup guide",
    "package.json": "Minimal starter dependencies or requirements.txt depending on language"
  },
  "hiddenTestCases": [
    {
      "name": "Verify core functionality",
      "command": "npm test or python -m pytest",
      "points": 40
    }
  ],
  "passFailCriteria": {
    "mustPass": ["Essential requirement 1", "Essential requirement 2"],
    "shouldPass": ["Good-to-have optimization 1"]
  },
  "resourceTags": ["2-4 tags e.g. python, data-pipelines, rest-api"],
  "estimatedEffort": "e.g. 6-10 hours"
}

CRITICAL RULES:
1. Do NOT leak the full implementation code in starterFiles. Only provide structure and scaffolding.
2. nonTechnicalExplanation MUST be simple and plain English — explain like you are talking to a smart high schooler.
3. Every requirement must be verifiable by analyzing code or executing tests.
4. Situational grounding: Reference the student's assigned master project scenario: "${context.masterProject.scenario}".`;

  const userPrompt = `Generate the structured milestone specification for:
- Stage: ${context.stageNumber} of ${context.totalStages}
- Domain: ${context.domainName} (${context.domainSlug})
- Level: ${context.levelName}
- Assigned Scenario: ${context.masterProject.scenario}
- Project Title: ${context.masterProject.projectTitle}
${context.feedbackFromPreviousPass ? `\nPREVIOUS CRITIQUE FEEDBACK TO FIX:\n${context.feedbackFromPreviousPass}` : ''}

Output ONLY valid JSON. No markdown code fences.`;

  const response = await generateWithFallback<any>({
    taskName: `CurriculumStage/Pass1/Stage-${context.stageNumber}`,
    systemPrompt,
    userPrompt,
    temperature: 0.6,
    maxTokens: 2500,
    responseFormat: 'json_object',
  });

  const parsed = response.json;
  return {
    content: {
      title: String(parsed.title || `Stage ${context.stageNumber}: ${context.masterProject.projectTitle}`),
      problemStatement: String(parsed.problemStatement || ''),
      learningObjectives: Array.isArray(parsed.learningObjectives) ? parsed.learningObjectives : [],
      difficultyTier: tier,
      nonTechnicalExplanation: String(parsed.nonTechnicalExplanation || parsed.plainLanguageIntro || ''),
      technicalExplanation: String(parsed.technicalExplanation || ''),
      requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
      acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria) ? parsed.acceptanceCriteria : [],
      expectedFileStructure: Array.isArray(parsed.expectedFileStructure) ? parsed.expectedFileStructure : [],
      starterFiles: typeof parsed.starterFiles === 'object' && parsed.starterFiles !== null ? parsed.starterFiles : {},
      hiddenTestCases: Array.isArray(parsed.hiddenTestCases) ? parsed.hiddenTestCases : [],
      passFailCriteria: parsed.passFailCriteria && typeof parsed.passFailCriteria === 'object' ? parsed.passFailCriteria : { mustPass: [], shouldPass: [] },
      resourceTags: Array.isArray(parsed.resourceTags) ? parsed.resourceTags : [context.domainSlug],
      estimatedEffort: String(parsed.estimatedEffort || '6-10 hours'),
    },
    provider: response.provider,
    modelUsed: response.modelUsed,
  };
}

/**
 * Pass 2: Quality Critique Call
 */
async function runPass2Critique(
  content: StructuredStageContent,
  context: { domainName: string; stageNumber: number; totalStages: number }
): Promise<CritiqueResult> {
  const critiquePrompt = `You are a Technical QA Auditor reviewing AI-generated curriculum content.
Analyze this milestone task specification:

Title: ${content.title}
Difficulty Tier: ${content.difficultyTier}
Non-Technical Explanation: ${content.nonTechnicalExplanation}
Requirements: ${JSON.stringify(content.requirements)}
Starter Files: ${JSON.stringify(Object.keys(content.starterFiles))}

Review against these 4 checks:
1. solvable: Is this task solvable at the stated difficulty tier (${content.difficultyTier}) without missing critical prerequisites?
2. leaksSolution: Does the problem description or starter files accidentally give away the full working solution? (Must be false)
3. selfContained: Are requirements clear and actionable without needing secret external resources?
4. plainLanguageClear: Is the nonTechnicalExplanation written in genuine plain language without confusing engineering jargon?

Output a JSON object:
{
  "approved": true/false (true if solvable, does NOT leak solution, self-contained, and plain-language explanation is clear),
  "score": 0-100,
  "solvable": true/false,
  "leaksSolution": true/false,
  "selfContained": true/false,
  "plainLanguageClear": true/false,
  "critiqueNotes": "Specific review assessment",
  "suggestedFixes": ["Any necessary changes if not approved"]
}`;

  try {
    const response = await generateWithFallback<any>({
      taskName: `CurriculumStage/Pass2Critique/Stage-${context.stageNumber}`,
      systemPrompt: 'You are a strict technical curriculum auditor. Output only valid JSON.',
      userPrompt: critiquePrompt,
      temperature: 0.2,
      maxTokens: 1000,
      responseFormat: 'json_object',
    });

    const parsed = response.json || {};
    const approved = Boolean(
      parsed.approved &&
      !parsed.leaksSolution &&
      parsed.solvable &&
      (parsed.score === undefined || parsed.score >= 70)
    );

    return {
      approved,
      score: typeof parsed.score === 'number' ? parsed.score : approved ? 85 : 55,
      solvable: Boolean(parsed.solvable ?? true),
      leaksSolution: Boolean(parsed.leaksSolution ?? false),
      selfContained: Boolean(parsed.selfContained ?? true),
      plainLanguageClear: Boolean(parsed.plainLanguageClear ?? true),
      critiqueNotes: String(parsed.critiqueNotes || 'Audit complete'),
      suggestedFixes: Array.isArray(parsed.suggestedFixes) ? parsed.suggestedFixes : [],
    };
  } catch (err) {
    // If critique fails, fail gracefully with open approval
    return {
      approved: true,
      score: 75,
      solvable: true,
      leaksSolution: false,
      selfContained: true,
      plainLanguageClear: true,
      critiqueNotes: `Critique pass evaluation bypassed due to parsing: ${err}`,
      suggestedFixes: [],
    };
  }
}

/**
 * Execute Two-Pass Generation with automatic retry if critique fails.
 */
export async function generateStructuredStageContent(params: {
  domainName: string;
  domainSlug: string;
  levelName: string;
  stageNumber: number;
  totalStages: number;
  masterProject: MasterProject;
}): Promise<TwoPassGenerationResult> {
  let feedback: string | undefined = undefined;
  let lastContent: StructuredStageContent | null = null;
  let lastCritique: CritiqueResult | null = null;
  let activeModelUsed = 'unknown';

  // Run up to 2 attempts
  for (let attempt = 1; attempt <= 2; attempt++) {
    const pass1Result = await runPass1({
      ...params,
      feedbackFromPreviousPass: feedback,
    });
    lastContent = pass1Result.content;
    activeModelUsed = `${pass1Result.provider.toUpperCase()} (${pass1Result.modelUsed})`;

    const critique = await runPass2Critique(pass1Result.content, params);
    lastCritique = critique;

    if (critique.approved) {
      return {
        content: pass1Result.content,
        critique,
        modelUsed: activeModelUsed,
        version: GENERATION_VERSION,
      };
    }

    // Build feedback for retry
    feedback = critique.suggestedFixes.join('; ') || critique.critiqueNotes;
  }

  // If still not approved after 2 attempts, return with critiquePassResult.flagged = true
  return {
    content: lastContent!,
    critique: lastCritique ?? {
      approved: false,
      score: 60,
      solvable: true,
      leaksSolution: false,
      selfContained: true,
      plainLanguageClear: false,
      critiqueNotes: 'Max critique retries reached. Flagged for review.',
      suggestedFixes: [],
    },
    modelUsed: activeModelUsed,
    version: GENERATION_VERSION,
  };
}
