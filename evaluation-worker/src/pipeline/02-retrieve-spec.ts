/**
 * 02-retrieve-spec.ts — Stage 2: Retrieve the locked project specification.
 *
 * Fetches the Groq-generated StageGeneratedContent for this enrollment+stage.
 * This is the ORIGINAL, LOCKED specification — we NEVER regenerate it here.
 *
 * Workstream D:
 * - Loads full machine-readable ProjectSpecification
 * - Stores specVersion & specHash onto Evaluation
 * - Retrieves implementationPath (hardware vs simulation)
 * - Sets stable requirement IDs (FR-01, FR-02...) for downstream scoring
 */

import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import type { PipelineContext } from '../pipeline-context.js';

export async function retrieveSpec(ctx: PipelineContext): Promise<void> {
  const { job, evaluationId } = ctx;
  const { enrollmentId, stageId, submissionRecordId } = job;
  const prisma = getPrisma();

  logger.info('Retrieving project specification (Workstream D)', { evaluationId, stage: 'retrieveSpec' });

  // 1. Check SubmissionRecord for implementationPath and spec metadata
  if (submissionRecordId) {
    try {
      const subRec = await prisma.submissionRecord.findUnique({
        where: { id: submissionRecordId },
        select: { implementationPath: true, specVersion: true, specHash: true },
      });
      if (subRec) {
        if (subRec.implementationPath === 'hardware' || subRec.implementationPath === 'simulation') {
          ctx.implementationPath = subRec.implementationPath;
        }
        if (subRec.specVersion) ctx.specVersion = subRec.specVersion;
        if (subRec.specHash) ctx.specHash = subRec.specHash;
      }
    } catch (e) {
      logger.warn('Failed to query SubmissionRecord for implementationPath', { error: String(e) });
    }
  }

  // 2. Find the stage number from the stage record
  const stageRecord = await prisma.stage.findUnique({
    where: { id: stageId },
    select: { stageNumber: true },
  });

  if (!stageRecord) {
    throw new Error(`Stage ${stageId} not found in database.`);
  }

  // 3. Load StageGeneratedContent
  const generatedContent = await prisma.stageGeneratedContent.findUnique({
    where: {
      enrollmentId_stageNumber: {
        enrollmentId,
        stageNumber: stageRecord.stageNumber,
      },
    },
  });

  if (generatedContent) {
    ctx.specVersion = generatedContent.specVersion || ctx.specVersion || 'v2.0';
    if (generatedContent.specHash) {
      ctx.specHash = generatedContent.specHash;
    }

    if (generatedContent.projectSpec) {
      try {
        const fullSpec = JSON.parse(generatedContent.projectSpec);
        ctx.fullProjectSpec = fullSpec;

        if (fullSpec.implementationPath) {
          ctx.implementationPath = fullSpec.implementationPath;
        }

        // Downstream scoring (Stage 8, Stage 10) benefits from exact stable IDs: [FR-01] Text
        if (Array.isArray(fullSpec.functionalRequirements) && fullSpec.functionalRequirements.length > 0) {
          job.projectSpec.requirements = fullSpec.functionalRequirements.map(
            (fr: any) => `[${fr.id}] ${fr.text}`
          );
        }
      } catch (err) {
        logger.warn('Failed to parse full projectSpec JSON', { error: String(err) });
      }
    }

    // Persist specHash and specVersion to Evaluation
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        specVersion: ctx.specVersion,
        ...(ctx.specHash ? { specHash: ctx.specHash } : {}),
      },
    }).catch(() => {});
  }

  // 4. Validate or populate in-memory job.projectSpec
  const hasSpec = (
    job.projectSpec.requirements.length > 0 ||
    job.projectSpec.problemStatement.length > 0
  );

  if (!hasSpec) {
    if (!generatedContent) {
      throw new Error(
        `No generated project specification found for enrollment ${enrollmentId}, ` +
        `stage ${stageRecord.stageNumber}. The project must be generated before evaluation can run.`
      );
    }

    if (generatedContent.generationStatus === 'FAILED') {
      throw new Error(
        `Project specification generation previously failed for enrollment ${enrollmentId}, ` +
        `stage ${stageRecord.stageNumber}. Please retry project generation before submitting for evaluation.`
      );
    }

    let requirements: string[] = [];
    let acceptanceCriteria: string[] = [];

    try {
      requirements = JSON.parse(generatedContent.requirements);
    } catch {
      logger.warn('Failed to parse requirements JSON', { evaluationId, stage: 'retrieveSpec' });
    }

    try {
      acceptanceCriteria = JSON.parse(generatedContent.acceptanceCriteria);
    } catch {
      logger.warn('Failed to parse acceptanceCriteria JSON', { evaluationId, stage: 'retrieveSpec' });
    }

    job.projectSpec = {
      problemStatement:  generatedContent.problemStatement,
      requirements,
      acceptanceCriteria,
      estimatedEffort:   generatedContent.estimatedEffort,
    };
  }

  logger.info('Project spec loaded successfully', {
    evaluationId,
    stage: 'retrieveSpec',
    specVersion: ctx.specVersion,
    specHash: ctx.specHash,
    implementationPath: ctx.implementationPath,
    requirementsCount: job.projectSpec.requirements.length,
    criteriaCount: job.projectSpec.acceptanceCriteria.length,
  });
}
