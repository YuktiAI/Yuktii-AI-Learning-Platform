/** Git commit history analysis for the cloned submission repository. */

import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import { runCommandInSandbox } from '../sandbox/e2b-sandbox.js';
import type { PipelineContext, GitHistoryResult } from '../pipeline-context.js';

type Commit = { date: string; message: string };

export async function analyzeGitHistory(ctx: PipelineContext): Promise<void> {
  const { evaluationId, sandboxId, sandboxRepoPath } = ctx;
  if (!sandboxId || !sandboxRepoPath) {
    logger.warn('No sandbox repo path; skipping git history', { evaluationId, stage: 'gitHistory' });
    return;
  }

  logger.info('Analysing git history', { evaluationId, stage: 'gitHistory' });

  try {
    // An E2B path (for example /home/user/repo) is not present in the Render
    // worker's filesystem. Always execute git inside the active sandbox.
    const gitPrefix = `git -C "${sandboxRepoPath.replace(/"/g, '\\"')}"`;
    const repoCheck = await runCommandInSandbox(sandboxId, `${gitPrefix} rev-parse --is-inside-work-tree`);
    if (repoCheck.exitCode !== 0 || repoCheck.stdout.trim() !== 'true') {
      logger.warn('Cloned directory is not a git repo', { evaluationId, stage: 'gitHistory' });
      ctx.gitHistoryResult = buildEmptyResult('Not a git repository or git history not available.');
      return;
    }

    const logResult = await runCommandInSandbox(
      sandboxId,
      `${gitPrefix} log --all -100 --format=%H%x1f%aI%x1f%s`,
    );
    if (logResult.exitCode !== 0) {
      throw new Error(`Unable to read git log: ${logResult.stderr || logResult.stdout}`);
    }
    const commits = parseCommits(logResult.stdout);
    if (commits.length === 0) {
      ctx.gitHistoryResult = buildEmptyResult('No commits found in repository.');
      return;
    }

    const timestamps = commits.map((commit) => new Date(commit.date).getTime()).filter((time) => !isNaN(time));
    const firstCommitTs = timestamps.length > 0 ? Math.min(...timestamps) : null;
    const lastCommitTs = timestamps.length > 0 ? Math.max(...timestamps) : null;
    const durationDays = firstCommitTs && lastCommitTs
      ? Math.max(1, Math.round((lastCommitTs - firstCommitTs) / 86_400_000))
      : 0;
    const avgCommitsPerDay = durationDays > 0 ? commits.length / durationDays : commits.length;
    const commitMessages = commits
      .map((commit) => commit.message.trim())
      .filter((message) => message && !message.startsWith('Merge ') && message !== 'Initial commit')
      .slice(0, 20);

    const diffStatResult = await runCommandInSandbox(sandboxId, `${gitPrefix} log --shortstat --format= -20`);
    const fileChangeCounts = (diffStatResult.stdout.match(/(\d+) files? changed/g) ?? [])
      .map((match) => parseInt(match, 10))
      .filter((count) => !isNaN(count));
    const largeCommitWarning = fileChangeCounts.some((count) => count > 50);

    const result: GitHistoryResult = {
      commitCount: commits.length,
      firstCommit: firstCommitTs ? new Date(firstCommitTs).toISOString() : null,
      lastCommit: lastCommitTs ? new Date(lastCommitTs).toISOString() : null,
      durationDays,
      avgCommitsPerDay: Math.round(avgCommitsPerDay * 100) / 100,
      commitMessages,
      largeCommitWarning,
      summary: buildProcessSummary({ commitCount: commits.length, durationDays, avgCommitsPerDay, commitMessages, largeCommitWarning }),
    };

    ctx.gitHistoryResult = result;
    await getPrisma().evaluation.update({
      where: { id: evaluationId },
      data: { gitHistoryAnalysis: JSON.stringify(result) },
    });
    logger.info('Git history analysis complete', { evaluationId, stage: 'gitHistory', commitCount: commits.length, durationDays });
  } catch (err) {
    logger.warn('Git history analysis failed', { evaluationId, stage: 'gitHistory', error: String(err) });
    ctx.gitHistoryResult = buildEmptyResult(`Git analysis encountered an error: ${String(err)}`);
  }
}

function parseCommits(output: string): Commit[] {
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [, date = '', message = ''] = line.split('\x1f');
    return { date, message };
  });
}

function buildProcessSummary(data: {
  commitCount: number;
  durationDays: number;
  avgCommitsPerDay: number;
  commitMessages: string[];
  largeCommitWarning: boolean;
}): string {
  const parts: string[] = [];
  if (data.durationDays === 0) {
    parts.push(`The project has ${data.commitCount} commit(s) all on the same day, indicating it was submitted without iterative development.`);
  } else if (data.commitCount <= 3) {
    parts.push(`The project has only ${data.commitCount} commit(s) over ${data.durationDays} day(s). This shows limited version control usage - more frequent, smaller commits typically demonstrate iterative development.`);
  } else {
    parts.push(`The project has ${data.commitCount} commits spread over ${data.durationDays} day(s) (avg ${data.avgCommitsPerDay.toFixed(1)} commits/day).`);
    parts.push(data.avgCommitsPerDay >= 1
      ? 'This shows consistent, iterative development activity.'
      : 'The commit frequency is relatively low, suggesting work was done in larger batches.');
  }

  const descriptiveMessages = data.commitMessages.filter((message) => message.split(' ').length >= 3 && message.length > 10);
  if (descriptiveMessages.length > data.commitMessages.length * 0.7) {
    parts.push('Commit messages are generally descriptive, providing good documentation of development decisions.');
  } else if (data.commitMessages.length > 0) {
    parts.push('Commit messages could be more descriptive - meaningful commit messages help demonstrate the progression of your work.');
  }
  if (data.largeCommitWarning) {
    parts.push('One or more commits contain a very large number of file changes, which may indicate code was added in bulk rather than developed incrementally.');
  }
  return parts.join(' ');
}

function buildEmptyResult(reason: string): GitHistoryResult {
  return {
    commitCount: 0,
    firstCommit: null,
    lastCommit: null,
    durationDays: 0,
    avgCommitsPerDay: 0,
    commitMessages: [],
    largeCommitWarning: false,
    summary: reason,
  };
}
