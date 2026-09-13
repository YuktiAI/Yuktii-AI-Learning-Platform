/**
 * getOrGenerateStageContent — The enforcement mechanism
 *
 * This is the single entry point for getting stage content in the track page.
 *
 * Logic:
 * 1. Check StageGeneratedContent for existing row → return immediately if found (NEVER regenerate)
 * 2. Verify enrollment.aiVariantLockedAt is set (master project must exist)
 * 3. Call generateStageContentFromGroq with the locked master project
 * 4. Call matchResources with Groq's returned resourceTags
 * 5. Write the new StageGeneratedContent row to DB → return it
 * 6. On AiGenerationError → write FAILED row to DB → rethrow (caller shows error card)
 */
import { prisma } from '@/lib/prisma';
import { AiGenerationError } from './AiGenerationError';
import { generateStageContentFromGroq, getStageRole } from './generateStageContent';
import { matchResources, type MatchedResource } from './matchResources';
import type { MasterProject } from './generateMasterProject';

export interface StageContentForDisplay {
  id: string;
  enrollmentId: string;
  stageNumber: number;
  problemStatement: string;
  requirements: string[];
  acceptanceCriteria: string[];
  estimatedEffort: string;
  generationStatus: string;  // 'SUCCESS' | 'FAILED'
  matchedResources: MatchedResource[];
  generatedAt: Date;
}

export async function getOrGenerateStageContent(params: {
  enrollmentId: string;
  stageNumber: number;
  totalStages: number;
  domainSlug: string;
  domainName: string;
  levelName: string;
  learningObjectives: string;
}): Promise<StageContentForDisplay> {
  const { enrollmentId, stageNumber, totalStages, domainSlug, domainName, levelName, learningObjectives } = params;

  // ── Step 1: Check for existing row ────────────────────────────────────────
  const existing = await prisma.stageGeneratedContent.findUnique({
    where: { enrollmentId_stageNumber: { enrollmentId, stageNumber } },
  });

  if (existing) {
    // Serve from DB — NEVER call Groq again
    const resourceLinkIds: string[] = safeParseJson(existing.resourceLinkIds, []);
    const matchedResources = await resolveResourceLinkIds(resourceLinkIds);
    return toDisplayModel(existing, matchedResources);
  }

  // ── Step 2: Verify master project is locked ───────────────────────────────
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { aiVariantJson: true, aiVariantLockedAt: true, iotMode: true },
  });

  if (!enrollment) {
    throw new AiGenerationError('stage_content', 'Enrollment not found');
  }

  if (!enrollment.aiVariantLockedAt || !enrollment.aiVariantJson) {
    // Master project generation is still pending (async background job hasn't finished)
    // Return a pending placeholder — caller must show "generating" state
    throw new AiGenerationError(
      'master',
      'Master project is not yet generated. Please wait a moment and refresh.'
    );
  }

  let masterProject: MasterProject;
  try {
    masterProject = JSON.parse(enrollment.aiVariantJson) as MasterProject;
  } catch {
    throw new AiGenerationError('master', 'Stored master project JSON is invalid');
  }

  // ── Step 3: Generate stage content via Two-Pass Structured Generation ───
  let structuredResult;
  try {
    const { generateStructuredStageContent } = await import('./structured-generation');
    structuredResult = await generateStructuredStageContent({
      domainName,
      domainSlug,
      levelName,
      stageNumber,
      totalStages,
      masterProject,
    });
  } catch (err) {
    // Write a FAILED row so we don't keep trying on every page load
    await prisma.stageGeneratedContent.create({
      data: {
        enrollmentId,
        stageNumber,
        problemStatement: '',
        requirements: JSON.stringify([]),
        resourceTags: JSON.stringify([]),
        resourceLinkIds: JSON.stringify([]),
        acceptanceCriteria: JSON.stringify([]),
        estimatedEffort: '',
        generationStatus: 'FAILED',
      },
    });

    // Log to AiGenerationLog
    await prisma.aiGenerationLog.create({
      data: {
        enrollmentId,
        stageId:       `stage-${stageNumber}`,
        promptVersion: 'v2.0-structured',
        modelName:     'llama-3.3-70b-versatile',
        rawResponse:   err instanceof Error ? err.message : String(err),
        status:        'FAILED',
      },
    }).catch(() => {});

    throw err;
  }

  const generated = structuredResult.content;

  // ── Step 4: Match resources by tags ──────────────────────────────────────
  const matchedResources = await matchResources(generated.resourceTags, domainSlug);
  const resourceLinkIds = matchedResources.map(r => r.id);

  // ── Step 5: Store permanently in DB with full structured contract ────────
  const row = await prisma.stageGeneratedContent.create({
    data: {
      enrollmentId,
      stageNumber,
      title:                   generated.title,
      problemStatement:        generated.problemStatement,
      learningObjectives:      JSON.stringify(generated.learningObjectives),
      starterFiles:            JSON.stringify(generated.starterFiles),
      hiddenTestCases:         JSON.stringify(generated.hiddenTestCases),
      difficultyTier:          generated.difficultyTier,
      nonTechnicalExplanation: generated.nonTechnicalExplanation,
      technicalExplanation:    generated.technicalExplanation,
      expectedFileStructure:   JSON.stringify(generated.expectedFileStructure),
      passFailCriteria:        JSON.stringify(generated.passFailCriteria),
      critiquePassResult:      JSON.stringify(structuredResult.critique),
      generationVersion:       structuredResult.version,
      generationModel:         structuredResult.modelUsed,
      requirements:            JSON.stringify(generated.requirements),
      resourceTags:            JSON.stringify(generated.resourceTags),
      resourceLinkIds:         JSON.stringify(resourceLinkIds),
      acceptanceCriteria:      JSON.stringify(generated.acceptanceCriteria),
      estimatedEffort:         generated.estimatedEffort,
      generationStatus:        'SUCCESS',
    },
  });

  // Log success to AiGenerationLog
  await prisma.aiGenerationLog.create({
    data: {
      enrollmentId,
      stageId:       `stage-${stageNumber}`,
      promptVersion: structuredResult.version,
      modelName:     structuredResult.modelUsed,
      rawResponse:   JSON.stringify(structuredResult),
      status:        structuredResult.critique.approved ? 'SUCCESS' : 'CRITIQUE_FLAGGED',
      scenario:      masterProject.scenario,
    },
  }).catch(() => {});

  return toDisplayModel(row, matchedResources);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeParseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function resolveResourceLinkIds(ids: string[]): Promise<MatchedResource[]> {
  if (ids.length === 0) return [];
  const links = await prisma.resourceLink.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, url: true, sourceType: true, description: true },
  });
  return links;
}

function toDisplayModel(
  row: {
    id: string;
    enrollmentId: string;
    stageNumber: number;
    problemStatement: string;
    requirements: string;
    acceptanceCriteria: string;
    estimatedEffort: string;
    generationStatus: string;
    generatedAt: Date;
  },
  matchedResources: MatchedResource[],
): StageContentForDisplay {
  return {
    id:                row.id,
    enrollmentId:      row.enrollmentId,
    stageNumber:       row.stageNumber,
    problemStatement:  row.problemStatement,
    requirements:      safeParseJson(row.requirements, []),
    acceptanceCriteria: safeParseJson(row.acceptanceCriteria, []),
    estimatedEffort:   row.estimatedEffort,
    generationStatus:  row.generationStatus,
    matchedResources,
    generatedAt:       row.generatedAt,
  };
}
