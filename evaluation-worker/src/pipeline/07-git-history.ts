/**
 * 07-git-history.ts — Git commit history analysis (Workstream C: hardened v2.0)
 *
 * Changes from v1.0:
 *  - Reads up to 500 commits with full metadata: %H %aI %cI %an %ae %s
 *  - Duration allows 0 days (same-day burst = 0 days, not minimum 1)
 *  - Descriptive commit ratio: >=70% => +10, <20% => -10
 *  - Trivial commit filtering: commits with 0 insertions+deletions excluded from count
 *  - Bulk dump: excludes lockfiles, vendor/build dirs, and exempts root commit
 *  - Author vs committer date discrepancy: |authorDate - committerDate| > 48h = flag
 *  - Fork filtering: only post-fork commits counted if isFork===true
 *  - Spec milestone artifact check against gitDevelopmentPlan
 *  - gitEvalVersion: 'v2.0' recorded on every result
 */

import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import { runCommandInSandbox } from '../sandbox/e2b-sandbox.js';
import type { PipelineContext, GitHistoryResult } from '../pipeline-context.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const GIT_EVAL_VERSION = 'v2.0';
const MAX_COMMITS = 500;

// File/directory patterns that are auto-generated and must be excluded from bulk-dump analysis
const SCAFFOLD_PATTERNS = [
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'Cargo.lock',
  'composer.lock', 'Gemfile.lock', 'go.sum', 'requirements.txt',
  'node_modules/', 'dist/', '.next/', 'build/', 'vendor/', '__pycache__/',
  '.gradle/', 'target/', 'coverage/', '.nyc_output/', 'out/', 'public/build/',
  'static/dist/', 'assets/build/', '.turbo/', '.vercel/', '.cache/',
  'migrations/', // Odoo/Django auto-migrations — they're generated, not hand-crafted
];

// Placeholder commit subjects that are not descriptive
const PLACEHOLDER_MESSAGES = new Set([
  'initial commit', 'init', 'first commit', 'update', 'fix', 'wip', 'test',
  'commit', 'add files', 'add file', 'changes', 'misc', 'stuff', 'temp', 'tmp',
  'work in progress', 'progress', 'done', 'complete', 'final', 'cleanup',
  'updates', 'fixes', 'minor fixes', 'small fixes', 'refactor', 'refactoring',
]);

// ─── Helper: classify a commit subject as descriptive ───────────────────────

function isDescriptiveMessage(subject: string): boolean {
  const s = subject.trim().toLowerCase();
  if (!s || s.length < 10) return false;
  if (s.startsWith('merge ') || s.startsWith('merged ')) return false;
  if (PLACEHOLDER_MESSAGES.has(s)) return false;
  const words = s.split(/\s+/).filter(Boolean);
  return words.length >= 3; // at least 3 meaningful words
}

// ─── Helper: check if a file path is a scaffold/generated file ────────────

function isScaffoldPath(filePath: string): boolean {
  const p = filePath.toLowerCase().replace(/\\/g, '/');
  return SCAFFOLD_PATTERNS.some((pattern) => {
    if (pattern.endsWith('/')) return p.includes(pattern) || p.startsWith(pattern);
    return p === pattern || p.endsWith('/' + pattern);
  });
}

// ─── Helper: detect bulk upload considering scaffold exclusions ──────────────

function detectBulkUpload(
  commits: Array<{ date: string; message: string; isRoot: boolean }>,
  durationDays: number,
): { suspectBulkUpload: boolean; commitDensitySpike: boolean } {
  if (commits.length === 0) return { suspectBulkUpload: false, commitDensitySpike: false };

  const dayCounts: Record<string, number> = {};
  for (const c of commits) {
    const day = c.date.slice(0, 10);
    if (day && day.length === 10) dayCounts[day] = (dayCounts[day] ?? 0) + 1;
  }
  const maxDayCount = Math.max(...Object.values(dayCounts));
  const suspectBulkUpload = maxDayCount / commits.length > 0.4 && commits.length >= 3;
  const commitDensitySpike = durationDays === 0 && commits.length > 5;
  return { suspectBulkUpload, commitDensitySpike };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function analyzeGitHistory(ctx: PipelineContext): Promise<void> {
  const { evaluationId, sandboxId, sandboxRepoPath } = ctx;
  if (!sandboxId || !sandboxRepoPath) {
    logger.warn('No sandbox repo path; skipping git history', { evaluationId, stage: 'gitHistory' });
    return;
  }

  logger.info('Analysing git history (v2.0 hardened)', { evaluationId, stage: 'gitHistory' });

  try {
    const gitPrefix = `git -C "${sandboxRepoPath.replace(/"/g, '\\"')}"`;
    const repoCheck = await runCommandInSandbox(sandboxId, `${gitPrefix} rev-parse --is-inside-work-tree`);
    if (repoCheck.exitCode !== 0 || repoCheck.stdout.trim() !== 'true') {
      logger.warn('Cloned directory is not a git repo', { evaluationId, stage: 'gitHistory' });
      ctx.gitHistoryResult = buildEmptyResult('Not a git repository or git history not available.', ctx);
      return;
    }

    // ── 1. Read up to 500 commits with extended format ─────────────────────────
    // %H=sha, %aI=authorDateISO, %cI=committerDateISO, %an=authorName, %ae=authorEmail, %s=subject
    const logResult = await runCommandInSandbox(
      sandboxId,
      `${gitPrefix} log --all -${MAX_COMMITS} --format=%H%x1f%aI%x1f%cI%x1f%an%x1f%ae%x1f%s`,
    );
    if (logResult.exitCode !== 0) {
      throw new Error(`Unable to read git log: ${logResult.stderr || logResult.stdout}`);
    }

    const allCommits = parseCommits(logResult.stdout);
    if (allCommits.length === 0) {
      ctx.gitHistoryResult = buildEmptyResult('No commits found in repository.', ctx);
      return;
    }

    // ── 2. Fork filtering: only count post-fork commits if repo is a fork ─────
    let commits = allCommits;
    if (ctx.isFork && ctx.forkCreatedAt) {
      const forkTs = new Date(ctx.forkCreatedAt).getTime();
      const postFork = allCommits.filter((c) => {
        const ts = new Date(c.authorDate).getTime();
        return !isNaN(ts) && ts >= forkTs;
      });
      if (postFork.length > 0) {
        commits = postFork;
        logger.info('Fork filtering applied', {
          evaluationId, totalCommits: allCommits.length, postForkCommits: commits.length,
        });
      }
      // If no post-fork commits at all, use all commits (benefit of the doubt)
    }

    // ── 3. Author/committer date discrepancy check (> 48h = backdated/rebased) ─
    const DISCREPANCY_THRESHOLD_MS = 48 * 60 * 60 * 1000;
    const authorCommitterDiscrepancy = commits.some((c) => {
      const aTs = new Date(c.authorDate).getTime();
      const cTs = new Date(c.committerDate).getTime();
      if (isNaN(aTs) || isNaN(cTs)) return false;
      return Math.abs(aTs - cTs) > DISCREPANCY_THRESHOLD_MS;
    });

    // ── 4. Trivial commit detection via --numstat ─────────────────────────────
    // Commits with 0 insertions AND 0 deletions are whitespace-only or empty; exclude them
    const numstatResult = await runCommandInSandbox(
      sandboxId,
      `${gitPrefix} log --numstat --format=%H -${MAX_COMMITS}`,
    );
    const trivialShas = new Set<string>();
    if (numstatResult.exitCode === 0) {
      let currentSha = '';
      let hasChanges = false;
      for (const line of numstatResult.stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) {
          // End of a commit block
          if (currentSha && !hasChanges) trivialShas.add(currentSha);
          currentSha = '';
          hasChanges = false;
          continue;
        }
        if (/^[0-9a-f]{40}$/i.test(trimmed)) {
          if (currentSha && !hasChanges) trivialShas.add(currentSha);
          currentSha = trimmed;
          hasChanges = false;
        } else {
          // numstat line: "insertions deletions filename"
          const parts = trimmed.split('\t');
          const ins = parseInt(parts[0] ?? '0', 10);
          const del = parseInt(parts[1] ?? '0', 10);
          if ((ins > 0 || del > 0) && !isNaN(ins) && !isNaN(del)) hasChanges = true;
        }
      }
      if (currentSha && !hasChanges) trivialShas.add(currentSha);
    }

    // Filter out trivial commits from the working set
    const nonTrivialCommits = commits.filter((c) => !trivialShas.has(c.sha));
    const trivialCommitCount = commits.length - nonTrivialCommits.length;

    // ── 5. Duration calculation (allow 0 days) ────────────────────────────────
    const timestamps = nonTrivialCommits
      .map((c) => new Date(c.authorDate).getTime())
      .filter((t) => !isNaN(t));
    const firstCommitTs = timestamps.length > 0 ? Math.min(...timestamps) : null;
    const lastCommitTs  = timestamps.length > 0 ? Math.max(...timestamps) : null;

    // Workstream C: allow durationDays = 0 (same-day burst), not min(1)
    const durationDays = firstCommitTs && lastCommitTs
      ? Math.floor((lastCommitTs - firstCommitTs) / 86_400_000)
      : 0;

    const avgCommitsPerDay = durationDays > 0
      ? nonTrivialCommits.length / durationDays
      : nonTrivialCommits.length;

    // ── 6. Descriptive commit ratio ───────────────────────────────────────────
    const nonMergeCommits = nonTrivialCommits.filter(
      (c) => !c.subject.toLowerCase().startsWith('merge ')
    );
    const descriptiveCommits = nonMergeCommits.filter((c) => isDescriptiveMessage(c.subject));
    const descriptiveCommitRatio = nonMergeCommits.length > 0
      ? descriptiveCommits.length / nonMergeCommits.length
      : null;

    // Sample up to 20 non-trivial commit subjects for scoring context
    const commitMessages = nonTrivialCommits
      .map((c) => c.subject.trim())
      .filter(Boolean)
      .slice(0, 20);

    // ── 7. Bulk-dump detection with scaffold/lockfile exclusions ─────────────
    // Get the root commit SHA for exemption
    const rootResult = await runCommandInSandbox(
      sandboxId,
      `${gitPrefix} rev-list --max-parents=0 HEAD`,
    );
    const rootSha = rootResult.stdout.trim().split('\n')[0] ?? '';

    // Get file change counts per commit, excluding scaffold paths and root
    const diffStatResult = await runCommandInSandbox(
      sandboxId,
      `${gitPrefix} log --format=%H --name-only -${MAX_COMMITS}`,
    );

    let currentSha2 = '';
    const nonScaffoldFileCounts: number[] = [];

    if (diffStatResult.exitCode === 0) {
      let fileCount = 0;
      const processCommit = () => {
        if (currentSha2 && currentSha2 !== rootSha) {
          nonScaffoldFileCounts.push(fileCount);
        }
        fileCount = 0;
      };

      for (const line of diffStatResult.stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) {
          processCommit();
          currentSha2 = '';
        } else if (/^[0-9a-f]{40}$/i.test(trimmed)) {
          if (currentSha2) processCommit();
          currentSha2 = trimmed;
        } else {
          // A filename line — count only non-scaffold files
          if (!isScaffoldPath(trimmed)) fileCount++;
        }
      }
      if (currentSha2) processCommit();
    }

    const largeCommitWarning = nonScaffoldFileCounts.some((count) => count > 50);
    const { suspectBulkUpload, commitDensitySpike } = detectBulkUpload(
      nonTrivialCommits.map((c) => ({ date: c.authorDate, message: c.subject, isRoot: c.sha === rootSha })),
      durationDays,
    );

    // ── 8. Spec milestone artifact check ─────────────────────────────────────
    let specMilestoneCheck: Array<{ milestone: string; artifactsFound: string[]; passed: boolean }> | null = null;
    try {
      const spec = ctx.job.projectSpec;
      if ((spec as any).gitDevelopmentPlan && Array.isArray((spec as any).gitDevelopmentPlan)) {
        const plan: Array<{ milestone: string; expectedArtifacts: string[] }> = (spec as any).gitDevelopmentPlan;
        const allChangedFiles = new Set<string>();

        // Get the complete list of files ever touched across all commits
        const allFilesResult = await runCommandInSandbox(
          sandboxId,
          `${gitPrefix} log --name-only --format= -${MAX_COMMITS}`,
        );
        if (allFilesResult.exitCode === 0) {
          for (const line of allFilesResult.stdout.split(/\r?\n/)) {
            const f = line.trim();
            if (f) allChangedFiles.add(f.toLowerCase());
          }
        }

        specMilestoneCheck = plan.map(({ milestone, expectedArtifacts }) => {
          const artifactsFound = expectedArtifacts.filter((artifact) => {
            const a = artifact.toLowerCase();
            return (
              allChangedFiles.has(a) ||
              [...allChangedFiles].some((f) => f.includes(a) || a.includes(f))
            );
          });
          return {
            milestone,
            artifactsFound,
            passed: artifactsFound.length > 0 || expectedArtifacts.length === 0,
          };
        });
      }
    } catch (specErr) {
      logger.warn('Spec milestone check failed', { evaluationId, error: String(specErr) });
    }

    // ── 9. Assemble result ────────────────────────────────────────────────────
    const result: GitHistoryResult = {
      commitCount:               nonTrivialCommits.length,
      firstCommit:               firstCommitTs ? new Date(firstCommitTs).toISOString() : null,
      lastCommit:                lastCommitTs  ? new Date(lastCommitTs).toISOString()  : null,
      durationDays,
      avgCommitsPerDay:          Math.round(avgCommitsPerDay * 100) / 100,
      commitMessages,
      largeCommitWarning,
      suspectBulkUpload,
      commitDensitySpike,
      descriptiveCommitRatio,
      trivialCommitCount,
      authorCommitterDiscrepancy,
      isFork:                    ctx.isFork,
      forkParent:                ctx.forkParent,
      specMilestoneCheck,
      gitEvalVersion:            GIT_EVAL_VERSION,
      summary: buildProcessSummary({
        commitCount: nonTrivialCommits.length,
        durationDays,
        avgCommitsPerDay,
        commitMessages,
        largeCommitWarning,
        suspectBulkUpload,
        commitDensitySpike,
        descriptiveCommitRatio,
        trivialCommitCount,
        authorCommitterDiscrepancy,
        isFork: ctx.isFork,
        forkParent: ctx.forkParent,
      }),
    };

    ctx.gitHistoryResult = result;
    await getPrisma().evaluation.update({
      where: { id: evaluationId },
      data: {
        gitHistoryAnalysis: JSON.stringify(result),
        gitEvalVersion: GIT_EVAL_VERSION,
        ...(specMilestoneCheck ? { specMilestoneCheck: JSON.stringify(specMilestoneCheck) } : {}),
      },
    });

    logger.info('Git history analysis complete (v2.0)', {
      evaluationId,
      stage: 'gitHistory',
      commitCount: nonTrivialCommits.length,
      trivialCommitCount,
      durationDays,
      descriptiveCommitRatio: descriptiveCommitRatio?.toFixed(2),
      isFork: ctx.isFork,
      authorCommitterDiscrepancy,
    });
  } catch (err) {
    logger.warn('Git history analysis failed', { evaluationId, stage: 'gitHistory', error: String(err) });
    ctx.gitHistoryResult = buildEmptyResult(`Git analysis encountered an error: ${String(err)}`, ctx);
  }
}

// ─── Parsers ────────────────────────────────────────────────────────────────

interface ParsedCommit {
  sha:           string;
  authorDate:    string;
  committerDate: string;
  authorName:    string;
  authorEmail:   string;
  subject:       string;
}

function parseCommits(output: string): ParsedCommit[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sha = '', authorDate = '', committerDate = '', authorName = '', authorEmail = '', ...rest] = line.split('\x1f');
      return { sha, authorDate, committerDate, authorName, authorEmail, subject: rest.join('\x1f') };
    })
    .filter((c) => c.sha.length > 0);
}

// ─── Plain-language summary builder ─────────────────────────────────────────

function buildProcessSummary(data: {
  commitCount:               number;
  durationDays:              number;
  avgCommitsPerDay:          number;
  commitMessages:            string[];
  largeCommitWarning:        boolean;
  suspectBulkUpload:         boolean;
  commitDensitySpike:        boolean;
  descriptiveCommitRatio:    number | null;
  trivialCommitCount:        number;
  authorCommitterDiscrepancy: boolean;
  isFork:                    boolean;
  forkParent:                string | null;
}): string {
  const parts: string[] = [];

  if (data.isFork && data.forkParent) {
    parts.push(`This repository is a fork of ${data.forkParent}. Only commits made after forking have been analysed.`);
  }

  if (data.commitDensitySpike) {
    parts.push(
      `All ${data.commitCount} commits appear to have been pushed in a single session. This suggests the code was ` +
      `developed elsewhere and uploaded at once rather than committed incrementally. ` +
      `Iterative, frequent commits significantly improve your dev process score.`,
    );
  } else if (data.durationDays === 0 && data.commitCount > 0) {
    parts.push(
      `The project has ${data.commitCount} commit(s) all on the same day, ` +
      `indicating it was submitted without iterative development.`,
    );
  } else if (data.commitCount <= 3) {
    parts.push(
      `The project has only ${data.commitCount} commit(s) over ${data.durationDays} day(s). ` +
      `More frequent, smaller commits typically demonstrate iterative development.`,
    );
  } else {
    parts.push(
      `The project has ${data.commitCount} meaningful commits spread over ${data.durationDays} day(s) ` +
      `(avg ${data.avgCommitsPerDay.toFixed(1)} commits/day).`,
    );
    parts.push(
      data.avgCommitsPerDay >= 1
        ? 'This shows consistent, iterative development activity.'
        : 'The commit frequency is relatively low, suggesting work was done in larger batches.',
    );
  }

  if (data.suspectBulkUpload && !data.commitDensitySpike) {
    parts.push(
      'More than 40% of commits were made on a single day. This bulk-commit pattern may indicate ' +
      'code was developed outside version control and added at once.',
    );
  }

  if (data.trivialCommitCount > 0) {
    parts.push(
      `${data.trivialCommitCount} trivial commit(s) with no file changes were excluded from the analysis.`,
    );
  }

  // Descriptive commit ratio feedback
  if (data.descriptiveCommitRatio !== null) {
    const pct = Math.round(data.descriptiveCommitRatio * 100);
    if (data.descriptiveCommitRatio >= 0.7) {
      parts.push(
        `${pct}% of commit messages are descriptive — excellent practice that documents your development decisions.`,
      );
    } else if (data.descriptiveCommitRatio < 0.2) {
      parts.push(
        `Only ${pct}% of commit messages are descriptive. Meaningful commit messages (at least 3 words describing what changed and why) significantly improve your score.`,
      );
    } else {
      parts.push(
        `${pct}% of commit messages are descriptive. Aim for 70%+ to maximise your dev process score.`,
      );
    }
  }

  if (data.largeCommitWarning) {
    parts.push(
      'One or more commits contain a very large number of non-generated file changes, ' +
      'which may indicate code was added in bulk rather than developed incrementally.',
    );
  }

  if (data.authorCommitterDiscrepancy) {
    parts.push(
      'Some commits have a significant gap (>48 hours) between their author date and committer date. ' +
      'This can indicate rebasing, cherry-picking, or backdated commits.',
    );
  }

  return parts.join(' ');
}

// ─── Empty result builder ────────────────────────────────────────────────────

function buildEmptyResult(reason: string, ctx: PipelineContext): GitHistoryResult {
  return {
    commitCount:               0,
    firstCommit:               null,
    lastCommit:                null,
    durationDays:              0,
    avgCommitsPerDay:          0,
    commitMessages:            [],
    largeCommitWarning:        false,
    suspectBulkUpload:         false,
    commitDensitySpike:        false,
    descriptiveCommitRatio:    null,
    trivialCommitCount:        0,
    authorCommitterDiscrepancy: false,
    isFork:                    ctx.isFork,
    forkParent:                ctx.forkParent,
    specMilestoneCheck:        null,
    gitEvalVersion:            GIT_EVAL_VERSION,
    summary:                   reason,
  };
}
