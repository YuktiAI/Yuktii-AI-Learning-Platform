/**
 * Call 2 — Per-Stage Instruction Generation
 *
 * Called ONCE per enrollment+stage combination, when the student first reaches that stage.
 * The master project (locked scenario) is passed in — Groq MUST use it, not invent a new scenario.
 *
 * stageRole parameter controls framing:
 *   'warm_up'         — Stage 1: simple, low-stakes, references actual assigned project tools
 *   'applied'         — Middle stages: building real features on the project
 *   'industry_project'— Final stage: production-quality capstone with real-world framing
 *
 * Uses response_format: { type: "json_object" }.
 * Temperature 0.7 — creative enough for varied tasks, consistent enough to reference the same project.
 * On double failure: throws AiGenerationError — never falls back to a template.
 */
import Groq from 'groq-sdk';
import type { MasterProject } from './generateMasterProject';
import { AiGenerationError } from './AiGenerationError';
import { MODEL_CANDIDATES } from './getModel';
import { generateWithFallback } from './llm-provider';

export const STAGE_PROMPT_VERSION = 'stage-v2.0';

export type StageRole = 'warm_up' | 'applied' | 'industry_project';

export interface StageContentResult {
  problemStatement: string;    // Full, specific problem statement for this stage
  requirements: string[];      // 3-5 concrete, actionable requirements
  resourceTags: string[];      // 2-4 short tags: ["retail-timeseries", "customer-churn"]
  acceptanceCriteria: string[];// 4-6 measurable pass/fail criteria
  estimatedEffort: string;     // e.g. "8-12 hours"
}

const REQUIRED_STAGE_FIELDS = ['problemStatement', 'requirements', 'resourceTags', 'acceptanceCriteria'] as const;

function validateStageContent(raw: unknown): StageContentResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Groq response is not a JSON object');
  }
  const obj = raw as Record<string, unknown>;

  for (const field of REQUIRED_STAGE_FIELDS) {
    if (!obj[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (typeof obj.problemStatement !== 'string' || obj.problemStatement.trim().length < 20) {
    throw new Error('problemStatement is too short or invalid');
  }

  if (!Array.isArray(obj.requirements) || obj.requirements.length < 2) {
    throw new Error('requirements must be an array with at least 2 items');
  }

  if (!Array.isArray(obj.resourceTags) || obj.resourceTags.length < 1) {
    throw new Error('resourceTags must be an array');
  }

  if (!Array.isArray(obj.acceptanceCriteria) || obj.acceptanceCriteria.length < 3) {
    throw new Error('acceptanceCriteria must be an array with at least 3 items');
  }

  return {
    problemStatement:   (obj.problemStatement as string).trim(),
    requirements:       (obj.requirements as string[]).map(r => String(r).trim()),
    resourceTags:       (obj.resourceTags as string[]).map(t => String(t).trim().toLowerCase()),
    acceptanceCriteria: (obj.acceptanceCriteria as string[]).map(c => String(c).trim()),
    estimatedEffort:    typeof obj.estimatedEffort === 'string' ? obj.estimatedEffort.trim() : '6-10 hours',
  };
}

// ── Role-specific framing blocks ─────────────────────────────────────────────

function buildRoleFramingBlock(role: StageRole, master: MasterProject): string {
  const projectSpecifics = buildProjectSpecificsNote(master);

  switch (role) {
    case 'warm_up':
      return [
        `STAGE ROLE: WARM-UP (Stage 1 — student's FIRST contact with this project)`,
        ``,
        `WARM-UP FRAMING REQUIREMENTS — MANDATORY:`,
        `- This is the student's first exposure to the tools/components/APIs for this specific project.`,
        `- The problemStatement MUST explicitly name the actual assigned project and its tools:`,
        `  ${projectSpecifics}`,
        `- Keep tasks SIMPLE and LOW-STAKES: one small, guided exercise that lets the student "glance the modules".`,
        `- The goal is: student installs/accesses the tools, runs one minimal working example, and understands the shape of the full project ahead.`,
        `- DO NOT ask for production-quality deliverables. A working hello-world-level exercise using the actual project's tools is the target.`,
        `- The problem statement should feel like: "Get familiar with X by doing Y — you'll use this throughout the entire project."`,
        `- estimatedEffort should be LOW: 2-4 hours is appropriate for a warm-up.`,
      ].join('\n');

    case 'applied':
      return [
        `STAGE ROLE: APPLIED (intermediate stage — student is actively building the project)`,
        ``,
        `APPLIED FRAMING REQUIREMENTS:`,
        `- The student has completed the warm-up and is now building real features on their assigned project.`,
        `- Reference the SAME project scenario — don't drift to a different problem.`,
        `- Tasks should be more challenging than Stage 1 but scoped to this stage's learning objectives.`,
        `- Reference specific intermediate deliverables (a working model segment, a configured module piece, a pipeline stage).`,
        `- estimatedEffort should reflect real work: 6-12 hours depending on complexity.`,
      ].join('\n');

    case 'industry_project':
      return [
        `STAGE ROLE: INDUSTRY PROJECT (FINAL STAGE — production-quality capstone deliverable)`,
        ``,
        `INDUSTRY PROJECT FRAMING REQUIREMENTS — MANDATORY:`,
        `- This is the student's FINAL deliverable. Frame it EXPLICITLY as an industry-grade project submission.`,
        `- The problemStatement must read like a brief from a real employer or client — not a classroom exercise.`,
        `- Reference REAL-WORLD CONSTRAINTS: production considerations, edge cases, performance expectations,`,
        `  documentation standards, maintainability, and error handling that a real team would require.`,
        `- Acceptance criteria should mirror what a professional deliverable review or code review would check for:`,
        `  clean code, README that enables someone else to run the project, evidence of testing, documented tradeoffs.`,
        `- The student should be building the FULL, realistic, production-flavored version of their assigned scenario.`,
        `- estimatedEffort should reflect serious capstone work: 15-25 hours is appropriate.`,
        `- Avoid "more of the same" — explicitly escalate scope, polish, and real-world relevance from previous stages.`,
      ].join('\n');
  }
}

function buildProjectSpecificsNote(master: MasterProject): string {
  if (master.components && master.components.length > 0) {
    // IoT: name the actual components
    const sim = master.simulatorUrl ? ` (simulator: ${master.simulatorUrl})` : '';
    return `Components: ${master.components.join(', ')}${sim}. Project: ${master.projectTitle}`;
  }
  if (master.moduleName) {
    // Odoo: name the actual module
    return `Odoo Module: ${master.moduleName}. Process: ${master.processFocus ?? 'as defined'}. Project: ${master.projectTitle}`;
  }
  // Category A: business scenario
  return `Scenario: ${master.scenario}. Project: ${master.projectTitle}`;
}

// ── Main prompt builder ───────────────────────────────────────────────────────

function buildStagePrompt(
  master: MasterProject,
  stageNumber: number,
  totalStages: number,
  stageRole: StageRole,
  learningObjectives: string,
  iotMode?: string | null,
): { system: string; user: string } {
  const roleBlock = buildRoleFramingBlock(stageRole, master);
  const roleLabel = {
    warm_up:          'WARM-UP (Stage 1 — first contact)',
    applied:          'APPLIED (intermediate — building real features)',
    industry_project: 'INDUSTRY PROJECT (final stage — production capstone)',
  }[stageRole];

  // Build extra context lines for domain-specific project types
  const domainContextLines: string[] = [];
  if (master.components && master.components.length > 0) {
    domainContextLines.push(`  Hardware/Simulator Components: ${master.components.join(', ')}`);
    if (master.simulatorUrl) domainContextLines.push(`  Approved Simulator URL: ${master.simulatorUrl}`);
    if (iotMode === 'hardware') {
      domainContextLines.push(`  Student IoT Mode: HARDWARE — Student is sourcing physical components. List components clearly. Remind student to follow low-voltage safety practices.`);
    } else if (iotMode === 'simulation') {
      domainContextLines.push(`  Student IoT Mode: SOFTWARE SIMULATION — Direct student to build and run the circuit in approved online simulator (Wokwi/Tinkercad Circuits/Proteus).`);
    }
    if (stageRole === 'industry_project') {
      domainContextLines.push(`  IoT FINAL SUBMISSION REQUIREMENTS (Mandatory 4 parts):`);
      domainContextLines.push(`    1. Circuit design documentation (schematic diagram or simulator screenshot).`);
      domainContextLines.push(`    2. Written component choice rationale explaining why each component was chosen.`);
      domainContextLines.push(`    3. Working-model video demo (suggested length: 3-7 minutes) showing component breakdown & working model.`);
      domainContextLines.push(`    4. Google Drive video link with public visibility submitted as URL.`);
    }
  }
  if (master.moduleName) {
    domainContextLines.push(`  Odoo Module: ${master.moduleName}`);
    domainContextLines.push(`  Process Focus: ${master.processFocus}`);
  }

  return {
    system: [
      `You are generating stage-specific project instructions for a student's ongoing internship project.`,
      ``,
      `THE OVERALL PROJECT IS FIXED — DO NOT CHANGE IT:`,
      `  Project Title: ${master.projectTitle}`,
      `  Scenario: ${master.scenario}`,
      `  Business Context: ${master.businessContext}`,
      ...domainContextLines,
      ``,
      `You are ONLY generating the task for Stage ${stageNumber} of ${totalStages} (role: ${roleLabel}).`,
      `Stage learning objectives: ${learningObjectives}`,
      ``,
      `── STAGE ROLE FRAMING ──────────────────────────────────────────────────────`,
      roleBlock,
      `──────────────────────────────────────────────────────────────────────────────`,
      ``,
      `GENERAL RULES:`,
      `- The problemStatement MUST reference the same project scenario above — mention the business and situation.`,
      `- requirements must be concrete and specific to this stage's difficulty level.`,
      `- resourceTags: provide 2-4 short hyphenated tags describing what type of dataset/documentation this stage needs`,
      `  (e.g. "retail-timeseries", "odoo-inventory-docs", "iot-sensor-data", "esp32-docs").`,
      `  These tags are matched against a curated library — DO NOT invent URLs.`,
      `- Never use emojis.`,
      `- Respond ONLY with valid JSON — no markdown, no code fences.`,
    ].join('\n'),
    user: [
      `Generate the Stage ${stageNumber} task (${stageRole} role) for this project.`,
      `Return a JSON object with exactly these fields:`,
      `{`,
      `  "problemStatement": "2-4 sentences describing the specific task for this stage, referencing the business scenario and stage role framing above",`,
      `  "requirements": ["specific actionable requirement 1", "requirement 2", "requirement 3", "requirement 4"],`,
      `  "resourceTags": ["tag1", "tag2", "tag3"],`,
      `  "acceptanceCriteria": ["measurable criterion 1", "criterion 2", "criterion 3", "criterion 4", "criterion 5"],`,
      `  "estimatedEffort": "X-Y hours"`,
      `}`,
    ].join('\n'),
  };
}

export async function generateStageContentFromGroq(
  master: MasterProject,
  stageNumber: number,
  totalStages: number,
  stageRole: StageRole,
  learningObjectives: string,
  iotMode?: string | null,
): Promise<StageContentResult> {
  const { system, user } = buildStagePrompt(master, stageNumber, totalStages, stageRole, learningObjectives, iotMode);

  const result = await generateWithFallback({
    taskName: `StageContent/${stageRole}/Stage-${stageNumber}`,
    systemPrompt: system,
    userPrompt: user,
    temperature: 0.7,
    maxTokens: 1800,
    responseFormat: 'json_object',
  });

  return validateStageContent(result.json);
}

/**
 * Determine stage role from stage number and total stage count.
 * Stage 1 = warm_up, last stage = industry_project, everything in between = applied.
 */
export function getStageRole(stageNumber: number, totalStages: number): StageRole {
  if (stageNumber === 1) return 'warm_up';
  if (stageNumber >= totalStages && totalStages > 1) return 'industry_project';
  return 'applied';
}

// Backward-compat alias
export { getStageRole as getStageType };
export type { StageRole as StageType };
