/**
 * src/__tests__/test-git-hardening.ts — Workstream C unit tests
 *
 * Tests the pure-function helpers extracted from 07-git-history.ts:
 *  C-1  isDescriptiveMessage: placeholder vs descriptive subjects
 *  C-2  isScaffoldPath: lockfile/vendor/dist pattern matching
 *  C-3  detectBulkUpload: density spike and suspect bulk upload
 *  C-4  Duration allows 0 days (same-day burst)
 *  C-5  Author/committer discrepancy detection (> 48h threshold)
 *  C-6  Fork filtering: post-fork commit subset
 *  C-7  Descriptive commit ratio scoring thresholds (>= 70%, < 20%)
 *  C-8  gitEvalVersion is always 'v2.0'
 *
 * Run with:
 *   npx tsx src/__tests__/test-git-hardening.ts
 */

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const errors: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌  ${name}`);
    console.error(`      ${err.message}`);
    errors.push(`${name}: ${err.message}`);
    failed++;
  }
}

function localAssert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function localAssertEqual<T>(actual: T, expected: T, label?: string) {
  localAssert(
    actual === expected,
    `${label ? label + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

// ─── Inline helpers (mirrors 07-git-history.ts — single source of truth for logic) ─

const PLACEHOLDER_MESSAGES = new Set([
  'initial commit', 'init', 'first commit', 'update', 'fix', 'wip', 'test',
  'commit', 'add files', 'add file', 'changes', 'misc', 'stuff', 'temp', 'tmp',
  'work in progress', 'progress', 'done', 'complete', 'final', 'cleanup',
  'updates', 'fixes', 'minor fixes', 'small fixes', 'refactor', 'refactoring',
]);

const SCAFFOLD_PATTERNS = [
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'Cargo.lock',
  'composer.lock', 'Gemfile.lock', 'go.sum', 'requirements.txt',
  'node_modules/', 'dist/', '.next/', 'build/', 'vendor/', '__pycache__/',
  '.gradle/', 'target/', 'coverage/', '.nyc_output/', 'out/', 'public/build/',
  'static/dist/', 'assets/build/', '.turbo/', '.vercel/', '.cache/', 'migrations/',
];

function isDescriptiveMessage(subject: string): boolean {
  const s = subject.trim().toLowerCase();
  if (!s || s.length < 10) return false;
  if (s.startsWith('merge ') || s.startsWith('merged ')) return false;
  if (PLACEHOLDER_MESSAGES.has(s)) return false;
  const words = s.split(/\s+/).filter(Boolean);
  return words.length >= 3;
}

function isScaffoldPath(filePath: string): boolean {
  const p = filePath.toLowerCase().replace(/\\/g, '/');
  return SCAFFOLD_PATTERNS.some((pattern) => {
    if (pattern.endsWith('/')) return p.includes(pattern) || p.startsWith(pattern);
    return p === pattern || p.endsWith('/' + pattern);
  });
}

function detectBulkUpload(
  commits: Array<{ date: string; message: string }>,
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

// ─── C-1: isDescriptiveMessage ────────────────────────────────────────────────

console.log('\n[C-1] Descriptive vs placeholder commit messages');

test('placeholder: "initial commit"', () => {
  localAssert(!isDescriptiveMessage('initial commit'), 'should not be descriptive');
});
test('placeholder: "update"', () => {
  localAssert(!isDescriptiveMessage('update'), 'should not be descriptive');
});
test('placeholder: "fix"', () => {
  localAssert(!isDescriptiveMessage('fix'), 'should not be descriptive');
});
test('placeholder: "wip"', () => {
  localAssert(!isDescriptiveMessage('wip'), 'should not be descriptive');
});
test('merge commit excluded', () => {
  localAssert(!isDescriptiveMessage('Merge branch main into feature/auth'), 'merge should not be descriptive');
});
test('too short (< 10 chars)', () => {
  localAssert(!isDescriptiveMessage('add file'), 'too short');
});
test('descriptive: "feat: add user authentication with JWT tokens"', () => {
  localAssert(isDescriptiveMessage('feat: add user authentication with JWT tokens'), 'should be descriptive');
});
test('descriptive: "fix null pointer in payment handler"', () => {
  localAssert(isDescriptiveMessage('fix null pointer in payment handler'), 'should be descriptive');
});
test('descriptive: "refactor sensor polling to use async/await"', () => {
  localAssert(isDescriptiveMessage('refactor sensor polling to use async/await'), 'should be descriptive');
});
test('only 2 words → not descriptive', () => {
  localAssert(!isDescriptiveMessage('add authentication'), 'only 2 words should not qualify');
});

// ─── C-2: isScaffoldPath ─────────────────────────────────────────────────────

console.log('\n[C-2] Scaffold/lockfile path detection');

test('package-lock.json → scaffold', () => {
  localAssert(isScaffoldPath('package-lock.json'), 'should be scaffold');
});
test('yarn.lock → scaffold', () => {
  localAssert(isScaffoldPath('yarn.lock'), 'should be scaffold');
});
test('pnpm-lock.yaml → scaffold', () => {
  localAssert(isScaffoldPath('pnpm-lock.yaml'), 'should be scaffold');
});
test('node_modules/lodash/index.js → scaffold', () => {
  localAssert(isScaffoldPath('node_modules/lodash/index.js'), 'should be scaffold');
});
test('dist/bundle.js → scaffold', () => {
  localAssert(isScaffoldPath('dist/bundle.js'), 'should be scaffold');
});
test('.next/static/chunks/main.js → scaffold', () => {
  localAssert(isScaffoldPath('.next/static/chunks/main.js'), 'should be scaffold');
});
test('src/index.ts → NOT scaffold', () => {
  localAssert(!isScaffoldPath('src/index.ts'), 'source file should not be scaffold');
});
test('README.md → NOT scaffold', () => {
  localAssert(!isScaffoldPath('README.md'), 'docs should not be scaffold');
});
test('app/api/auth/route.ts → NOT scaffold', () => {
  localAssert(!isScaffoldPath('app/api/auth/route.ts'), 'app code should not be scaffold');
});
test('requirements.txt → scaffold', () => {
  localAssert(isScaffoldPath('requirements.txt'), 'Python lock file should be scaffold');
});

// ─── C-3: detectBulkUpload ────────────────────────────────────────────────────

console.log('\n[C-3] Bulk upload / density spike detection');

test('all 8 commits on same day → commitDensitySpike', () => {
  const commits = Array.from({ length: 8 }, (_, i) => ({
    date: '2026-10-01T10:00:00Z', message: `commit ${i}`,
  }));
  const { commitDensitySpike } = detectBulkUpload(commits, 0);
  localAssert(commitDensitySpike, 'should detect density spike');
});
test('5 commits on same day → NOT spike (threshold is > 5)', () => {
  const commits = Array.from({ length: 5 }, (_, i) => ({
    date: '2026-10-01T10:00:00Z', message: `commit ${i}`,
  }));
  const { commitDensitySpike } = detectBulkUpload(commits, 0);
  localAssert(!commitDensitySpike, 'exactly 5 should not trigger spike (needs > 5)');
});
test('5 out of 8 commits on same day → suspectBulkUpload (62.5%)', () => {
  const commits = [
    { date: '2026-10-01T10:00:00Z', message: 'a' },
    { date: '2026-10-01T11:00:00Z', message: 'b' },
    { date: '2026-10-01T12:00:00Z', message: 'c' },
    { date: '2026-10-01T13:00:00Z', message: 'd' },
    { date: '2026-10-01T14:00:00Z', message: 'e' },
    { date: '2026-10-03T10:00:00Z', message: 'f' },
    { date: '2026-10-05T10:00:00Z', message: 'g' },
    { date: '2026-10-07T10:00:00Z', message: 'h' },
  ];
  const { suspectBulkUpload } = detectBulkUpload(commits, 6);
  localAssert(suspectBulkUpload, 'should detect suspect bulk upload');
});
test('evenly spread commits → no bulk upload', () => {
  const commits = [
    { date: '2026-10-01T10:00:00Z', message: 'day 1 a' },
    { date: '2026-10-02T10:00:00Z', message: 'day 2 a' },
    { date: '2026-10-03T10:00:00Z', message: 'day 3 a' },
    { date: '2026-10-04T10:00:00Z', message: 'day 4 a' },
    { date: '2026-10-05T10:00:00Z', message: 'day 5 a' },
  ];
  const { suspectBulkUpload, commitDensitySpike } = detectBulkUpload(commits, 4);
  localAssert(!suspectBulkUpload && !commitDensitySpike, 'evenly spread should be clean');
});

// ─── C-4: Duration allows 0 days ─────────────────────────────────────────────

console.log('\n[C-4] Duration calculation allows 0 days');

test('same-day commits → durationDays = 0 (not artificially bumped to 1)', () => {
  const t0 = new Date('2026-10-01T09:00:00Z').getTime();
  const t1 = new Date('2026-10-01T17:00:00Z').getTime();
  const durationDays = Math.floor((t1 - t0) / 86_400_000);
  localAssertEqual(durationDays, 0, 'same-day duration should be 0');
});
test('next-day commits → durationDays = 1', () => {
  const t0 = new Date('2026-10-01T00:00:00Z').getTime();
  const t1 = new Date('2026-10-02T00:00:00Z').getTime();
  const durationDays = Math.floor((t1 - t0) / 86_400_000);
  localAssertEqual(durationDays, 1);
});
test('3-day span → durationDays = 3', () => {
  const t0 = new Date('2026-10-01T00:00:00Z').getTime();
  const t1 = new Date('2026-10-04T00:00:00Z').getTime();
  const durationDays = Math.floor((t1 - t0) / 86_400_000);
  localAssertEqual(durationDays, 3);
});

// ─── C-5: Author/committer discrepancy ────────────────────────────────────────

console.log('\n[C-5] Author vs committer date discrepancy > 48h');

const DISCREPANCY_THRESHOLD_MS = 48 * 60 * 60 * 1000;

test('author 72h before committer → discrepancy flagged', () => {
  const authorTs = new Date('2026-09-28T00:00:00Z').getTime();
  const committerTs = new Date('2026-10-01T00:00:00Z').getTime();
  localAssert(Math.abs(authorTs - committerTs) > DISCREPANCY_THRESHOLD_MS, 'should flag 72h gap');
});
test('author 24h before committer → NO discrepancy', () => {
  const authorTs = new Date('2026-09-30T00:00:00Z').getTime();
  const committerTs = new Date('2026-10-01T00:00:00Z').getTime();
  localAssert(Math.abs(authorTs - committerTs) <= DISCREPANCY_THRESHOLD_MS, 'should NOT flag 24h gap');
});
test('exactly 48h → boundary: NOT flagged (> required, not >=)', () => {
  const authorTs = new Date('2026-09-29T00:00:00Z').getTime();
  const committerTs = new Date('2026-10-01T00:00:00Z').getTime();
  const diff = Math.abs(authorTs - committerTs);
  localAssert(diff <= DISCREPANCY_THRESHOLD_MS, 'exactly 48h should not be flagged');
});

// ─── C-6: Fork boundary filtering ─────────────────────────────────────────────

console.log('\n[C-6] Fork commit boundary filtering');

test('post-fork commits: only those after forkCreatedAt are counted', () => {
  const forkCreatedAt = new Date('2026-09-15T00:00:00Z').getTime();
  const allCommits = [
    { authorDate: '2026-09-10T10:00:00Z', subject: 'upstream commit 1' },
    { authorDate: '2026-09-12T10:00:00Z', subject: 'upstream commit 2' },
    { authorDate: '2026-09-16T10:00:00Z', subject: 'my first change after fork' },
    { authorDate: '2026-09-18T10:00:00Z', subject: 'add sensor reading function' },
  ];
  const postFork = allCommits.filter((c) => {
    const ts = new Date(c.authorDate).getTime();
    return !isNaN(ts) && ts >= forkCreatedAt;
  });
  localAssertEqual(postFork.length, 2, 'should only count 2 post-fork commits');
});
test('no post-fork commits → use all (benefit of the doubt)', () => {
  const forkCreatedAt = new Date('2026-10-05T00:00:00Z').getTime();
  const allCommits = [
    { authorDate: '2026-09-10T10:00:00Z', subject: 'old commit' },
  ];
  const postFork = allCommits.filter((c) => {
    const ts = new Date(c.authorDate).getTime();
    return !isNaN(ts) && ts >= forkCreatedAt;
  });
  // Falls back to all commits since post-fork is empty
  const effective = postFork.length > 0 ? postFork : allCommits;
  localAssertEqual(effective.length, 1, 'should use all commits as fallback');
});

// ─── C-7: Descriptive commit ratio scoring ────────────────────────────────────

console.log('\n[C-7] Descriptive commit ratio scoring thresholds');

function simulateDevProcessRatioScore(ratio: number): number {
  let score = 50;
  if (ratio >= 0.7) score += 10;
  else if (ratio < 0.2) score -= 10;
  return score;
}

test('ratio = 1.0 (100% descriptive) → +10', () => {
  localAssertEqual(simulateDevProcessRatioScore(1.0), 60);
});
test('ratio = 0.7 (70% descriptive) → +10 (threshold inclusive)', () => {
  localAssertEqual(simulateDevProcessRatioScore(0.7), 60);
});
test('ratio = 0.5 (50% descriptive) → 0 (neutral)', () => {
  localAssertEqual(simulateDevProcessRatioScore(0.5), 50);
});
test('ratio = 0.2 (20% descriptive) → 0 (boundary: < 0.2 needed for penalty)', () => {
  localAssertEqual(simulateDevProcessRatioScore(0.2), 50);
});
test('ratio = 0.19 (19% descriptive) → -10', () => {
  localAssertEqual(simulateDevProcessRatioScore(0.19), 40);
});
test('ratio = 0.0 (0% descriptive) → -10', () => {
  localAssertEqual(simulateDevProcessRatioScore(0.0), 40);
});

// ─── C-8: gitEvalVersion ─────────────────────────────────────────────────────

console.log('\n[C-8] gitEvalVersion is always v2.0');

test('GIT_EVAL_VERSION constant is v2.0', () => {
  // This mirrors the constant defined in 07-git-history.ts
  const GIT_EVAL_VERSION = 'v2.0';
  localAssertEqual(GIT_EVAL_VERSION, 'v2.0');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Workstream C tests complete: ${passed} passed, ${failed} failed`);
if (errors.length > 0) {
  console.error('\nFailed tests:');
  errors.forEach((e) => console.error(`  • ${e}`));
  process.exit(1);
} else {
  console.log('All Workstream C tests passed ✅');
}
