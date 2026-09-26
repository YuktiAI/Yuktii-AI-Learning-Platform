/**
 * getModel.ts — Live model IDs as of September 2026.
 *
 * Gemini:      gemini-3.1-flash-lite (primary, confirmed working)
 *              gemini-3.8-flash       (secondary, may 503 under load)
 * Groq:        openai/gpt-oss-120b   (confirmed working)
 *              openai/gpt-oss-20b    (fallback)
 * OpenRouter:  free-tier pool as tertiary
 *
 * All deprecated IDs (gemini-2.0-flash, gemini-1.5-flash, llama-3.3-70b-versatile,
 * mixtral-8x7b-32768) have been removed — they return 404 on all providers.
 */

export const GEMINI_MODELS = [
  'gemini-3.1-flash-lite',  // primary — confirmed live
  'gemini-3.8-flash',        // secondary — exists, may 503 under load
];

export const GROQ_MODELS = [
  'openai/gpt-oss-120b',    // confirmed live on Groq
  'openai/gpt-oss-20b',     // fallback
];

export const OPENROUTER_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'liquid/lfm-2.5-2.6b:free',
];

export const MODEL_CANDIDATES = GROQ_MODELS;

export function getModelName(): string {
  return process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
}
