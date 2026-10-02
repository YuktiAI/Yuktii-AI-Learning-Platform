-- Migration: 20261002_git_eval_and_spec_v2
-- Adds git evaluation hardening columns to SubmissionRecord and Evaluation.
-- All columns are nullable/default so existing rows are unaffected.

-- ── SubmissionRecord: fork detection ──────────────────────────────────────────
ALTER TABLE "SubmissionRecord"
  ADD COLUMN IF NOT EXISTS "isFork"      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "forkParent"  TEXT,
  ADD COLUMN IF NOT EXISTS "specVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "specHash"    TEXT;

-- ── Evaluation: git eval version + spec reference ─────────────────────────────
ALTER TABLE "Evaluation"
  ADD COLUMN IF NOT EXISTS "gitEvalVersion"      TEXT DEFAULT 'v2.0',
  ADD COLUMN IF NOT EXISTS "specVersion"         TEXT DEFAULT 'v2.0',
  ADD COLUMN IF NOT EXISTS "specHash"            TEXT,
  ADD COLUMN IF NOT EXISTS "specMilestoneCheck"  TEXT,
  ADD COLUMN IF NOT EXISTS "specItemResults"     TEXT;

-- No data backfill needed: existing rows stay NULL/default
-- which the pipeline handles gracefully (pre-v2 evaluations).
