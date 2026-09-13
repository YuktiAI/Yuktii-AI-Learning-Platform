/**
 * 07-git-history.ts — Stage 7: Git commit history analysis.
 *
 * Uses simple-git to extract commit metadata from the cloned repository.
 * Produces a plain-language development-process evidence summary.
 *
 * IMPORTANT: This is framed strictly as development-process evidence —
 * NOT as an "AI-generated code detector." The output focuses on:
 *  - Development timeline (incremental vs. bulk commits)
 *  - Commit message quality and descriptiveness
 *  - Number of files changed per commit (large single commits = less evidence of iterative work)
 *
 * This evidence is used as input to the scoring engine (devProcess category)
 * and is surfaced to students as engineering-process feedback only.
 */

import { simpleGit } from 'simple-git';
import * as path from 'path';
import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import type { PipelineContext, GitHistoryResult } from '../pipeline-context.js';

export async function analyzeGitHistory(ctx: PipelineContext): Promise<void> {
  const { evaluationId, sandboxId, sandboxRepoPath } = ctx;

  if (!sandboxRepoPath) {
    logger.warn('No repo path — skipping git history', { evaluationId, stage: 'gitHistory' });
    return;
  }

  logger.info('Analysing git history', { evaluationId, stage: 'gitHistory' });

  try {
    // Use the local path — in E2B mode this may be the mounted path, in local dev it's tmp
    // simple-git works on the filesystem path where the repo was cloned
    const repoPath = sandboxId?.startsWith(path.sep) || sandboxId?.includes(':\\')
      ? path.join(sandboxId, 'repo')  // local dev: sandboxId = tmpDir
      : sandboxRepoPath;              // E2B: use the path directly (may need rsync for local access)

    const git = simpleGit(repoPath);

    // Verify it's a git repo
    const isRepo = await git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      logger.warn('Cloned directory is not a git repo', { evaluationId, stage: 'gitHistory' });
      ctx.gitHistoryResult = buildEmptyResult('Not a git repository or git history not available.');
      return;
    }

    // Fetch commit log with stats
    const log = await git.log([
      '--all',
      '--format=%H|%ae|%at|%s',
      '--shortstat',
    ]);

    const allCommits = await git.log({ maxCount: 100 });
    const commits = allCommits.all;

    if (commits.length === 0) {
      ctx.gitHistoryResult = buildEmptyResult('No commits found in repository.');
      return;
    }

    // Parse timestamps
    const timestamps = commits.map(c => new Date(c.date).getTime()).filter(t => !isNaN(t));
    const firstCommitTs = timestamps.length > 0 ? Math.min(...timestamps) : null;
    const lastCommitTs  = timestamps.length > 0 ? Math.max(...timestamps) : null;

    const durationDays = firstCommitTs && lastCommitTs
      ? Math.max(1, Math.round((lastCommitTs - firstCommitTs) / (1000 * 60 * 60 * 24)))
      : 0;

    const avgCommitsPerDay = durationDays > 0 ? commits.length / durationDays : commits.length;

    // Extract commit messages (exclude merge commits for quality analysis)
    const commitMessages = commits
      .map(c => c.message.trim())
      .filter(m => m && !m.startsWith('Merge ') && m !== 'Initial commit')
      .slice(0, 20);

    // Detect large commits (>50 changed files) — less evidence of incremental work
    let largeCommitWarning = false;
    try {
      const diffStat = await git.raw(['log', '--shortstat', '--format=', '-20']);
      const fileChangeCounts = (diffStat.match(/(\d+) files? changed/g) ?? [])
        .map(m => parseInt(m, 10))
        .filter(n => !isNaN(n));
      largeCommitWarning = fileChangeCounts.some(n => n > 50);
    } catch { /* non-fatal */ }

    // Build plain-language summary (engineering-process framing, not AI detection)
    const summary = buildProcessSummary({
      commitCount:      commits.length,
      durationDays,
      avgCommitsPerDay,
      commitMessages,
      largeCommitWarning,
    });

    const result: GitHistoryResult = {
      commitCount:       commits.length,
      firstCommit:       firstCommitTs ? new Date(firstCommitTs).toISOString() : null,
      lastCommit:        lastCommitTs  ? new Date(lastCommitTs).toISOString()  : null,
      durationDays,
      avgCommitsPerDay:  Math.round(avgCommitsPerDay * 100) / 100,
      commitMessages,
      largeCommitWarning,
      summary,
    };

    ctx.gitHistoryResult = result;

    // Persist
    const prisma = getPrisma();
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: { gitHistoryAnalysis: JSON.stringify(result) },
    });

    logger.info('Git history analysis complete', {
      evaluationId,
      stage: 'gitHistory',
      commitCount: commits.length,
      durationDays,
    });
  } catch (err) {
    logger.warn('Git history analysis failed', { evaluationId, stage: 'gitHistory', error: String(err) });
    ctx.gitHistoryResult = buildEmptyResult(`Git analysis encountered an error: ${String(err)}`);
  }
}

function buildProcessSummary(data: {
  commitCount:      number;
  durationDays:     number;
  avgCommitsPerDay: number;
  commitMessages:   string[];
  largeCommitWarning: boolean;
}): string {
  const parts: string[] = [];

  // Development timeline
  if (data.durationDays === 0) {
    parts.push(`The project has ${data.commitCount} commit(s) all on the same day, indicating it was submitted without iterative development.`);
  } else if (data.commitCount <= 3) {
    parts.push(`The project has only ${data.commitCount} commit(s) over ${data.durationDays} day(s). This shows limited version control usage — more frequent, smaller commits typically demonstrate iterative development.`);
  } else {
    parts.push(`The project has ${data.commitCount} commits spread over ${data.durationDays} day(s) (avg ${data.avgCommitsPerDay.toFixed(1)} commits/day).`);
    if (data.avgCommitsPerDay >= 1) {
      parts.push('This shows consistent, iterative development activity.');
    } else {
      parts.push('The commit frequency is relatively low, suggesting work was done in larger batches.');
    }
  }

  // Commit message quality
  const descriptiveMessages = data.commitMessages.filter(m => m.split(' ').length >= 3 && m.length > 10);
  if (descriptiveMessages.length > data.commitMessages.length * 0.7) {
    parts.push('Commit messages are generally descriptive, providing good documentation of development decisions.');
  } else if (data.commitMessages.length > 0) {
    parts.push('Commit messages could be more descriptive — meaningful commit messages help demonstrate the progression of your work.');
  }

  // Large commit warning
  if (data.largeCommitWarning) {
    parts.push('One or more commits contain a very large number of file changes, which may indicate code was added in bulk rather than developed incrementally.');
  }

  return parts.join(' ');
}

function buildEmptyResult(reason: string): GitHistoryResult {
  return {
    commitCount:       0,
    firstCommit:       null,
    lastCommit:        null,
    durationDays:      0,
    avgCommitsPerDay:  0,
    commitMessages:    [],
    largeCommitWarning: false,
    summary:           reason,
  };
}
