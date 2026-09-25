/**
 * config.ts — Central configuration for the evaluation worker.
 * All env vars are read here. Missing required vars throw on startup (fail-fast).
 */

try {
  process.loadEnvFile?.();
} catch {}

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

// ── Anthropic/Claude — REMOVED ───────────────────────────────────────────────
// All Claude references have been removed. The pipeline now routes exclusively
// through Groq, Gemini, Cerebras, and OpenRouter.
// Role-based model constants (used by llm-provider.ts routing table):
export const MODEL_OPENHANDS         = 'openai/gpt-oss-120b';  // Groq — broad eval
export const MODEL_SWE_AGENT         = 'openai/gpt-oss-120b';  // Groq — focused investigation
export const MODEL_REQ_SCORING       = 'openai/gpt-oss-120b';  // Groq — FAIL-CLOSED (no fallback)
export const MODEL_FAST_CHECK        = 'openai/gpt-oss-20b';   // Groq — short prompts, fast
export const MODEL_SANITY_SCORER     = 'gemini-2.0-flash';     // Gemini — MUST stay Gemini-first
export const MODEL_MENTOR_REPORT     = 'openai/gpt-oss-120b';  // Groq → Gemini fallback
export const MODEL_CEREBRAS_FALLBACK = 'llama-3.3-70b';        // Cerebras (verify ID at https://inference-docs.cerebras.ai/models)

// ── GitHub ────────────────────────────────────────────────────────────────────
// Optional PAT — avoids 60 req/hr unauthenticated rate limit
export const GITHUB_TOKEN = optional_env('GITHUB_TOKEN', '');

// ── E2B Sandbox ───────────────────────────────────────────────────────────────
// If E2B_API_KEY is empty, sandbox operations fall back to local execution (dev only).
export const E2B_API_KEY = optional_env('E2B_API_KEY', '');

// Reduced to target sub-2-minute evaluation time.
// Override via env vars on Render/Vercel if deeper analysis is needed.
export const OPENHANDS_MAX_ITERATIONS = parseInt(optional_env('OPENHANDS_MAX_ITERATIONS', '3'), 10);
export const SWE_AGENT_MAX_ITERATIONS = parseInt(optional_env('SWE_AGENT_MAX_ITERATIONS', '2'), 10);

// Hard evaluation timeout — 3 minutes (reduced to meet 2-minute target)
export const EVALUATION_TIMEOUT_MS = parseInt(
  optional_env('EVALUATION_TIMEOUT_MS', String(3 * 60 * 1000)),
  10
);

// ── Scoring / Pass Gates ──────────────────────────────────────────────────────
// Standard stages pass at 50/100+. Capstone (final) stage requires 60+.
export const EVALUATION_PASS_SCORE          = parseInt(optional_env('EVALUATION_PASS_SCORE', '50'), 10);
export const EVALUATION_PASS_SCORE_CAPSTONE = parseInt(optional_env('EVALUATION_PASS_SCORE_CAPSTONE', '60'), 10);

// Hard gate: build must succeed (can be disabled via env for non-code stages)
export const HARD_GATE_BUILD_REQUIRED = optional_env('HARD_GATE_BUILD_REQUIRED', 'true') === 'true';

// Hard gate: at least 60% of requirements must score PASS (not PARTIAL, not FAIL)
export const HARD_GATE_REQ_PASS_RATE = parseFloat(optional_env('HARD_GATE_REQ_PASS_RATE', '0.60'));

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

// ── Concurrency & token caps ──────────────────────────────────────────────────
export const WORKER_CONCURRENCY = parseInt(optional_env('WORKER_CONCURRENCY', '2'), 10);

// Total LLM token budget per job — abort remaining stages if exceeded
export const MAX_TOKENS_PER_JOB = parseInt(optional_env('MAX_TOKENS_PER_JOB', '80000'), 10);

// Resubmission limits
export const MAX_RESUBMISSIONS_PER_STAGE  = parseInt(optional_env('MAX_RESUBMISSIONS_PER_STAGE', '5'), 10);
export const RESUBMISSION_COOLDOWN_MS     = parseInt(optional_env('RESUBMISSION_COOLDOWN_MS', String(4 * 60 * 60 * 1000)), 10); // 4h default

// Beginner-tier domains use a lighter pipeline (fewer agent steps)
export const BEGINNER_TIER_DOMAINS: string[] = (optional_env('BEGINNER_TIER_DOMAINS', 'data-analysis')).split(',').map(s => s.trim());

// ── Stage labels (shown in student dashboard during evaluation) ───────────────
export const STAGE_LABELS = {
  verify:         'Verifying submission…',
  retrieveSpec:   'Retrieving project specification…',
  createSandbox:  'Setting up evaluation environment…',
  deterministic:  'Running code checks…',
  aiDetector:     'Checking for AI-generated code…',
  openHands:      'Running broad code evaluation…',
  sweAgent:       'Investigating flagged issues…',
  gitHistory:     'Analysing git history…',
  reqScoring:     'Scoring requirements…',
  scoreEngine:    'Computing final score…',
  mentorReport:   'Generating evaluation report…',
  modelAnswer:    'Generating model answer…',
  saving:         'Saving results…',
} as const;

export type StageLabel = typeof STAGE_LABELS[keyof typeof STAGE_LABELS];
