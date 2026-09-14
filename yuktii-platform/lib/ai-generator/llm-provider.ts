/**
 * llm-provider.ts — Resilient Multi-Provider LLM Dispatcher
 *
 * Tier 1: Google Gemini (gemini-3.6-flash, gemini-3.5-flash) — Primary for high reasoning & structured generation
 * Tier 2: Groq (openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b) — Ultra-fast LPU inference fallback
 * Tier 3: OpenRouter (free tier models) — Elastic pool fallback
 * Tier 4: Anthropic Claude (claude-3-5-sonnet, etc.) — Optional legacy fallback
 *
 * Traceability: Logs provider and model used for every request:
 *   [ai-generator] Provider: GEMINI served response for <taskName> (model: <model>)
 *   [ai-generator] Provider: GROQ served response for <taskName> (model: <model>)
 */

import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { GEMINI_MODELS, GROQ_MODELS, OPENROUTER_MODELS, getModelName } from './getModel';
import { AiGenerationError } from './AiGenerationError';

export interface LlmRequestOptions {
  taskName: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object' | 'text';
}

export interface LlmResponse<T = any> {
  rawText: string;
  json: T;
  provider: 'gemini' | 'groq' | 'openrouter' | 'claude';
  modelUsed: string;
}

/**
 * Extracts and parses JSON from text, tolerating markdown code fences.
 */
export function extractAndParseJson<T = any>(raw: string): T {
  let cleaned = raw.trim();

  // Extract content from within markdown code fences if present anywhere in the text
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // Try direct parse
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Attempt to extract the first { ... } block
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]) as T;
      } catch {
        // Strip trailing commas before closing braces/brackets and retry
        try {
          const sanitized = objMatch[0].replace(/,\s*([}\]])/g, '$1');
          return JSON.parse(sanitized) as T;
        } catch {}
      }
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]) as T;
      } catch {
        try {
          const sanitized = arrMatch[0].replace(/,\s*([}\]])/g, '$1');
          return JSON.parse(sanitized) as T;
        } catch {}
      }
    }
    throw new Error(`Failed to parse valid JSON from LLM output: ${cleaned.slice(0, 100)}...`);
  }
}

// ── Google Gemini Provider ───────────────────────────────────────────────────

async function callGemini<T = any>(
  options: LlmRequestOptions,
  modelName: string,
  apiKey: string
): Promise<LlmResponse<T>> {
  const { systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4000, responseFormat = 'json_object' } = options;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const payload: any = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (systemPrompt && systemPrompt.trim()) {
    payload.system_instruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  if (responseFormat === 'json_object') {
    payload.generationConfig.responseMimeType = 'application/json';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data?.error?.message || `HTTP ${response.status} from Gemini API`;
    throw new Error(errorMsg);
  }

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!rawText.trim()) {
    throw new Error(`Gemini returned empty response text for model ${modelName}`);
  }

  let parsedJson: T = undefined as unknown as T;
  if (responseFormat === 'json_object') {
    parsedJson = extractAndParseJson<T>(rawText);
  }

  return {
    rawText,
    json: parsedJson,
    provider: 'gemini',
    modelUsed: modelName,
  };
}

// ── Groq Provider ────────────────────────────────────────────────────────────

let _lastGroqKey: string | null = null;
let _groqClient: Groq | null = null;
function getGroqClient(): Groq | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  if (!_groqClient || _lastGroqKey !== apiKey) {
    _lastGroqKey = apiKey;
    _groqClient = new Groq({ apiKey });
  }
  return _groqClient;
}

async function callGroq<T = any>(
  options: LlmRequestOptions,
  modelName: string,
  groq: Groq
): Promise<LlmResponse<T>> {
  const { systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4000, responseFormat = 'json_object' } = options;

  const completion = await groq.chat.completions.create({
    model: modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
    ...(responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
  });

  const rawText = completion.choices[0]?.message?.content ?? '';
  if (!rawText.trim()) {
    throw new Error(`Groq returned empty response for model ${modelName}`);
  }

  let parsedJson: T = undefined as unknown as T;
  if (responseFormat === 'json_object') {
    parsedJson = extractAndParseJson<T>(rawText);
  }

  return {
    rawText,
    json: parsedJson,
    provider: 'groq',
    modelUsed: modelName,
  };
}

// ── OpenRouter Provider ──────────────────────────────────────────────────────

async function callOpenRouter<T = any>(
  options: LlmRequestOptions,
  modelName: string,
  apiKey: string
): Promise<LlmResponse<T>> {
  const { systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4000 } = options;

  const messages = [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `HTTP ${res.status} from OpenRouter`);
  }

  const rawText = data.choices?.[0]?.message?.content ?? '';
  if (!rawText.trim()) {
    throw new Error(`OpenRouter returned empty response for model ${modelName}`);
  }

  let parsedJson: T = undefined as unknown as T;
  if (options.responseFormat === 'json_object') {
    parsedJson = extractAndParseJson<T>(rawText);
  }

  return {
    rawText,
    json: parsedJson,
    provider: 'openrouter',
    modelUsed: modelName,
  };
}

// ── Claude Fallback ──────────────────────────────────────────────────────────

let _lastAnthropicKey: string | null = null;
let _anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!_anthropicClient || _lastAnthropicKey !== apiKey) {
    _lastAnthropicKey = apiKey;
    _anthropicClient = new Anthropic({ apiKey });
  }
  return _anthropicClient;
}

// ── Dispatcher with Automatic Fallbacks ──────────────────────────────────────

export async function generateWithFallback<T = any>(
  options: LlmRequestOptions
): Promise<LlmResponse<T>> {
  const { taskName } = options;
  const errors: string[] = [];

  // ── Step 1: Google Gemini (Primary Engine) ─────────────────────────────────
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    for (const model of GEMINI_MODELS) {
      try {
        const result = await callGemini<T>(options, model, geminiApiKey);
        console.log(`[ai-generator] Provider: GEMINI served response for ${taskName} (model: ${model})`);
        return result;
      } catch (err: any) {
        const msg = err?.message || String(err);
        errors.push(`Gemini(${model}): ${msg}`);
        if (msg.includes('404') || msg.includes('no longer available') || msg.includes('not found')) {
          continue;
        }
        console.warn(`[ai-generator] Gemini (${model}) failed for ${taskName}: ${msg}`);
      }
    }
  }

  // ── Step 2: Groq (Secondary Engine) ────────────────────────────────────────
  const groq = getGroqClient();
  if (groq) {
    const candidateModels = Array.from(new Set([getModelName(), ...GROQ_MODELS]));
    for (const model of candidateModels) {
      try {
        const result = await callGroq<T>(options, model, groq);
        console.log(`[ai-generator] Provider: GROQ served response for ${taskName} (model: ${model})`);
        return result;
      } catch (err: any) {
        const msg = err?.message || String(err);
        errors.push(`Groq(${model}): ${msg}`);
        if (msg.includes('model_not_found') || msg.includes('does not exist')) {
          continue;
        }
        console.warn(`[ai-generator] Groq (${model}) failed for ${taskName}: ${msg}`);
      }
    }
  }

  // ── Step 3: OpenRouter (Tertiary Elastic Pool) ─────────────────────────────
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (openRouterApiKey) {
    for (const model of OPENROUTER_MODELS) {
      try {
        const result = await callOpenRouter<T>(options, model, openRouterApiKey);
        console.log(`[ai-generator] Provider: OPENROUTER served response for ${taskName} (model: ${model})`);
        return result;
      } catch (err: any) {
        const msg = err?.message || String(err);
        errors.push(`OpenRouter(${model}): ${msg}`);
        console.warn(`[ai-generator] OpenRouter (${model}) failed for ${taskName}: ${msg}`);
      }
    }
  }

  // ── Step 4: Anthropic Claude (Optional Fallback) ───────────────────────────
  const anthropic = getAnthropicClient();
  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: options.maxTokens ?? 2000,
        temperature: options.temperature ?? 0.7,
        system: options.systemPrompt,
        messages: [{ role: 'user', content: options.userPrompt }],
      });
      const rawText = response.content[0]?.type === 'text' ? response.content[0].text : '';
      let parsedJson: T = undefined as unknown as T;
      if (options.responseFormat === 'json_object') {
        parsedJson = extractAndParseJson<T>(rawText);
      }
      console.log(`[ai-generator] Provider: CLAUDE served response for ${taskName}`);
      return {
        rawText,
        json: parsedJson,
        provider: 'claude',
        modelUsed: 'claude-3-5-sonnet-20241022',
      };
    } catch (err: any) {
      errors.push(`Claude: ${err?.message || String(err)}`);
    }
  }

  // ── All Providers Exhausted ────────────────────────────────────────────────
  const detailedSummary = errors.join(' | ');
  console.error(`[ai-generator] All AI providers failed for ${taskName}: ${detailedSummary}`);
  throw new AiGenerationError('stage_content', `AI generation failed across all providers: ${detailedSummary}`);
}
