/**
 * queue.ts — BullMQ queue definitions and job type contracts.
 *
 * Both the Next.js app (producer) and the evaluation worker (consumer)
 * import from this module to stay in sync on job shape.
 *
 * NOTE: The Next.js app imports from @/lib/evaluation-queue.ts which
 * re-exports the Queue instance. This file is the canonical source of
 * job types and queue configuration.
 */

import { Queue, QueueOptions } from 'bullmq';
import { REDIS_URL, EVALUATION_QUEUE_NAME } from './config.js';
import IORedis from 'ioredis';

// ── Job payload — sent when a student submits a project for evaluation ─────────
export interface EvaluationJobData {
  evaluationId:      string;   // Evaluation row ID (already created in DB, status="queued")
  submissionRecordId: string;  // SubmissionRecord row ID
  enrollmentId:      string;
  stageId:           string;
  repoUrl:           string;   // raw submitted URL
  normalizedRepoUrl: string;   // normalized form
  studentId:         string;
  domainSlug:        string;
  stageNumber:       number;
  totalStages:       number;
  // The locked project spec — fetched from StageGeneratedContent
  projectSpec: {
    problemStatement:  string;
    requirements:      string[];
    acceptanceCriteria: string[];
    estimatedEffort:   string;
  };
  // Resubmission context (undefined for first submission)
  resubmission?: {
    previousEvaluationId:  string;
    previousFinalScore:    number;
    previousCommitSha:     string;
  };
}

// ── Job result (stored in BullMQ, also persisted to Evaluation row) ───────────
export interface EvaluationJobResult {
  evaluationId: string;
  finalScore:   number;
  status:       'completed' | 'failed';
  errorMessage?: string;
}

// ── Queue options ─────────────────────────────────────────────────────────────
export function makeRedisConnection(): IORedis {
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  });
}

const QUEUE_OPTIONS: QueueOptions = {
  connection: makeRedisConnection(),
  defaultJobOptions: {
    attempts: 2,                // retry once on transient failure
    backoff: { type: 'fixed', delay: 30_000 }, // 30s between retries
    removeOnComplete: { count: 200 },  // keep last 200 completed jobs
    removeOnFail:    { count: 500 },   // keep last 500 failed jobs
  },
};

// Singleton queue instance — lazily created
let _queue: Queue<EvaluationJobData, EvaluationJobResult> | null = null;

export function getEvaluationQueue(): Queue<EvaluationJobData, EvaluationJobResult> {
  if (!_queue) {
    _queue = new Queue<EvaluationJobData, EvaluationJobResult>(
      EVALUATION_QUEUE_NAME,
      QUEUE_OPTIONS
    );
  }
  return _queue;
}

export { EVALUATION_QUEUE_NAME };
