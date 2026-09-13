/**
 * pipeline-context.ts — Shared mutable context object passed through every pipeline stage.
 *
 * Rather than passing individual variables through every function, each stage
 * reads and writes to a shared PipelineContext. This makes it easy to pass
 * intermediate results (e.g. OpenHands findings → mini-SWE-agent) without
 * coupling pipeline stages directly to each other.
 */

import type { EvaluationJobData } from './queue.js';

// ── Types for pipeline intermediate results ────────────────────────────────────

export interface DeterministicCheckResult {
  filesPresent:       boolean;
  readmeFound:        boolean;
  buildSucceeds:      boolean;
  testsRun:           boolean;
  testsPassCount:     number;
  testsFailCount:     number;
  endpointsFound:     string[];
  rawOutput:          string;
  checksPassedCount:  number;
  checksTotalCount:   number;
  passFraction:       number; // 0.0 – 1.0
}

export interface OpenHandsFinding {
  claim:     string;       // e.g. "Authentication appears incomplete"
  severity:  'high' | 'medium' | 'low';
  filePaths: string[];     // relevant files if identified
}

export interface OpenHandsResult {
  summary:       string;
  flaggedIssues: OpenHandsFinding[];
  rawLog:        string;
  skipped:       boolean;  // true if deterministic gate prevented agent execution
  gaveUp?:       boolean;  // true if agent exceeded max iterations without convergence
  trajectory?:   Array<{ step: number; agent: string; action: string; summary: string; timestamp: string }>;
}

export interface SweAgentFinding {
  originalClaim: string;
  verdict:       'confirmed' | 'partially_confirmed' | 'not_found' | 'already_implemented';
  fileEvidence:  Array<{
    file:      string;
    function?: string;
    lineRange?: string;
    snippet?:  string;
  }>;
  conclusion: string;
  gaveUp?:    boolean;
}

export interface GitHistoryResult {
  commitCount:       number;
  firstCommit:       string | null;  // ISO date string
  lastCommit:        string | null;
  durationDays:      number;
  avgCommitsPerDay:  number;
  commitMessages:    string[];
  largeCommitWarning: boolean;  // true if any commit touches >50 files
  summary:           string;    // plain-language development process summary
}

export type RequirementStatus = 'PASS' | 'PARTIAL' | 'FAIL';

export interface RequirementResult {
  reqId:    string;
  reqText:  string;
  status:   RequirementStatus;
  evidence: string;
  missing:  string;
}

export interface CategoryScores {
  requirements:  number; // weight: 25
  functionality: number; // weight: 20
  codeQuality:   number; // weight: 15
  architecture:  number; // weight: 10
  devProcess:    number; // weight: 10
  testing:       number; // weight: 5
  documentation: number; // weight: 5
  security:      number; // weight: 5
  innovation:    number; // weight: 5
}

export interface MentorReport {
  score:        number;
  strengths:    string[];
  gaps:         string[];
  reasoning:    string;
  improvements: string[];
  nextSteps:    string[];
}

// ── The shared context ─────────────────────────────────────────────────────────

export interface PipelineContext {
  // Job metadata (read-only, set at start)
  job:            EvaluationJobData;
  evaluationId:   string;

  // Sandbox state
  sandboxRepoPath: string | null;   // local path where repo was cloned (inside sandbox)
  sandboxId:       string | null;   // E2B sandbox ID (for cleanup)

  // Pipeline outputs (populated by each stage)
  deterministicChecks:  DeterministicCheckResult | null;
  openHandsResult:      OpenHandsResult | null;
  sweAgentFindings:     SweAgentFinding[];
  gitHistoryResult:     GitHistoryResult | null;
  requirementResults:   RequirementResult[];
  categoryScores:       CategoryScores | null;
  finalScore:           number | null;
  mentorReport:         MentorReport | null;

  // Resubmission diff (populated if resubmission)
  repoCommitSha:        string | null;  // HEAD commit at evaluation time

  // Phase 2 Section 9 fields
  harnessType:          'narrow' | 'broad' | null;
  harnessVersion:       string | null;
  executionScore:       { passedCount: number; totalCount: number; details: any[] } | null;
  agentTrajectory:      Array<{ step: number; agent: string; action: string; summary: string; timestamp: string }>;
  sanityScore:          number | null;
  sanityDiff:           number | null;
  flaggedForHumanReview: boolean;
  humanReviewReason:    string | null;
  promptInjectionFlags: Array<{ pattern: string; location: string; snippet: string }>;

  // Error tracking
  stageErrors:          Record<string, string>;  // stage → error message
}

export function createPipelineContext(job: EvaluationJobData): PipelineContext {
  return {
    job,
    evaluationId:          job.evaluationId,
    sandboxRepoPath:       null,
    sandboxId:             null,
    deterministicChecks:   null,
    openHandsResult:       null,
    sweAgentFindings:      [],
    gitHistoryResult:      null,
    requirementResults:    [],
    categoryScores:        null,
    finalScore:            null,
    mentorReport:          null,
    repoCommitSha:         null,
    harnessType:           null,
    harnessVersion:        null,
    executionScore:        null,
    agentTrajectory:       [],
    sanityScore:           null,
    sanityDiff:            null,
    flaggedForHumanReview: false,
    humanReviewReason:     null,
    promptInjectionFlags:  [],
    stageErrors:           {},
  };
}
