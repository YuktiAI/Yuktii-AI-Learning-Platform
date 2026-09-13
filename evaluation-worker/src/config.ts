/**
 * config.ts — Central configuration for the evaluation worker.
 * All env vars are read here. Missing required vars throw on startup (fail-fast).
 */

function require_env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`[config] Missing required env var: ${key}`);
  return val;
}

function optional_env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

// ── Database ──────────────────────────────────────────────────────────────────
export const DATABASE_URL = require_env('DATABASE_URL');

// ── Redis / BullMQ ────────────────────────────────────────────────────────────
export const REDIS_URL = require_env('REDIS_URL');
export const EVALUATION_QUEUE_NAME = 'evaluation';

// ── Multi-Provider AI Keys ───────────────────────────────────────────────────
export const GROQ_API_KEY       = optional_env('GROQ_API_KEY', '');
export const GEMINI_API_KEY     = optional_env('GEMINI_API_KEY', '');
export const OPENROUTER_API_KEY = optional_env('OPENROUTER_API_KEY', '');
export const CEREBRAS_API_KEY   = optional_env('CEREBRAS_API_KEY', '');

// ── Anthropic Claude ──────────────────────────────────────────────────────────
export const ANTHROPIC_API_KEY = optional_env('ANTHROPIC_API_KEY', '');

// Model tiers — override via env to switch between budget / quality paths
// Default: budget path (confirmed with team)
export const CLAUDE_MODEL_OPENHANDS   = optional_env('CLAUDE_MODEL_OPENHANDS',   'claude-sonnet-4-5');
export const CLAUDE_MODEL_SWE_AGENT   = optional_env('CLAUDE_MODEL_SWE_AGENT',   'claude-haiku-3-5');
export const CLAUDE_MODEL_MENTOR      = optional_env('CLAUDE_MODEL_MENTOR',       'claude-sonnet-4-5');

// ── GitHub ────────────────────────────────────────────────────────────────────
// Optional PAT — avoids 60 req/hr unauthenticated rate limit
export const GITHUB_TOKEN = optional_env('GITHUB_TOKEN', '');

// ── E2B Sandbox ───────────────────────────────────────────────────────────────
// If E2B_API_KEY is empty, sandbox operations fall back to local execution (dev only).
export const E2B_API_KEY = optional_env('E2B_API_KEY', '');

// ── Agent limits (cost control) ───────────────────────────────────────────────
export const OPENHANDS_MAX_ITERATIONS = parseInt(optional_env('OPENHANDS_MAX_ITERATIONS', '20'), 10);
export const SWE_AGENT_MAX_ITERATIONS = parseInt(optional_env('SWE_AGENT_MAX_ITERATIONS', '10'), 10);

// Hard evaluation timeout — 15 minutes
export const EVALUATION_TIMEOUT_MS = parseInt(
  optional_env('EVALUATION_TIMEOUT_MS', String(15 * 60 * 1000)),
  10
);

// ── Scoring ───────────────────────────────────────────────────────────────────
export const EVALUATION_PASS_SCORE = parseInt(optional_env('EVALUATION_PASS_SCORE', '70'), 10);

// Category weights — must sum to 100
export const CATEGORY_WEIGHTS = {
  requirements:  25,
  functionality: 20,
  codeQuality:   15,
  architecture:  10,
  devProcess:    10,
  testing:        5,
  documentation:  5,
  security:       5,
  innovation:     5,
} as const;

// Tiered gate: if fewer than this fraction of deterministic checks pass,
// skip agent evaluation and return a fast FAIL report (cost control)
export const DETERMINISTIC_GATE_THRESHOLD = parseFloat(
  optional_env('DETERMINISTIC_GATE_THRESHOLD', '0.3')
);

// ── App URL (for internal API calls back to Next.js) ─────────────────────────
export const APP_URL = optional_env('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');

// ── Worker concurrency ────────────────────────────────────────────────────────
// Number of evaluations to run in parallel. Keep low (1-2) since each evaluation
// is already compute/API-intensive.
export const WORKER_CONCURRENCY = parseInt(optional_env('WORKER_CONCURRENCY', '2'), 10);

// ── Stage labels (shown in student dashboard during evaluation) ───────────────
export const STAGE_LABELS = {
  verify:         'Verifying submission…',
  retrieveSpec:   'Retrieving project specification…',
  createSandbox:  'Setting up evaluation environment…',
  deterministic:  'Running deterministic checks…',
  openHands:      'OpenHands broad evaluation (this may take several minutes)…',
  sweAgent:       'Investigating flagged issues…',
  gitHistory:     'Analysing git history…',
  reqScoring:     'Scoring requirements…',
  scoreEngine:    'Computing final score…',
  mentorReport:   'Generating mentor report…',
  saving:         'Saving results…',
} as const;

export type StageLabel = typeof STAGE_LABELS[keyof typeof STAGE_LABELS];
