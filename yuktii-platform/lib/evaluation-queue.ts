/**
 * lib/evaluation-queue.ts — BullMQ Queue singleton for the Next.js app.
 *
 * This is the PRODUCER side. The worker (evaluation-worker/) is the consumer.
 * The Next.js app uses this to enqueue evaluation jobs.
 *
 * Only instantiates the queue when Redis is available (REDIS_URL set).
 * Returns null otherwise — callers must handle the null case gracefully.
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Match job type expected by the worker
export interface EvaluationJobData {
  evaluationId:       string;
  submissionRecordId: string;
  enrollmentId:       string;
  stageId:            string;
  repoUrl:            string;
  normalizedRepoUrl:  string;
  studentId:          string;
  domainSlug:         string;
  stageNumber:        number;
  totalStages:        number;
  projectSpec: {
    problemStatement:   string;
    requirements:       string[];
    acceptanceCriteria: string[];
    estimatedEffort:    string;
  };
  resubmission?: {
    previousEvaluationId: string;
    previousFinalScore:   number;
    previousCommitSha:    string;
  };
}

const QUEUE_NAME = 'evaluation';

let _redis: IORedis | null = null;
let _queue: Queue<EvaluationJobData> | null = null;

function getRedisConnection(): IORedis | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  if (!_redis) {
    _redis = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }
  return _redis;
}

export function getEvaluationQueue(): Queue<EvaluationJobData> | null {
  const redis = getRedisConnection();
  if (!redis) return null;
  if (!_queue) {
    _queue = new Queue<EvaluationJobData>(QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 30_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return _queue;
}

export async function enqueueEvaluation(data: EvaluationJobData): Promise<string | null> {
  const queue = getEvaluationQueue();
  if (!queue) {
    console.error('[evaluation-queue] BullMQ enqueue failed — Redis not configured. Set REDIS_URL in environment.');
    return null;
  }
  try {
    const job = await queue.add('evaluate', data, {
      jobId: `eval-${data.evaluationId}`, // idempotent job ID
    });
    return job.id ?? null;
  } catch (err: any) {
    console.error('[evaluation-queue] BullMQ enqueue error:', err.message || err);
    return null;
  }
}

export { QUEUE_NAME as EVALUATION_QUEUE_NAME };
