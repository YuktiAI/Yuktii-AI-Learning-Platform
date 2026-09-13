/**
 * 02-retrieve-spec.ts — Stage 2: Retrieve the locked project specification.
 *
 * Fetches the Groq-generated StageGeneratedContent for this enrollment+stage.
 * This is the ORIGINAL, LOCKED specification — we NEVER regenerate it here.
 * The spec is already embedded in job.projectSpec (set by the API route), but
 * this stage validates it's still accurate against the DB copy.
 *
 * Also fetches domain metadata (slug, name) for domain-aware evaluation later.
 */

import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import type { PipelineContext } from '../pipeline-context.js';

export async function retrieveSpec(ctx: PipelineContext): Promise<void> {
  const { job, evaluationId } = ctx;
  const { enrollmentId, stageId } = job;
  const prisma = getPrisma();

  logger.info('Retrieving project specification', { evaluationId, stage: 'retrieveSpec' });

  // The spec is already passed in job.projectSpec from the API route.
  // Validate it has content; if empty, try to load from DB.
  const hasSpec = (
    job.projectSpec.requirements.length > 0 ||
    job.projectSpec.problemStatement.length > 0
  );

  if (hasSpec) {
    logger.info('Project spec from job payload — valid', {
      evaluationId,
      stage: 'retrieveSpec',
      requirementsCount: job.projectSpec.requirements.length,
      criteriaCount: job.projectSpec.acceptanceCriteria.length,
    });
    return;
  }

  // Fallback: load from DB (handles case where job was created before spec was set)
  logger.warn('Job spec was empty — loading from DB', { evaluationId, stage: 'retrieveSpec' });

  // Find the stage number from the stage record
  const stageRecord = await prisma.stage.findUnique({
    where: { id: stageId },
    select: { stageNumber: true },
  });

  if (!stageRecord) {
    throw new Error(`Stage ${stageId} not found in database.`);
  }

  const generatedContent = await prisma.stageGeneratedContent.findUnique({
    where: {
      enrollmentId_stageNumber: {
        enrollmentId,
        stageNumber: stageRecord.stageNumber,
      },
    },
  });

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

  // Parse and populate the job spec from DB
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

  // Update the in-memory job spec (pipeline stages read from job.projectSpec)
  job.projectSpec = {
    problemStatement:  generatedContent.problemStatement,
    requirements,
    acceptanceCriteria,
    estimatedEffort:   generatedContent.estimatedEffort,
  };

  logger.info('Project spec loaded from DB', {
    evaluationId,
    stage: 'retrieveSpec',
    requirementsCount: requirements.length,
    criteriaCount: acceptanceCriteria.length,
  });
}
