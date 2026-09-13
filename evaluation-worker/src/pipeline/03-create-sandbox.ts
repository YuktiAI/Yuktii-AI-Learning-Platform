/**
 * 03-create-sandbox.ts — Stage 3: Create isolated sandbox and clone repository.
 *
 * Delegates to the sandbox abstraction (e2b-sandbox.ts).
 * Sets ctx.sandboxId and ctx.sandboxRepoPath for downstream stages.
 */

import { createSandboxInstance } from '../sandbox/e2b-sandbox.js';
import { logger } from '../logger.js';
import type { PipelineContext } from '../pipeline-context.js';

export async function createSandbox(ctx: PipelineContext): Promise<void> {
  const { job, evaluationId } = ctx;

  logger.info('Creating evaluation sandbox', { evaluationId, stage: 'createSandbox' });

  const sandboxInfo = await createSandboxInstance(job.repoUrl, evaluationId);

  ctx.sandboxId      = sandboxInfo.sandboxId;
  ctx.sandboxRepoPath = sandboxInfo.repoPath;

  logger.info('Sandbox ready', {
    evaluationId,
    stage: 'createSandbox',
    sandboxId: sandboxInfo.sandboxId,
    repoPath:  sandboxInfo.repoPath,
    isLocal:   sandboxInfo.isLocal,
  });
}
