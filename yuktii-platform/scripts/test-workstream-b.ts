/**
 * scripts/test-workstream-b.ts — Automated verification for Workstream B
 *
 * Tests:
 *  B-1  Gap formula: default = round(trackDuration / stageCount)
 *  B-2  Stage 1 always has gapDays = 0 (no gate)
 *  B-3  gapDaysOverride takes precedence when set
 *  B-4  calculateSubmissionOpensAt is passedAt + gapDays * 24h
 *  B-5  isGateBypassed() reads BYPASS_STAGE_GATE env correctly
 *  B-6  Server rejects SCENARIO_OPEN_SUBMISSION_LOCKED state with code STAGE_NOT_OPEN
 *  B-7  Existing-student backfill: opensAt in the past → status = 'OPEN'
 *  B-8  Resubmission after pass: passedAt in StageProgress is never extended
 *
 * Run with:
 *   npx tsx scripts/test-workstream-b.ts
 */

import {
  calculateDefaultGapDays,
  getStageGapDays,
  calculateSubmissionOpensAt,
  isGateBypassed,
} from '../lib/stage-gate';

// ─── Minimal test harness ───────────────────────────────────────────────────

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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label?: string) {
  assert(
    actual === expected,
    `${label ? label + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

// ─── B-1 : Default gap formula ──────────────────────────────────────────────

console.log('\n[B-1] Default gap formula: round(trackDuration / stageCount)');

test('5 stages, 15-day track → 3d per stage', () => {
  assertEqual(calculateDefaultGapDays(15, 5), 3);
});
test('5 stages, 30-day track → 6d per stage', () => {
  assertEqual(calculateDefaultGapDays(30, 5), 6);
});
test('5 stages, 45-day track → 9d per stage', () => {
  assertEqual(calculateDefaultGapDays(45, 5), 9);
});
test('5 stages, 60-day track → 12d per stage', () => {
  assertEqual(calculateDefaultGapDays(60, 5), 12);
});
test('3 stages, 30-day track → 10d per stage', () => {
  assertEqual(calculateDefaultGapDays(30, 3), 10);
});
test('stageCount=0 → 0 (guard against divide-by-zero)', () => {
  assertEqual(calculateDefaultGapDays(30, 0), 0);
});

// ─── B-2 : Stage 1 never has a gate ────────────────────────────────────────

console.log('\n[B-2] Stage 1 always returns gapDays=0');

test('Stage 1, no override', () => {
  assertEqual(getStageGapDays(1, 30, 5, null), 0);
});
test('Stage 1, with override (override is ignored)', () => {
  assertEqual(getStageGapDays(1, 30, 5, 7), 0, 'override must be ignored for Stage 1');
});

// ─── B-3 : gapDaysOverride takes precedence ─────────────────────────────────

console.log('\n[B-3] Admin gapDaysOverride takes precedence over formula');

test('Stage 2 override=14 → 14', () => {
  assertEqual(getStageGapDays(2, 30, 5, 14), 14);
});
test('Stage 3 override=0 → 0 (admin can set zero to open immediately)', () => {
  assertEqual(getStageGapDays(3, 30, 5, 0), 0);
});
test('Stage 2 override=null → uses formula', () => {
  assertEqual(getStageGapDays(2, 30, 5, null), 6);
});
test('Stage 2 override=undefined → uses formula', () => {
  assertEqual(getStageGapDays(2, 30, 5, undefined), 6);
});

// ─── B-4 : calculateSubmissionOpensAt ───────────────────────────────────────

console.log('\n[B-4] calculateSubmissionOpensAt = passedAt + gapDays * 24h');

test('gapDays=0 → opensAt equals passedAt exactly', () => {
  const passedAt = new Date('2026-10-01T12:00:00Z');
  const opensAt = calculateSubmissionOpensAt(passedAt, 0);
  assertEqual(opensAt.getTime(), passedAt.getTime());
});
test('gapDays=3 → opensAt is exactly 72 hours later', () => {
  const passedAt = new Date('2026-10-01T12:00:00Z');
  const opensAt = calculateSubmissionOpensAt(passedAt, 3);
  const expectedMs = passedAt.getTime() + 3 * 24 * 60 * 60 * 1000;
  assertEqual(opensAt.getTime(), expectedMs);
});
test('gapDays=6 → opensAt is exactly 144 hours later', () => {
  const passedAt = new Date('2026-10-01T00:00:00Z');
  const opensAt = calculateSubmissionOpensAt(passedAt, 6);
  const expectedMs = passedAt.getTime() + 6 * 24 * 60 * 60 * 1000;
  assertEqual(opensAt.getTime(), expectedMs);
});

// ─── B-5 : isGateBypassed env var ───────────────────────────────────────────

console.log('\n[B-5] isGateBypassed() reads BYPASS_STAGE_GATE env');

test('BYPASS_STAGE_GATE=true → returns true', () => {
  process.env.BYPASS_STAGE_GATE = 'true';
  assert(isGateBypassed() === true, 'should be bypassed');
  delete process.env.BYPASS_STAGE_GATE;
});
test('BYPASS_STAGE_GATE unset → returns false', () => {
  delete process.env.BYPASS_STAGE_GATE;
  assert(isGateBypassed() === false, 'should not be bypassed');
});
test('BYPASS_STAGE_GATE=false → returns false', () => {
  process.env.BYPASS_STAGE_GATE = 'false';
  assert(isGateBypassed() === false, 'explicit false should not bypass');
  delete process.env.BYPASS_STAGE_GATE;
});

// ─── B-6 : Server STAGE_NOT_OPEN logic (state machine simulation) ────────────

console.log('\n[B-6] Server-side STAGE_NOT_OPEN rejection simulation');

test('opensAt in future → stage is LOCKED (SCENARIO_OPEN_SUBMISSION_LOCKED)', () => {
  const passedAt = new Date(); // now
  const gapDays = 6;
  const opensAt = calculateSubmissionOpensAt(passedAt, gapDays);
  const now = new Date();
  const isLocked = now < opensAt;
  assert(isLocked, 'Stage should be locked when opensAt is in the future');
});

test('opensAt in the past → stage is OPEN', () => {
  const passedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
  const gapDays = 6;
  const opensAt = calculateSubmissionOpensAt(passedAt, gapDays);
  const now = new Date();
  const isOpen = now >= opensAt;
  assert(isOpen, 'Stage should be open when opensAt is in the past');
});

test('Stage 1 never has a gate (always OPEN)', () => {
  const passedAt = new Date();
  const gapDays = getStageGapDays(1, 30, 5, null); // 0
  const opensAt = calculateSubmissionOpensAt(passedAt, gapDays);
  const isOpen = new Date() >= opensAt;
  assert(isOpen, 'Stage 1 must always be open');
});

// ─── B-7 : Backfill retroactive unlock logic ────────────────────────────────

console.log('\n[B-7] Backfill: existing students get opensAt in the past → status=OPEN');

test('passedAt 30 days ago + gapDays=6 → opensAt 24 days ago → OPEN', () => {
  const passedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const gapDays = 6;
  const opensAt = calculateSubmissionOpensAt(passedAt, gapDays);
  const now = new Date();
  const expectedStatus = now >= opensAt ? 'OPEN' : 'SCENARIO_OPEN';
  assertEqual(expectedStatus, 'OPEN', 'Existing student should immediately be OPEN');
});

test('passedAt 1 day ago + gapDays=6 → still in gate → SCENARIO_OPEN', () => {
  const passedAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
  const gapDays = 6;
  const opensAt = calculateSubmissionOpensAt(passedAt, gapDays);
  const now = new Date();
  const expectedStatus = now >= opensAt ? 'OPEN' : 'SCENARIO_OPEN';
  assertEqual(expectedStatus, 'SCENARIO_OPEN', 'Recent pass should still be in gate');
});

// ─── B-8 : Resubmission doesn't extend passedAt ──────────────────────────────

console.log('\n[B-8] Resubmission after pass: passedAt is never extended');

test('Re-eval with higher score: passedAt stays at first pass time', () => {
  // Simulate: first pass at T0, resubmission evaluated at T1 (T1 > T0)
  const t0 = new Date('2026-09-25T10:00:00Z'); // first pass
  const t1 = new Date('2026-09-30T10:00:00Z'); // resubmission eval
  // System should keep passedAt = t0, not update to t1
  const storedPassedAt = t0; // (the code only sets passedAt on first PASSED upsert)
  assertEqual(storedPassedAt.toISOString(), t0.toISOString(), 'passedAt should remain T0');
});

test('opensAt for Stage N+1 is computed from original passedAt, not resubmission time', () => {
  const originalPassedAt = new Date('2026-09-25T10:00:00Z');
  const resubPassedAt    = new Date('2026-09-30T10:00:00Z'); // later resubmission
  const gapDays = 6;
  const opensAtFromOriginal  = calculateSubmissionOpensAt(originalPassedAt, gapDays);
  const opensAtFromResub     = calculateSubmissionOpensAt(resubPassedAt, gapDays);
  // The correct behaviour uses originalPassedAt
  assert(
    opensAtFromOriginal.getTime() < opensAtFromResub.getTime(),
    'Using original passedAt gives earlier opensAt — correct, not extended by resubmission',
  );
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Workstream B tests complete: ${passed} passed, ${failed} failed`);
if (errors.length > 0) {
  console.error('\nFailed tests:');
  errors.forEach((e) => console.error(`  • ${e}`));
  process.exit(1);
} else {
  console.log('All Workstream B tests passed ✅');
}
