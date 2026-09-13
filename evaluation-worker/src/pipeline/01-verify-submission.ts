/**
 * 01-verify-submission.ts — Stage 1: Verify submission URL + duplicate detection.
 *
 * Validates:
 *  - URL is reachable and is a public GitHub repository
 *  - Fetches GitHub's numeric repo ID (repositoryId) for reliable duplicate detection
 *  - Checks SubmissionRecord for prior submissions from this enrollment (same repo)
 *  - If resubmission found, links previousSubmissionId and sets up resubmission context
 *
 * On success: ctx.repoCommitSha is populated.
 * On failure: throws an Error (worker marks evaluation as failed).
 */

import axios from 'axios';
import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import { GITHUB_TOKEN } from '../config.js';
import type { PipelineContext } from '../pipeline-context.js';

const GITHUB_API_BASE = 'https://api.github.com';

// Build Axios headers — include token if available to avoid 60 req/hr anonymous limit
function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'yuktii-evaluation-worker/1.0',
  };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  }
  return headers;
}

// Normalise a GitHub URL to owner/repo form
// Handles: https://github.com/owner/repo, https://github.com/owner/repo.git,
//          http://github.com/owner/repo/, git@github.com:owner/repo.git
export function extractGitHubOwnerRepo(url: string): { owner: string; repo: string } | null {
  try {
    // SSH form: git@github.com:owner/repo.git
    const sshMatch = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

    const parsed = new URL(url);
    if (!['github.com', 'www.github.com'].includes(parsed.hostname.toLowerCase())) return null;

    // Path: /owner/repo or /owner/repo.git
    const parts = parsed.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

// Normalize repo URL to a canonical string for duplicate detection
export function normalizeRepoUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .trim();
}

interface GitHubRepoResponse {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
}

interface GitHubBranchResponse {
  commit: { sha: string };
}

export async function verifySubmission(ctx: PipelineContext): Promise<void> {
  const { job, evaluationId } = ctx;
  const { repoUrl, enrollmentId, stageId } = job;
  const prisma = getPrisma();

  logger.info('Verifying submission URL', { evaluationId, stage: 'verify', repoUrl });

  // ── 1. Extract owner/repo from URL ──────────────────────────────────────────
  const ownerRepo = extractGitHubOwnerRepo(repoUrl);
  if (!ownerRepo) {
    throw new Error(
      `Invalid GitHub URL: "${repoUrl}". Please submit a public GitHub repository URL ` +
      `(e.g. https://github.com/username/repo-name).`
    );
  }

  const { owner, repo } = ownerRepo;
  logger.info('Parsed GitHub repo', { evaluationId, stage: 'verify', owner, repo });

  // ── 2. Fetch repo metadata from GitHub API ───────────────────────────────────
  let repoData: GitHubRepoResponse;
  try {
    const response = await axios.get<GitHubRepoResponse>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}`,
      { headers: githubHeaders(), timeout: 15_000 }
    );
    repoData = response.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 404) {
        throw new Error(
          `Repository not found or is private: github.com/${owner}/${repo}. ` +
          `Ensure the repository exists and is set to "Public".`
        );
      }
      if (err.response?.status === 403) {
        throw new Error(
          `GitHub API rate limit hit. Please retry in a few minutes.`
        );
      }
    }
    throw new Error(`Failed to reach GitHub API: ${String(err)}`);
  }

  if (repoData.private) {
    throw new Error(
      `Repository github.com/${owner}/${repo} is private. ` +
      `Please make it public before submitting.`
    );
  }

  const repositoryId = String(repoData.id);
  logger.info('GitHub repo validated', {
    evaluationId,
    stage: 'verify',
    repoFullName: repoData.full_name,
    repositoryId,
  });

  // ── 3. Fetch HEAD commit SHA for the default branch ───────────────────────────
  let headCommitSha: string;
  try {
    const branchRes = await axios.get<GitHubBranchResponse>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/branches/${repoData.default_branch}`,
      { headers: githubHeaders(), timeout: 15_000 }
    );
    headCommitSha = branchRes.data.commit.sha;
  } catch {
    // Non-fatal — continue without commit SHA
    headCommitSha = 'unknown';
    logger.warn('Could not fetch HEAD commit SHA', { evaluationId, stage: 'verify' });
  }

  ctx.repoCommitSha = headCommitSha;
  const normalizedRepoUrl = normalizeRepoUrl(repoUrl);

  // ── 4. Duplicate / resubmission detection (Section 9.6 Plagiarism Gate) ──────
  // Check A: Cross-student duplicate detection (Plagiarism Gate)
  const crossStudentDuplicate = await prisma.submissionRecord.findFirst({
    where: {
      enrollmentId: { not: enrollmentId },
      stageId,
      OR: [
        { normalizedRepoUrl },
        { repositoryId },
      ],
    },
    include: { enrollment: { include: { student: true } } },
  });

  if (crossStudentDuplicate) {
    logger.warn('Plagiarism gate triggered: identical repository submitted by another student', {
      evaluationId,
      originalStudentEmail: crossStudentDuplicate.enrollment?.student?.email,
      normalizedRepoUrl,
      repositoryId,
    });
    ctx.flaggedForHumanReview = true;
    ctx.humanReviewReason = 'duplicate_submission';
  }

  // Check B: Look for a prior SubmissionRecord from the SAME enrollment + stage with the
  // same normalizedRepoUrl OR the same repositoryId (legitimate student resubmission).
  const priorRecord = await prisma.submissionRecord.findFirst({
    where: {
      enrollmentId,
      stageId,
      OR: [
        { normalizedRepoUrl },
        { repositoryId },
      ],
      // Exclude the current SubmissionRecord (already created by the API route)
      NOT: { id: job.submissionRecordId },
    },
    orderBy: { submittedAt: 'desc' },
    include: { evaluation: true },
  });

  // ── 5. Update the current SubmissionRecord with fetched metadata ──────────────
  await prisma.submissionRecord.update({
    where: { id: job.submissionRecordId },
    data: {
      normalizedRepoUrl,
      repositoryId,
      commitSha: headCommitSha,
      previousSubmissionId: priorRecord?.id ?? null,
    },
  });

  // ── 6. Set up resubmission context if prior evaluation exists ─────────────────
  if (priorRecord?.evaluation && priorRecord.evaluation.status === 'completed') {
    const prevEval = priorRecord.evaluation;
    logger.info('Resubmission detected', {
      evaluationId,
      stage: 'verify',
      previousEvaluationId: prevEval.id,
      previousScore: prevEval.finalScore,
    });

    // Update the Evaluation row with previous reference
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: { previousEvaluationId: prevEval.id },
    });

    // Extend job data with resubmission context (in-memory, for pipeline stages)
    (job as any).resubmission = {
      previousEvaluationId: prevEval.id,
      previousFinalScore:   prevEval.finalScore ?? 0,
      previousCommitSha:    priorRecord.commitSha ?? 'unknown',
    };
  }

  logger.info('Submission verified successfully', {
    evaluationId,
    stage: 'verify',
    headCommitSha,
    isResubmission: Boolean(priorRecord?.evaluation),
  });
}
