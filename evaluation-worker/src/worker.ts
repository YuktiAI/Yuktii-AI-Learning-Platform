/**
 * worker.ts — BullMQ worker entry point for the evaluation pipeline.
 *
 * Run with: npx tsx src/worker.ts  (dev)
 * Or:       node dist/worker.js    (production build)
 *
 * This file orchestrates the 11-stage evaluation pipeline. Each stage is a
 * separate module under src/pipeline/. Stages run sequentially; the shared
 * PipelineContext carries intermediate results between them.
 *
 * A hard 15-minute timeout is enforced via Promise.race — the sandbox is
 * always destroyed in the finally block, regardless of success or failure.
 */

import { Worker, Job } from 'bullmq';
import {
  EVALUATION_QUEUE_NAME,
  WORKER_CONCURRENCY,
  EVALUATION_TIMEOUT_MS,
} from './config.js';
import { makeRedisConnection, type EvaluationJobData, type EvaluationJobResult } from './queue.js';
import { createPipelineContext } from './pipeline-context.js';
import { getPrisma, disconnectPrisma } from './db.js';
import { logger } from './logger.js';
import { logWorkerError, STUDENT_SAFE_ERROR } from './error-logger.js';

// ── Pipeline stage imports ─────────────────────────────────────────────────────
import { verifySubmission }       from './pipeline/01-verify-submission.js';
import { sanitizeAndAuditInputs } from './pipeline/01b-sanitize-input.js';
import { retrieveSpec }           from './pipeline/02-retrieve-spec.js';
import { createSandbox }          from './pipeline/03-create-sandbox.js';
import { runDeterministicChecks } from './pipeline/04-deterministic-checks.js';
import { scoreOnExecution }       from './pipeline/04b-score-on-execution.js';
import { runOpenHands }           from './pipeline/05-openhands-eval.js';
import { runSweAgentInvestigation } from './pipeline/06-swe-agent-investigation.js';
import { analyzeGitHistory }      from './pipeline/07-git-history.js';
import { scoreRequirements }      from './pipeline/08-requirement-scoring.js';
import { computeFinalScore }      from './pipeline/09-score-engine.js';
import { runSanityScorer }        from './pipeline/09b-sanity-scorer.js';
import { generateMentorReport }   from './pipeline/10-mentor-report.js';
import { saveResults }            from './pipeline/11-save-results.js';
import { destroySandbox }         from './sandbox/e2b-sandbox.js';

// ── Stage label helper (updates Evaluation.currentStageLabel in DB) ────────────
async function updateStageLabel(evaluationId: string, label: string): Promise<void> {
  try {
    const prisma = getPrisma();
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: { currentStageLabel: label, status: 'running' },
    });
  } catch (err) {
    logger.warn('Failed to update stage label', { evaluationId, label, err: String(err) });
  }
}

// ── Core pipeline function ─────────────────────────────────────────────────────
async function runEvaluationPipeline(
  job: Job<EvaluationJobData, EvaluationJobResult>
): Promise<EvaluationJobResult> {
  const data = job.data;
  const { evaluationId } = data;
  const ctx = createPipelineContext(data);
  const prisma = getPrisma();

  logger.info('Pipeline started', { evaluationId, repoUrl: data.repoUrl });

  // Mark as running immediately
  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: { status: 'running', startedAt: new Date() },
  });

  try {
    // ── Stage 1: Verify submission ───────────────────────────────────────────
    await updateStageLabel(evaluationId, 'Verifying submission…');
    await verifySubmission(ctx);

    // ── Stage 2: Retrieve project specification ──────────────────────────────
    await updateStageLabel(evaluationId, 'Retrieving project specification…');
    await retrieveSpec(ctx);

    // ── Stage 3: Create isolated sandbox + clone repo ────────────────────────
    await updateStageLabel(evaluationId, 'Setting up evaluation environment…');
    await createSandbox(ctx);

    // ── Stage 3b: Prompt injection defense (Section 9.5) ─────────────────────
    await sanitizeAndAuditInputs(ctx);

    // ── Stage 4: Deterministic checks ───────────────────────────────────────
    await updateStageLabel(evaluationId, 'Running deterministic checks…');
    await runDeterministicChecks(ctx);

    // ── Stage 4b: Execution-based scoring (Section 9.3) ──────────────────────
    await updateStageLabel(evaluationId, 'Executing code and test suites…');
    await scoreOnExecution(ctx);

    // ── Determine harness type (Section 9.2) ────────────────────────────────
    const stageRecord = await prisma.stage.findUnique({
      where: { id: data.stageId },
      select: { harnessType: true },
    });
    ctx.harnessType = (stageRecord?.harnessType as 'narrow' | 'broad') || 'broad';
    ctx.harnessVersion = ctx.harnessType === 'narrow' ? 'mini-swe-agent-1.0' : 'openhands-0.1-hybrid';

    if (ctx.harnessType === 'broad') {
      // ── Stage 5: OpenHands broad evaluation ───────────────────────────────
      await updateStageLabel(evaluationId, 'OpenHands broad evaluation (this may take several minutes)…');
      await runOpenHands(ctx);

      // ── Stage 6: mini-SWE-agent focused investigation ──────────────────────
      if (ctx.openHandsResult && ctx.openHandsResult.flaggedIssues.length > 0) {
        await updateStageLabel(evaluationId, 'Investigating flagged issues…');
        await runSweAgentInvestigation(ctx);
      } else {
        logger.info('No flagged issues from OpenHands — skipping mini-SWE-agent', { evaluationId });
      }
    } else {
      // ── Narrow harness: Skip OpenHands, run focused mini-SWE-agent directly ─
      logger.info('Narrow harness selected — skipping OpenHands, launching focused SWE agent', { evaluationId });
      await updateStageLabel(evaluationId, 'Focused requirement investigation…');
      await runSweAgentInvestigation(ctx);
    }

    // ── Stage 7: Git history analysis ───────────────────────────────────────
    await updateStageLabel(evaluationId, 'Analysing git history…');
    await analyzeGitHistory(ctx);

    // ── Stage 8: Requirement-by-requirement scoring ──────────────────────────
    await updateStageLabel(evaluationId, 'Scoring requirements…');
    await scoreRequirements(ctx);

    // ── Stage 9: Weighted final score ────────────────────────────────────────
    await updateStageLabel(evaluationId, 'Computing final score…');
    await computeFinalScore(ctx);

    // ── Stage 9b: Sanity scorer & discrepancy checks (Section 9.4) ───────────
    await updateStageLabel(evaluationId, 'Auditing score with sanity check…');
    await runSanityScorer(ctx);

    // ── Stage 10: Mentor report ──────────────────────────────────────────────
    await updateStageLabel(evaluationId, 'Generating mentor report…');
    await generateMentorReport(ctx);

    // ── Stage 11: Save results + trigger certificate ─────────────────────────
    await updateStageLabel(evaluationId, 'Saving results…');
    await saveResults(ctx);

    logger.info('Pipeline completed', {
      evaluationId,
      finalScore: ctx.finalScore,
      stage: 'done',
    });

    return {
      evaluationId,
      finalScore: ctx.finalScore ?? 0,
      status: 'completed',
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('Pipeline failed', { evaluationId, error: errorMessage });

    // Log to ErrorLog + fire admin alert email
    const safeMessage = await logWorkerError({
      service: 'claude-evaluation-pipeline',
      error: err,
      context: {
        evaluationId,
        enrollmentId: data.enrollmentId,
        studentId: data.studentId,
        stageNumber: data.stageNumber,
        repoUrl: data.repoUrl,
      },
    });

    // Mark evaluation as failed in DB — use STUDENT_SAFE_ERROR, not the raw error
    try {
      await prisma.evaluation.update({
        where: { id: evaluationId },
        data: {
          status: 'failed',
          errorMessage: safeMessage, // student-safe — technical detail is in ErrorLog
          completedAt: new Date(),
          currentStageLabel: 'Evaluation could not be completed. Our team has been notified.',
        },
      });
    } catch (dbErr) {
      logger.error('Failed to mark evaluation as failed in DB', {
        evaluationId,
        error: String(dbErr),
      });
    }

    return { evaluationId, finalScore: 0, status: 'failed', errorMessage: safeMessage };
  } finally {
    // Always destroy the sandbox — never leave it running
    if (ctx.sandboxId) {
      try {
        await destroySandbox(ctx.sandboxId);
        logger.info('Sandbox destroyed', { evaluationId, sandboxId: ctx.sandboxId });
      } catch (cleanupErr) {
        logger.warn('Sandbox cleanup failed', {
          evaluationId,
          sandboxId: ctx.sandboxId,
          error: String(cleanupErr),
        });
      }
    }
  }
}

// ── Worker with hard timeout ───────────────────────────────────────────────────
async function processJob(
  job: Job<EvaluationJobData, EvaluationJobResult>
): Promise<EvaluationJobResult> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Evaluation exceeded hard timeout of ${EVALUATION_TIMEOUT_MS}ms`)),
      EVALUATION_TIMEOUT_MS
    )
  );
  return Promise.race([runEvaluationPipeline(job), timeoutPromise]);
}

// ── Start worker ───────────────────────────────────────────────────────────────
logger.info('Evaluation worker starting…', { concurrency: WORKER_CONCURRENCY });

const worker = new Worker<EvaluationJobData, EvaluationJobResult>(
  EVALUATION_QUEUE_NAME,
  processJob,
  {
    connection: makeRedisConnection(),
    concurrency: WORKER_CONCURRENCY,
  }
);

worker.on('completed', (job, result) => {
  logger.info('Job completed', {
    jobId: job.id,
    evaluationId: result.evaluationId,
    finalScore: result.finalScore,
  });
});

worker.on('failed', (job, err) => {
  logger.error('Job failed', {
    jobId: job?.id,
    error: err.message,
  });
});

worker.on('error', (err) => {
  logger.error('Worker error', { error: err.message });
});

// ── Graceful shutdown ──────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully…`);
  await worker.close();
  await disconnectPrisma();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

logger.info(`Worker listening on queue: ${EVALUATION_QUEUE_NAME}`);

// ── Health-check HTTP server (keeps Render free tier alive) ───────────────────
// Render requires an open HTTP port; a free cron (cron-job.org) pings /health
// every 5 minutes to prevent the service from sleeping.
import { createServer } from 'http';
const PORT = process.env.PORT ?? 3001;
createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', queue: EVALUATION_QUEUE_NAME, ts: new Date().toISOString() }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT, () => {
  logger.info(`Health-check server listening on port ${PORT}`);
});
