/**
 * Call 1 — Master Project Generation
 *
 * Called ONCE per enrollment, immediately after payment/enrollment confirmation.
 * Generates the LOCKED scenario that will be reused for every stage of the track.
 *
 * Domain-category branching:
 *   Category A — Business-scenario domains (AI/ML, Data Science, Data Analysis,
 *                Data Engineering, Full Stack Java/Python, LLM & Generative AI):
 *                Free-form scenario generation with anti-genericness rules.
 *   Category B — IoT: Groq SELECTS a curated IoTProjectBlueprint from DB.
 *                Components and simulator URL come from the curated table, not Groq.
 *   Category C — ERP/Odoo: Groq SELECTS a curated OdooModuleScenario from DB.
 *                Module name and process focus come from the curated table, not Groq.
 *
 * Uses response_format: { type: "json_object" } — Groq is forced to return structured JSON.
 * Temperature 0.9 — ensures high variety between students enrolled in the same track.
 * On double failure: throws AiGenerationError — never falls back to a template string.
 */
import Groq from 'groq-sdk';
import { AiGenerationError } from './AiGenerationError';
import { MODEL_CANDIDATES } from './getModel';
import { prisma } from '@/lib/prisma';
import { generateWithFallback } from './llm-provider';

export const MASTER_PROMPT_VERSION = 'master-v2.0';

// ── Domain → Category mapping ─────────────────────────────────────────────────

type DomainCategory = 'A' | 'B' | 'C' | 'D';

function getDomainCategory(domainSlug: string): DomainCategory {
  if (domainSlug === 'iot') return 'B';
  if (domainSlug === 'erp-odoo') return 'C';
  if (domainSlug === 'robotics') return 'D';
  return 'A';
}

/**
 * Maps track levelName to a difficulty tier used for blueprint/scenario lookup.
 * Foundation / Foundation+ → "foundation"
 * Practitioner / Applied Practitioner → "intermediate"
 * Capstone → "advanced"
 */
function levelToDifficulty(levelName: string): string {
  const upper = levelName.toUpperCase();
  if (upper === 'FOUNDATION' || upper === 'FOUNDATION_PLUS') return 'foundation';
  if (upper === 'CAPSTONE') return 'advanced';
  return 'intermediate'; // PRACTITIONER, APPLIED_PRACTITIONER
}

// ── MasterProject interface ───────────────────────────────────────────────────

export interface MasterProject {
  scenario: string;         // 15-25 word specific scenario / context
  domain: string;           // domain name for context
  businessContext: string;  // 2-3 sentence description of the situation
  resourceCategory: string; // short tag used to match ResourceLink records
  projectTitle: string;     // e.g. "Smart Irrigation System for Rooftop Farm Co-op"

  // Category B (IoT) — populated from curated blueprint
  blueprintId?: string;
  components?: string[];    // ["ESP32", "Soil Moisture Sensor", ...]
  simulatorUrl?: string;    // Wokwi link
  hardwareOptional?: boolean;

  // Category C (Odoo) — populated from curated scenario
  scenarioId?: string;
  moduleName?: string;      // "Sales" | "Inventory" | etc.
  processFocus?: string;    // "order-to-cash" | "stock replenishment" | etc.
}

// Required fields that must be non-empty strings
const REQUIRED_FIELDS: (keyof MasterProject)[] = [
  'scenario',
  'domain',
  'businessContext',
  'resourceCategory',
  'projectTitle',
];

function validateMasterProject(raw: unknown): Omit<MasterProject, 'blueprintId' | 'components' | 'simulatorUrl' | 'hardwareOptional' | 'scenarioId' | 'moduleName' | 'processFocus'> {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Groq response is not a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  for (const field of REQUIRED_FIELDS) {
    if (!obj[field] || typeof obj[field] !== 'string' || (obj[field] as string).trim().length < 3) {
      throw new Error(`Missing or empty required field: ${field}`);
    }
  }
  return {
    scenario:         (obj.scenario as string).trim(),
    domain:           (obj.domain as string).trim(),
    businessContext:  (obj.businessContext as string).trim(),
    resourceCategory: (obj.resourceCategory as string).trim().toLowerCase(),
    projectTitle:     (obj.projectTitle as string).trim(),
  };
}

// ── Category A — Business-Scenario prompt ────────────────────────────────────

const CATEGORY_A_BANNED_SCENARIOS = [
  'an e-commerce store', 'a bookstore', 'a to-do app', 'a social media platform',
  'a blog platform', 'a chat application', 'a library system', 'a school management system',
  'a bank', 'a generic bank', 'a hospital', 'a generic company', 'a startup',
];

// Industry diversity seed — rotated by Groq's own temperature, but listed here
// to prime the system prompt with variety examples
const INDUSTRY_DIVERSITY_EXAMPLES = [
  'a regional cold-chain logistics provider in Maharashtra',
  'a mid-size fisheries cooperative in Kerala',
  'a microfinance lender serving rural Rajasthan',
  'a pharmaceutical contract manufacturer in Hyderabad',
  'a tier-2 city cable internet provider expanding to fibre',
  'an agricultural commodity trading platform for south-east Asian markets',
  'a chain of diagnostic pathology labs in Tier-2/3 Indian cities',
  'a municipal water utility running predictive maintenance',
  'an edtech platform serving competitive exam prep (JEE/NEET/UPSC)',
  'a fleet management company running last-mile delivery in metro cities',
  'a B2B specialty chemicals distributor',
  'a cooperative dairy processing unit',
  'an insurance premium analytics team at a regional general insurer',
  'a renewable energy company monitoring solar farm output',
];

function buildCategoryAPrompt(domainName: string, trackLevel: string): { system: string; user: string } {
  return {
    system: [
      `You are generating a UNIQUE, realistic project scenario for a student's internship certificate in the ${domainName} domain at ${trackLevel} level.`,
      `This scenario will be the FOUNDATION for the ENTIRE track — every stage will build on this same project.`,
      `It must be specific and concrete enough to sustain multiple stages of increasing complexity.`,
      ``,
      `STRICT RULES:`,
      `- DO NOT use these overused placeholder businesses: ${CATEGORY_A_BANNED_SCENARIOS.join(', ')}.`,
      `- Name a SPECIFIC, plausible business type with region, scale, or niche qualifiers.`,
      `  Good examples: ${INDUSTRY_DIVERSITY_EXAMPLES.slice(0, 4).join('; ')}.`,
      `- The scenario must be industry-specific — not just "a company" or "a business".`,
      `- resourceCategory must be a short hyphenated tag describing the data/resource type,`,
      `  e.g. "retail-timeseries", "hospital-readmission", "fleet-gps", "microfinance-credit". Used to match our curated resource library.`,
      `- Never use emojis.`,
      `- Respond ONLY with valid JSON — no markdown, no code fences, no explanation.`,
    ].join('\n'),
    user: [
      `Generate a unique project scenario for a ${domainName} track at ${trackLevel} level.`,
      `Return a JSON object with exactly these fields:`,
      `{`,
      `  "scenario": "15-25 word specific business scenario with industry, region, and scale (e.g. 'Churn prediction for a regional cable internet provider expanding to fibre in tier-2 cities')",`,
      `  "domain": "${domainName}",`,
      `  "businessContext": "2-3 sentences describing the business situation, the data they have, and why this ${domainName} project matters to them",`,
      `  "resourceCategory": "short-hyphenated-tag matching the data/resource type needed",`,
      `  "projectTitle": "Concise project title (5-10 words)"`,
      `}`,
    ].join('\n'),
  };
}

// ── Category B — IoT blueprint selection + narrative prompt ───────────────────

async function buildCategoryBPrompt(
  domainName: string,
  trackLevel: string,
  difficulty: string,
): Promise<{ system: string; user: string; blueprint: { id: string; title: string; components: string[]; simulatorUrl: string | null; hardwareOptional: boolean } }> {
  // Select a random active blueprint matching the difficulty level
  const blueprints = await prisma.ioTProjectBlueprint.findMany({
    where: { difficultyLevel: difficulty, isActive: true },
  });

  if (blueprints.length === 0) {
    // Fallback: try any active blueprint
    const allBlueprints = await prisma.ioTProjectBlueprint.findMany({ where: { isActive: true } });
    if (allBlueprints.length === 0) {
      throw new AiGenerationError('master', 'No active IoTProjectBlueprint rows found in the database. Seed the curated blueprints first.');
    }
    blueprints.push(...allBlueprints);
  }

  const blueprint = blueprints[Math.floor(Math.random() * blueprints.length)];
  let components: string[] = [];
  try { components = JSON.parse(blueprint.components) as string[]; } catch { components = [blueprint.components]; }

  const componentList = components.join(', ');
  const simNote = blueprint.simulatorUrl
    ? `Simulator: ${blueprint.simulatorUrl}`
    : 'No simulator URL — must use physical hardware.';

  return {
    blueprint: {
      id:               blueprint.id,
      title:            blueprint.title,
      components,
      simulatorUrl:     blueprint.simulatorUrl,
      hardwareOptional: blueprint.hardwareOptional,
    },
    system: [
      `You are generating a unique project CONTEXT for a student's IoT internship certificate at ${trackLevel} level.`,
      ``,
      `THE HARDWARE/SIMULATOR PROJECT IS ALREADY DECIDED — DO NOT CHANGE IT:`,
      `  Project: ${blueprint.title}`,
      `  Components: ${componentList}`,
      `  ${simNote}`,
      `  Difficulty: ${difficulty}`,
      ``,
      `Your ONLY job is to write the surrounding narrative/context:`,
      `  - Who is the student building this for? (e.g. "a small urban rooftop farm co-op", "a hostel warden managing 3 buildings")`,
      `  - What real-world problem does it solve for them?`,
      `  - Why does it matter in 2-3 sentences?`,
      ``,
      `STRICT RULES:`,
      `- DO NOT invent new components. Use ONLY the ones listed above.`,
      `- DO NOT change the project type. Keep it as: ${blueprint.title}.`,
      `- The scenario must reference the actual components (${componentList}).`,
      `- resourceCategory should be a short tag like "iot-soil-sensor", "iot-air-quality", "iot-motion-detection".`,
      `- Never use emojis.`,
      `- Respond ONLY with valid JSON — no markdown, no code fences.`,
    ].join('\n'),
    user: [
      `Generate the project context/narrative for an IoT student building: "${blueprint.title}".`,
      `Components they will use: ${componentList}.`,
      `Return a JSON object with exactly these fields:`,
      `{`,
      `  "scenario": "15-25 word description: who the student is building this for and what real problem it solves",`,
      `  "domain": "${domainName}",`,
      `  "businessContext": "2-3 sentences: who the end user/client is, the specific problem, and why this IoT solution matters to them",`,
      `  "resourceCategory": "short-hyphenated-tag like 'iot-soil-sensor' or 'iot-air-quality'",`,
      `  "projectTitle": "Concise title incorporating the context (5-10 words, e.g. 'Rooftop Farm Irrigation Controller')"`,
      `}`,
    ].join('\n'),
  };
}

// ── Category C — Odoo scenario selection + narrative prompt ───────────────────

async function buildCategoryCPrompt(
  domainName: string,
  trackLevel: string,
  difficulty: string,
): Promise<{ system: string; user: string; odooScenario: { id: string; moduleName: string; businessType: string; processFocus: string } }> {
  // Select a random active scenario matching the difficulty level
  const scenarios = await prisma.odooModuleScenario.findMany({
    where: { difficultyLevel: difficulty, isActive: true },
  });

  if (scenarios.length === 0) {
    const allScenarios = await prisma.odooModuleScenario.findMany({ where: { isActive: true } });
    if (allScenarios.length === 0) {
      throw new AiGenerationError('master', 'No active OdooModuleScenario rows found in the database. Seed the curated scenarios first.');
    }
    scenarios.push(...allScenarios);
  }

  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

  return {
    odooScenario: {
      id:           scenario.id,
      moduleName:   scenario.moduleName,
      businessType: scenario.businessType,
      processFocus: scenario.processFocus,
    },
    system: [
      `You are generating a unique project CONTEXT for a student's Odoo ERP internship certificate at ${trackLevel} level.`,
      ``,
      `THE ODOO MODULE AND BUSINESS PROCESS ARE ALREADY DECIDED — DO NOT CHANGE THEM:`,
      `  Odoo Module: ${scenario.moduleName}`,
      `  Business Type: ${scenario.businessType}`,
      `  Process Focus: ${scenario.processFocus}`,
      `  Difficulty: ${difficulty}`,
      ``,
      `Your ONLY job is to write the surrounding narrative/context:`,
      `  - Give the business a specific, plausible name and region (e.g. "Mehta Pharma Distributors, Ahmedabad").`,
      `  - Describe the specific business pain-point that the ${scenario.moduleName} module will solve.`,
      `  - Frame it as a realistic ERP implementation project.`,
      ``,
      `STRICT RULES:`,
      `- DO NOT change the Odoo module. The module is: ${scenario.moduleName} only.`,
      `- DO NOT invent modules or processes that don't exist in real Odoo 17.`,
      `- The process focus must remain: ${scenario.processFocus}.`,
      `- resourceCategory should be a short tag like "odoo-sales", "odoo-inventory", "odoo-hr".`,
      `- Never use emojis.`,
      `- Respond ONLY with valid JSON — no markdown, no code fences.`,
    ].join('\n'),
    user: [
      `Generate the project context/narrative for an Odoo ERP student configuring the "${scenario.moduleName}" module for a ${scenario.businessType}, focusing on ${scenario.processFocus}.`,
      `Return a JSON object with exactly these fields:`,
      `{`,
      `  "scenario": "15-25 word description: a specific named business implementing Odoo ${scenario.moduleName} to solve their ${scenario.processFocus} challenge",`,
      `  "domain": "${domainName}",`,
      `  "businessContext": "2-3 sentences: the specific company, their current pain-point, and what implementing the ${scenario.moduleName} module will accomplish",`,
      `  "resourceCategory": "short-hyphenated-tag like 'odoo-${scenario.moduleName.toLowerCase()}' or 'odoo-inventory'",`,
      `  "projectTitle": "Concise title (5-10 words, e.g. 'Odoo Sales Module for Regional Pharma Distributor')"`,
      `}`,
    ].join('\n'),
  };
}

// ── Main generation function ──────────────────────────────────────────────────

// ── Category D — Robotics blueprint selection + narrative prompt ───────────────

async function buildRoboticsPrompt(
  domainName: string,
  trackLevel: string,
  difficulty: string,
): Promise<{ system: string; user: string; blueprint: { id: string; title: string; components: string[]; simulatorUrl: string | null; simulatorName: string | null; hardwareOptional: boolean } }> {
  const blueprints = await prisma.roboticsProjectBlueprint.findMany({
    where: { difficultyLevel: difficulty, isActive: true },
  });

  if (blueprints.length === 0) {
    const allBlueprints = await prisma.roboticsProjectBlueprint.findMany({ where: { isActive: true } });
    if (allBlueprints.length === 0) {
      throw new AiGenerationError('master', 'No active RoboticsProjectBlueprint rows found in the database. Seed the curated blueprints first.');
    }
    blueprints.push(...allBlueprints);
  }

  const blueprint = blueprints[Math.floor(Math.random() * blueprints.length)];
  let components: string[] = [];
  try { components = JSON.parse(blueprint.components) as string[]; } catch { components = [blueprint.components]; }

  const componentList = components.join(', ');
  const simNote = blueprint.simulatorUrl
    ? `Approved Simulator: ${blueprint.simulatorName ?? 'Webots/Gazebo/Wokwi'} (${blueprint.simulatorUrl})`
    : 'Hardware model (no simulator path).';

  return {
    blueprint: {
      id:               blueprint.id,
      title:            blueprint.title,
      components,
      simulatorUrl:     blueprint.simulatorUrl,
      simulatorName:    blueprint.simulatorName,
      hardwareOptional: blueprint.hardwareOptional,
    },
    system: [
      `You are generating a unique project CONTEXT for a student's Robotics internship certificate at ${trackLevel} level.`,
      ``,
      `THE ROBOTICS PROJECT IS ALREADY DECIDED — DO NOT CHANGE IT:`,
      `  Project: ${blueprint.title}`,
      `  Components: ${componentList}`,
      `  ${simNote}`,
      `  Difficulty: ${difficulty}`,
      ``,
      `Your ONLY job is to write the surrounding narrative/context:`,
      `  - Who is the student building this for? (e.g. "a warehouse logistics automation client", "an agricultural inspection farm", "a smart hospital navigation team")`,
      `  - What real-world problem does it solve for them?`,
      `  - Why does it matter in 2-3 sentences?`,
      ``,
      `STRICT RULES:`,
      `- DO NOT invent new components. Use ONLY the ones listed above.`,
      `- DO NOT change the project type. Keep it as: ${blueprint.title}.`,
      `- The scenario must reference the actual components (${componentList}).`,
      `- resourceCategory should be a short tag like "robotics-navigation", "robotics-arm", "robotics-slam", "robotics-swarm".`,
      `- Never use emojis.`,
      `- Respond ONLY with valid JSON — no markdown, no code fences.`,
    ].join('\n'),
    user: [
      `Generate the project context/narrative for a Robotics student building: "${blueprint.title}".`,
      `Components they will use: ${componentList}.`,
      `Return a JSON object with exactly these fields:`,
      `{`,
      `  "scenario": "15-25 word description: who the student is building this robot for and what real problem it solves",`,
      `  "domain": "${domainName}",`,
      `  "businessContext": "2-3 sentences: who the end user/client is, the specific robotics problem, and why this robotic system matters to them",`,
      `  "resourceCategory": "short-hyphenated-tag like 'robotics-navigation' or 'robotics-slam'",`,
      `  "projectTitle": "Concise title incorporating the context (5-10 words, e.g. 'Automated Warehouse Rover with Obstacle Avoidance')"`,
      `}`,
    ].join('\n'),
  };
}

export async function generateMasterProject(
  domainName: string,
  trackLevel: string,
  domainSlug: string,
): Promise<MasterProject> {
  const category = getDomainCategory(domainSlug);
  const difficulty = levelToDifficulty(trackLevel);

  // ── Category B: IoT ───────────────────────────────────────────────────────
  if (category === 'B') {
    const { system, user, blueprint } = await buildCategoryBPrompt(domainName, trackLevel, difficulty);
    const result = await generateWithFallback({
      taskName: 'MasterProject/IoT',
      systemPrompt: system,
      userPrompt: user,
      temperature: 0.9,
      maxTokens: 1200,
      responseFormat: 'json_object',
    });

    const base = validateMasterProject(result.json);
    return {
      ...base,
      blueprintId:      blueprint.id,
      components:       blueprint.components,
      simulatorUrl:     blueprint.simulatorUrl ?? undefined,
      hardwareOptional: blueprint.hardwareOptional,
    };
  }

  // ── Category C: ERP/Odoo ──────────────────────────────────────────────────
  if (category === 'C') {
    const { system, user, odooScenario } = await buildCategoryCPrompt(domainName, trackLevel, difficulty);
    const result = await generateWithFallback({
      taskName: 'MasterProject/ERP-Odoo',
      systemPrompt: system,
      userPrompt: user,
      temperature: 0.9,
      maxTokens: 1200,
      responseFormat: 'json_object',
    });

    const base = validateMasterProject(result.json);
    return {
      ...base,
      scenarioId:   odooScenario.id,
      moduleName:   odooScenario.moduleName,
      processFocus: odooScenario.processFocus,
    };
  }

  // ── Category D: Robotics ──────────────────────────────────────────────────
  if (category === 'D') {
    const { system, user, blueprint } = await buildRoboticsPrompt(domainName, trackLevel, difficulty);
    const result = await generateWithFallback({
      taskName: 'MasterProject/Robotics',
      systemPrompt: system,
      userPrompt: user,
      temperature: 0.9,
      maxTokens: 1200,
      responseFormat: 'json_object',
    });

    const base = validateMasterProject(result.json);
    return {
      ...base,
      blueprintId:      blueprint.id,
      components:       blueprint.components,
      simulatorUrl:     blueprint.simulatorUrl ?? undefined,
      hardwareOptional: blueprint.hardwareOptional,
    };
  }

  // ── Category A: Business-scenario domains ─────────────────────────────────
  const { system, user } = buildCategoryAPrompt(domainName, trackLevel);
  const result = await generateWithFallback({
    taskName: 'MasterProject/CategoryA',
    systemPrompt: system,
    userPrompt: user,
    temperature: 0.9,
    maxTokens: 1200,
    responseFormat: 'json_object',
  });

  return validateMasterProject(result.json);
}
