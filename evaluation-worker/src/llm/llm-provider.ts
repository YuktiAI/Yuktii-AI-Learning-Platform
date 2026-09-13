/**
 * llm-provider.ts — Evaluation Worker Multi-Model LLM Client
 *
 * Task Routing:
 * - 'cognitive' (OpenHands, Mentor Report): Gemini (Primary) -> Groq (Fallback) -> OpenRouter
 * - 'scoring' (Req Scoring, Score Engine, Mini SWE Agent): Groq (Primary) -> Gemini (Fallback) -> OpenRouter
 * - 'audit' (Sanity Scorer): Gemini (Primary) -> Groq (Fallback) -> OpenRouter
 */

import Groq from 'groq-sdk';
import { GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY } from '../config.js';
import { logger } from '../logger.js';

export type LlmTaskType = 'cognitive' | 'scoring' | 'audit';

export interface WorkerLlmRequest {
  taskName: string;
  taskType: LlmTaskType;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object' | 'text';
}

export interface WorkerLlmResponse<T = any> {
  rawText: string;
  json?: T;
  provider: 'gemini' | 'groq' | 'openrouter';
  modelUsed: string;
}

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

let _groqClient: Groq | null = null;
function getGroq(): Groq | null {
  if (!GROQ_API_KEY) return null;
  if (!_groqClient) {
    _groqClient = new Groq({ apiKey: GROQ_API_KEY });
  }
  return _groqClient;
}

export function extractAndParseJson<T = any>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]) as T;
      } catch {}
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]) as T;
      } catch {}
    }
    throw new Error(`Failed to parse valid JSON: ${cleaned.slice(0, 100)}...`);
  }
}

// ── Gemini Invocation ─────────────────────────────────────────────────────────

async function callGemini<T = any>(
  options: WorkerLlmRequest,
  modelName: string
): Promise<WorkerLlmResponse<T>> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');

  const { systemPrompt, userPrompt, temperature = 0.2, maxTokens = 4000, responseFormat = 'json_object' } = options;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

  const payload: any = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (systemPrompt && systemPrompt.trim()) {
    payload.system_instruction = { parts: [{ text: systemPrompt }] };
  }

  if (responseFormat === 'json_object') {
    payload.generationConfig.responseMimeType = 'application/json';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data: any = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `HTTP ${response.status} from Gemini API`);
  }

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!rawText.trim()) throw new Error(`Gemini returned empty text (${modelName})`);

  let json: T | undefined = undefined;
  if (responseFormat === 'json_object') {
    json = extractAndParseJson<T>(rawText);
  }

  return { rawText, json, provider: 'gemini', modelUsed: modelName };
}

// ── Groq Invocation ──────────────────────────────────────────────────────────

async function callGroq<T = any>(
  options: WorkerLlmRequest,
  modelName: string
): Promise<WorkerLlmResponse<T>> {
  const groq = getGroq();
  if (!groq) throw new Error('GROQ_API_KEY is not configured');

  const { systemPrompt, userPrompt, temperature = 0.2, maxTokens = 4000, responseFormat = 'json_object' } = options;

  const messages: any[] = [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt });
  }
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

  let json: T | undefined = undefined;
  if (responseFormat === 'json_object') {
    json = extractAndParseJson<T>(rawText);
  }

  return { rawText, json, provider: 'groq', modelUsed: modelName };
}

// ── OpenRouter Invocation ────────────────────────────────────────────────────

async function callOpenRouter<T = any>(
  options: WorkerLlmRequest,
  modelName: string
): Promise<WorkerLlmResponse<T>> {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not configured');

  const { systemPrompt, userPrompt, temperature = 0.2, maxTokens = 4000, responseFormat = 'json_object' } = options;

  const messages: any[] = [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  const data: any = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `HTTP ${res.status} from OpenRouter`);
  }

  const rawText = data.choices?.[0]?.message?.content ?? '';
  if (!rawText.trim()) throw new Error(`OpenRouter returned empty text (${modelName})`);

  let json: T | undefined = undefined;
  if (responseFormat === 'json_object') {
    json = extractAndParseJson<T>(rawText);
  }

  return { rawText, json, provider: 'openrouter', modelUsed: modelName };
}

// ── Multi-Model Dispatcher ───────────────────────────────────────────────────

export async function callLlmWithFallback<T = any>(
  options: WorkerLlmRequest
): Promise<WorkerLlmResponse<T>> {
  const { taskName, taskType } = options;
  const errors: string[] = [];

  // Determine provider order based on task type
  const order: Array<'gemini' | 'groq' | 'openrouter'> =
    taskType === 'cognitive' || taskType === 'audit'
      ? ['gemini', 'groq', 'openrouter']
      : ['groq', 'gemini', 'openrouter'];

  for (const provider of order) {
    if (provider === 'gemini') {
      if (!GEMINI_API_KEY) continue;
      for (const model of GEMINI_MODELS) {
        try {
          const res = await callGemini<T>(options, model);
          logger.info(`[llm-worker] ${provider.toUpperCase()} (${model}) completed ${taskName}`);
          return res;
        } catch (err: any) {
          const msg = err?.message || String(err);
          errors.push(`Gemini(${model}): ${msg}`);
          if (msg.includes('404') || msg.includes('no longer available')) continue;
          logger.warn(`[llm-worker] Gemini (${model}) failed for ${taskName}`, { error: msg });
        }
      }
    } else if (provider === 'groq') {
      if (!GROQ_API_KEY) continue;
      for (const model of GROQ_MODELS) {
        try {
          const res = await callGroq<T>(options, model);
          logger.info(`[llm-worker] ${provider.toUpperCase()} (${model}) completed ${taskName}`);
          return res;
        } catch (err: any) {
          const msg = err?.message || String(err);
          errors.push(`Groq(${model}): ${msg}`);
          if (msg.includes('model_not_found') || msg.includes('does not exist')) continue;
          logger.warn(`[llm-worker] Groq (${model}) failed for ${taskName}`, { error: msg });
        }
      }
    } else if (provider === 'openrouter') {
      if (!OPENROUTER_API_KEY) continue;
      for (const model of OPENROUTER_MODELS) {
        try {
          const res = await callOpenRouter<T>(options, model);
          logger.info(`[llm-worker] ${provider.toUpperCase()} (${model}) completed ${taskName}`);
          return res;
        } catch (err: any) {
          const msg = err?.message || String(err);
          errors.push(`OpenRouter(${model}): ${msg}`);
          logger.warn(`[llm-worker] OpenRouter (${model}) failed for ${taskName}`, { error: msg });
        }
      }
    }
  }

  const failureMsg = `All LLM providers failed for ${taskName}: ${errors.join(' | ')}`;
  logger.error(`[llm-worker] ${failureMsg}`);
  throw new Error(failureMsg);
}
