import { createHash } from 'crypto';
import { z } from 'zod';

export const SPEC_VERSION = 'v2.0';

export const verificationSchema = z.object({
  method: z.enum(['static', 'test', 'llm_judge', 'manual']),
  target: z.string().min(1),
});

export const functionalRequirementSchema = z.object({
  id: z.string().regex(/^FR-\d{2,}$/),
  text: z.string().min(1),
  required: z.boolean(),
  verify: verificationSchema,
});

export const resourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  rationale: z.string(),
  verifiedAt: z.string().optional(),
  isReachable: z.boolean().optional(),
});

export const testCaseSchema = z.object({
  id: z.string().optional(), // e.g. "TC-001"
  name: z.string(),
  input: z.string().optional(),
  expected: z.string(),
  hidden: z.boolean().optional(),
});

export const simulationToolSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  license: z.string(),
  openSource: z.boolean().default(true),
  freeToUse: z.boolean().default(true),
  gpuRequired: z.boolean().default(false),
  os: z.string().default('Linux, Windows, macOS'),
  description: z.string(),
  bestFor: z.string().optional(),
  installNotes: z.string().optional(),
  isPrimary: z.boolean().default(false),
  browserBased: z.boolean().default(false),
});

/** The versioned, evaluator-readable project specification persisted per stage. */
export const projectSpecificationSchema = z.object({
  specVersion: z.literal(SPEC_VERSION),
  implementationPath: z.enum(['hardware', 'simulation']).optional(),
  simulationTools: z.array(simulationToolSchema).optional(),
  problemStatement: z.object({
    title: z.string(),
    domain: z.string(),
    difficulty: z.string(),
    targetUsers: z.string(),
    realWorldContext: z.string(),
    expectedOutcome: z.string(),
  }),
  problemDescription: z.object({
    background: z.string(),
    industrySignificance: z.string(),
    existingLimitations: z.string(),
    proposedSolution: z.string(),
  }),
  learningObjectives: z.array(z.string()),
  prerequisites: z.array(z.string()),
  resourcesAndDatasets: z.array(resourceSchema),
  technologyStack: z.object({
    frontend: z.array(z.string()),
    backend: z.array(z.string()),
    database: z.array(z.string()),
    libraries: z.array(z.string()),
  }),
  systemArchitecture: z.string(),
  functionalRequirements: z.array(functionalRequirementSchema),
  nonFunctionalRequirements: z.array(z.string()),
  developmentRoadmap: z.array(z.string()),
  gitDevelopmentPlan: z.array(
    z.object({
      milestone: z.string(),
      expectedArtifacts: z.array(z.string()),
    })
  ),
  componentsToDevelop: z.array(z.string()),
  deliverables: z.array(z.string()),
  testCases: z.array(testCaseSchema),
  hiddenTestCases: z.array(testCaseSchema).default([]),
  edgeCases: z.array(z.string()),
  securityRequirements: z.array(z.string()),
  documentationRequirements: z.array(z.string()),
  deploymentRequirements: z.array(z.string()),
  evaluationRubric: z.array(
    z.object({
      category: z.string(),
      weight: z.number().min(0).max(100),
    })
  ),
  extensionChallenges: z.object({
    basic: z.array(z.string()),
    intermediate: z.array(z.string()),
    advanced: z.array(z.string()),
    bonus: z.array(z.string()),
  }),
  finalSubmissionChecklist: z.array(z.string()),
});

export type ProjectSpecification = z.infer<typeof projectSpecificationSchema>;

/** Stable serialization makes a hash independent of JavaScript property insertion order. */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashProjectSpecification(spec: ProjectSpecification): string {
  return createHash('sha256').update(canonicalize(spec)).digest('hex');
}

/**
 * Strips hidden tests and evaluator-only instructions before returning to a student client.
 * Guarantee: `hiddenTestCases` is NEVER returned to students.
 */
export function toStudentProjectSpecification(spec: ProjectSpecification) {
  const { hiddenTestCases: _hiddenTests, ...studentSpec } = spec;
  return studentSpec;
}
