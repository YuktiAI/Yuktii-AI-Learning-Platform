export const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3-flash-preview',
];

export const GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
  'groq/compound',
];

export const OPENROUTER_MODELS = [
  'liquid/lfm-2.5-2.6b:free',
];

export const MODEL_CANDIDATES = GROQ_MODELS;

export function getModelName(): string {
  return process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
}
