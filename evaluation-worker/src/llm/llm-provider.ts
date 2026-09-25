/**
 * llm-provider.ts — Evaluation Worker Multi-Model LLM Client
 *
 * Role-based routing table (A2 patch applied: Cerebras removed from long-context roles):
 *
 *   openhands:            Groq(120b) → OpenRouter(:free)            ← Cerebras removed (8K ctx limit)
 *   swe-agent:            Groq(120b) → OpenRouter(:free)            ← Cerebras removed (8K ctx limit)
 *   req-scoring:          Groq(120b) → [FAIL-CLOSED — throws ScoringUnavailableError]
 *   fast-check:           Groq(20b)  → Cerebras(70b) → OpenRouter   ← OK, short prompts
 *   sanity-scorer:        Gemini(flash) → OpenRouter                ← MUST stay Gemini-first (cross-provider)
 *   mentor-report:        Groq(120b) → Gemini(flash) → Cerebras     ← verify prompt < 8K before Cerebras step
 *   model-answer:         Gemini(flash) → Groq(120b)
 *   scenario-gen:         Gemini(flash) → Groq(120b)
 *   injection-classifier: Groq(20b)  → Cerebras(70b)               ← OK, flagged snippets only
 *
 * WARNING: Cerebras free tier has ~8,192 token context limit.
 * Do NOT add Cerebras to openhands or swe-agent roles — repo content regularly exceeds this.
 */

import Groq from 'groq-sdk';
import IORedis from 'ioredis';
import {
  GROQ_API_KEY,
  GEMINI_API_KEY,
  OPENROUTER_API_KEY,
  CEREBRAS_API_KEY,
  REDIS_URL,
} from '../config.js';
import { logger } from '../logger.js';

// ── Role type ─────────────────────────────────────────────────────────────────

export type LlmRole =
  | 'openhands'
  | 'swe-agent'
  | 'req-scoring'
  | 'fast-check'
  | 'sanity-scorer'
  | 'mentor-report'
  | 'model-answer'
  | 'scenario-gen'
  | 'injection-classifier'
  // Legacy task-type aliases — kept for backwards compatibility during migration
  | 'cognitive'
  | 'scoring'
  | 'audit'
  | 'analysis'
  | 'generation';

// Legacy alias — callers that still pass taskType: 'scoring' etc. are supported
export type LlmTaskType = LlmRole;

export interface WorkerLlmRequest {
  taskName: string;
  taskType?: LlmTaskType;    // legacy
  role?: LlmRole;            // preferred
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object' | 'text';
}

export interface WorkerLlmResponse<T = any> {
  rawText: string;
  json?: T;
  provider: 'gemini' | 'groq' | 'openrouter' | 'cerebras';
  modelUsed: string;
}

// ── Typed error for fail-closed scoring ──────────────────────────────────────

export class ScoringUnavailableError extends Error {
  constructor(taskName: string, providerErrors: string[]) {
    super(
      `[FAIL-CLOSED] All providers exhausted for ${taskName}. ` +
      `This role does not fall back to weaker models. Errors: ${providerErrors.join(' | ')}`
    );
    this.name = 'ScoringUnavailableError';
  }
}

// ── Model lists ────────────────────────────────────────────────────────────────

export const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
];

export const GROQ_MODELS_LARGE = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'groq/compound',
];

export const GROQ_MODELS_SMALL = [
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
];

// WARNING: Cerebras free tier ~8,192 token context limit.
// Do NOT add Cerebras to openhands or swe-agent roles.
export const CEREBRAS_MODELS = [
  'llama-3.3-70b',  // Verify this ID: https://inference-docs.cerebras.ai/models
];

export const OPENROUTER_MODELS = [
  'liquid/lfm-2.5-2.6b:free',
  'mistralai/mistral-7b-instruct:free',
];

// ── Resolve role: maps legacy taskType aliases to canonical roles ──────────────

function resolveRole(req: WorkerLlmRequest): LlmRole {
  if (req.role) return req.role;
  // Legacy taskType mappings
  switch (req.taskType) {
    case 'cognitive':   return 'openhands';
    case 'generation':  return 'scenario-gen';
    case 'audit':       return 'sanity-scorer';
    case 'analysis':    return 'fast-check';
    case 'scoring':     return 'req-scoring';
    default:            return 'req-scoring';
  }
}

// ── Provider call functions ────────────────────────────────────────────────────

let _groqClient: Groq | null = null;
function getGroq(): Groq | null {
  if (!GROQ_API_KEY) return null;
  if (!_groqClient) _groqClient = new Groq({ apiKey: GROQ_API_KEY });
  return _groqClient;
}

export function extractAndParseJson<T = any>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  try { return JSON.parse(cleaned) as T; } catch {}
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]) as T; } catch {}
  }
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]) as T; } catch {}
  }
  throw new Error(`Failed to parse valid JSON: ${cleaned.slice(0, 100)}...`);
}

async function callGemini<T = any>(
  options: WorkerLlmRequest,
  modelName: string
): Promise<WorkerLlmResponse<T>> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');
  const { systemPrompt, userPrompt, temperature = 0.2, maxTokens = 4000, responseFormat = 'json_object' } = options;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

  const payload: any = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
  if (systemPrompt?.trim()) payload.system_instruction = { parts: [{ text: systemPrompt }] };
  if (responseFormat === 'json_object') payload.generationConfig.responseMimeType = 'application/json';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data: any = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status} from Gemini`);

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!rawText.trim()) throw new Error(`Gemini returned empty text (${modelName})`);

  let json: T | undefined;
  if (responseFormat === 'json_object') json = extractAndParseJson<T>(rawText);
  return { rawText, json, provider: 'gemini', modelUsed: modelName };
}

async function callGroq<T = any>(
  options: WorkerLlmRequest,
  modelName: string
): Promise<WorkerLlmResponse<T>> {
  const groq = getGroq();
  if (!groq) throw new Error('GROQ_API_KEY is not configured');
  const { systemPrompt, userPrompt, temperature = 0.2, maxTokens = 4000, responseFormat = 'json_object' } = options;

  const messages: any[] = [];
  if (systemPrompt?.trim()) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const completion = await groq.chat.completions.create({
    model: modelName,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
  });

  const rawText = completion.choices[0]?.message?.content ?? '';
  if (!rawText.trim()) throw new Error(`Groq returned empty text (${modelName})`);

  let json: T | undefined;
  if (responseFormat === 'json_object') json = extractAndParseJson<T>(rawText);
  return { rawText, json, provider: 'groq', modelUsed: modelName };
}

async function callCerebras<T = any>(
  options: WorkerLlmRequest,
  modelName: string
): Promise<WorkerLlmResponse<T>> {
  // WARNING: Cerebras free tier ~8,192 token context limit.
  // Do NOT use for openhands or swe-agent roles (long repo context).
  if (!CEREBRAS_API_KEY) throw new Error('CEREBRAS_API_KEY is not configured');
  const { systemPrompt, userPrompt, temperature = 0.2, maxTokens = 4000 } = options;

  const messages: any[] = [];
  if (systemPrompt?.trim()) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify({ model: modelName, messages, temperature, max_tokens: maxTokens }),
  });

  const data: any = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status} from Cerebras`);

  const rawText = data.choices?.[0]?.message?.content ?? '';
  if (!rawText.trim()) throw new Error(`Cerebras returned empty text (${modelName})`);

  let json: T | undefined;
  if (options.responseFormat === 'json_object') {
    try { json = extractAndParseJson<T>(rawText); } catch {}
  }
  return { rawText, json, provider: 'cerebras', modelUsed: modelName };
}

async function callOpenRouter<T = any>(
  options: WorkerLlmRequest,
  modelName: string
): Promise<WorkerLlmResponse<T>> {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not configured');
  const { systemPrompt, userPrompt, temperature = 0.2, maxTokens = 4000 } = options;

  const messages: any[] = [];
  if (systemPrompt?.trim()) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_API_KEY}` },
    body: JSON.stringify({ model: modelName, messages, temperature, max_tokens: maxTokens }),
  });

  const data: any = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status} from OpenRouter`);

  const rawText = data.choices?.[0]?.message?.content ?? '';
  if (!rawText.trim()) throw new Error(`OpenRouter returned empty text (${modelName})`);

  let json: T | undefined;
  if (options.responseFormat === 'json_object') {
    try { json = extractAndParseJson<T>(rawText); } catch {}
  }
  return { rawText, json, provider: 'openrouter', modelUsed: modelName };
}

// ── Proactive Rate Limiting (Phase B-5) ─────────────────────────────────────────

export const DAILY_PROVIDER_LIMITS: Record<string, number> = {
  groq: 1000,
  gemini: 500,
  cerebras: 1000,
  openrouter: 500,
};

export const PROACTIVE_FALLBACK_RATIO = 0.90; // 90% threshold for proactive fallback

let _rateLimitRedis: IORedis | null = null;

function getRateLimitRedis(): IORedis | null {
  if (!REDIS_URL) return null;
  if (!_rateLimitRedis) {
    try {
      _rateLimitRedis = new IORedis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      _rateLimitRedis.on('error', (err) => {
        logger.debug('[rate-limit] Redis connection notice', { error: String(err) });
      });
    } catch {
      _rateLimitRedis = null;
    }
  }
  return _rateLimitRedis;
}

export function getDailyKey(provider: string, model: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `ratelimit:${provider}:${model}:${today}`;
}

export function getDailyLimit(provider: string, model?: string): number {
  return DAILY_PROVIDER_LIMITS[provider] ?? 1000;
}

export async function getDailyUsage(provider: string, model: string): Promise<number> {
  const redis = getRateLimitRedis();
  if (!redis) return 0;
  try {
    const val = await redis.get(getDailyKey(provider, model));
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

export async function incrementDailyUsage(provider: string, model: string, count = 1): Promise<number> {
  const redis = getRateLimitRedis();
  if (!redis) return 0;
  try {
    const key = getDailyKey(provider, model);
    const newCount = await redis.incrby(key, count);
    if (newCount === count) {
      await redis.expire(key, 90_000); // 25 hours
    }
    return newCount;
  } catch {
    return 0;
  }
}

export async function isNearRateLimit(provider: string, model: string): Promise<boolean> {
  const limit = getDailyLimit(provider, model);
  const ceiling = Math.floor(limit * PROACTIVE_FALLBACK_RATIO);
  const current = await getDailyUsage(provider, model);
  return current >= ceiling;
}

export async function getDailyProviderUsageReport(): Promise<Array<{
  provider: string;
  model: string;
  usage: number;
  limit: number;
  percentage: number;
  nearLimit: boolean;
}>> {
  const report: any[] = [];
  const providers = [
    { provider: 'groq', models: GROQ_MODELS_LARGE.concat(GROQ_MODELS_SMALL) },
    { provider: 'gemini', models: GEMINI_MODELS },
    { provider: 'cerebras', models: CEREBRAS_MODELS },
    { provider: 'openrouter', models: OPENROUTER_MODELS },
  ];

  for (const { provider, models } of providers) {
    for (const model of models) {
      const usage = await getDailyUsage(provider, model);
      const limit = getDailyLimit(provider, model);
      const percentage = Math.round((usage / limit) * 100);
      const nearLimit = usage >= Math.floor(limit * PROACTIVE_FALLBACK_RATIO);
      report.push({ provider, model, usage, limit, percentage, nearLimit });
    }
  }
  return report;
}

// ── Helper: try a single provider, push errors, return null on failure ─────────

async function tryProvider<T>(
  provider: 'groq' | 'gemini' | 'cerebras' | 'openrouter',
  model: string,
  fn: () => Promise<WorkerLlmResponse<T>>,
  errors: string[]
): Promise<WorkerLlmResponse<T> | null> {
  const name = `${provider}(${model})`;

  // B-5: Proactive rate-limit check (skip provider if >= 90% of daily free-tier limit)
  try {
    const nearLimit = await isNearRateLimit(provider, model);
    if (nearLimit) {
      const usage = await getDailyUsage(provider, model);
      const limit = getDailyLimit(provider, model);
      const skipMsg = `${name}: Proactively bypassed (${usage}/${limit} reqs today, ≥90% ceiling reached)`;
      logger.warn(`[rate-limit] ${skipMsg}`);
      errors.push(skipMsg);
      return null;
    }
  } catch (rateLimitErr) {
    logger.debug('[rate-limit] Rate limit check skipped due to error', { error: String(rateLimitErr) });
  }

  try {
    const result = await fn();
    // Count successful call against daily usage counter
    await incrementDailyUsage(provider, model).catch(() => {});
    return result;
  } catch (err: any) {
    errors.push(`${name}: ${err?.message || String(err)}`);
    return null;
  }
}

// ── Role → ordered provider chain ─────────────────────────────────────────────

type ProviderStep<T> = () => Promise<WorkerLlmResponse<T> | null>;

function buildChain<T>(
  role: LlmRole,
  options: WorkerLlmRequest,
  errors: string[]
): ProviderStep<T>[] {
  const groqLarge  = GROQ_MODELS_LARGE[0];
  const groqSmall  = GROQ_MODELS_SMALL[0];
  const geminiMain = GEMINI_MODELS[0];
  const cerebras   = CEREBRAS_MODELS[0];
  const openrouter = OPENROUTER_MODELS[0];

  const groqL  = (m = groqLarge)  => () => tryProvider('groq',       m, () => callGroq<T>(options, m),       errors);
  const groqS  = (m = groqSmall)  => () => tryProvider('groq',       m, () => callGroq<T>(options, m),       errors);
  const gemini = (m = geminiMain) => () => tryProvider('gemini',     m, () => callGemini<T>(options, m),     errors);
  const crbrs  = (m = cerebras)   => () => tryProvider('cerebras',   m, () => callCerebras<T>(options, m),   errors);
  const ortr   = (m = openrouter) => () => tryProvider('openrouter', m, () => callOpenRouter<T>(options, m), errors);

  switch (role) {
    // Long-context agent roles — Cerebras excluded (8K token limit)
    case 'openhands':
    case 'cognitive':   return [groqL(), ortr()];

    case 'swe-agent':   return [groqL(), ortr()];

    // Fail-closed — no fallback at all; throws ScoringUnavailableError
    case 'req-scoring':
    case 'scoring':     return [groqL()]; // chain logic will throw after this if it fails

    // Short-prompt roles — Cerebras OK
    case 'fast-check':
    case 'analysis':    return [groqS(), crbrs(), ortr()];

    // Cross-provider sanity check — MUST stay Gemini-first
    case 'sanity-scorer':
    case 'audit':       return [gemini(), ortr()];

    // Report generation — moderate length; Cerebras last (verify prompt < 8K first)
    case 'mentor-report': return [groqL(), gemini(), crbrs()];

    case 'model-answer':  return [gemini(), groqL()];

    case 'scenario-gen':
    case 'generation':    return [gemini(), groqL()];

    // Only flagged snippets passed — context stays short
    case 'injection-classifier': return [groqS(), crbrs()];

    default:            return [groqL(), gemini(), ortr()];
  }
}

// ── Main dispatcher ────────────────────────────────────────────────────────────

export async function callLlmWithFallback<T = any>(
  options: WorkerLlmRequest
): Promise<WorkerLlmResponse<T>> {
  const { taskName } = options;
  const role = resolveRole(options);
  const errors: string[] = [];

  const chain = buildChain<T>(role, options, errors);
  let result: WorkerLlmResponse<T> | null = null;

  for (const step of chain) {
    result = await step();
    if (result) {
      logger.info(`[llm-worker] ${result.provider.toUpperCase()} (${result.modelUsed}) completed ${taskName} [role=${role}]`);
      return result;
    }
  }

  // Fail-closed for req-scoring — never fall to weaker models
  if (role === 'req-scoring' || role === 'scoring') {
    throw new ScoringUnavailableError(taskName, errors);
  }

  // All other roles: log and throw a generic failure
  const failureMsg = `All providers failed for ${taskName} [role=${role}]: ${errors.join(' | ')}`;
  logger.error(`[llm-worker] ${failureMsg}`);
  throw new Error(failureMsg);
}
