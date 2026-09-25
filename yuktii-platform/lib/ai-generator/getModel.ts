export const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
];

export const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
];

export const OPENROUTER_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'liquid/lfm-2.5-2.6b:free',
];

export const MODEL_CANDIDATES = GROQ_MODELS;

export function getModelName(): string {
  return process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
}

