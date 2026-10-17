import { generateObject, generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { z } from 'zod';

export interface LLMOptions<T = any> {
  apiKey?: string;
  primaryModel?: string;
  fallbackModel?: string;
  retryDelays?: number[];
  caller?: (modelName: string, prompt: string, schema: z.ZodType<T, any, any>) => Promise<T>;
}

export function isRateLimitError(err: any): boolean {
  if (!err) return false;
  if (err.status === 429 || err.statusCode === 429 || err.code === 429) return true;
  if (err.code === 'RESOURCE_EXHAUSTED' || err.statusText === 'Too Many Requests') return true;
  const msg = String(err.message ?? '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit')
  );
}

/**
 * Gemma models answer in JSON mode but routinely wrap the object in a markdown fence
 * (```json ... ```) or add prose around it, which the AI SDK's strict parser rejects
 * ("No object generated: could not parse the response"). Extracts the JSON object text.
 * Returns null when there is nothing that looks like a JSON object.
 */
export function extractJsonText(raw: string): string | null {
  if (!raw) return null;
  const text = raw.trim();

  const fenced = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(text);
  const candidate = (fenced ? fenced[1]! : text).trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/** Model produced output we could not turn into a schema-valid object (as opposed to a transport/auth failure). */
export function isUnparseableOutputError(err: any): boolean {
  if (!err) return false;
  const name = String(err.name ?? '');
  return (
    name === 'AI_NoObjectGeneratedError' ||
    name === 'AI_JSONParseError' ||
    name === 'AI_TypeValidationError' ||
    String(err.message ?? '').includes('No object generated')
  );
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateStructuredWithFallback<T>(
  prompt: string,
  schema: z.ZodType<T, any, any>,
  options?: LLMOptions<T>
): Promise<T> {
  const primaryModel = options?.primaryModel ?? 'gemma-4-31b-it';
  const fallbackModel = options?.fallbackModel ?? 'gemini-2.5-flash-lite';
  const retryDelays = options?.retryDelays ?? [1000, 2000];

  const apiKey =
    options?.apiKey ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GEMINI_API_KEY ??
    '';

  const defaultCaller = async (
    modelName: string,
    promptText: string,
    outputSchema: z.ZodType<T, any, any>
  ): Promise<T> => {
    const google = createGoogleGenerativeAI({ apiKey });
    const result = await generateObject({
      model: google(modelName) as any,
      schema: outputSchema,
      prompt: promptText,
      experimental_repairText: async ({ text }) => extractJsonText(text),
    });
    return result.object;
  };

  const callModel = options?.caller ?? defaultCaller;

  let lastError: any = null;

  // Try primary model with up to 2 rate-limit retries
  let fallbackReason = 'rate limit exhausted';
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      return await callModel(primaryModel, prompt, schema);
    } catch (err: any) {
      lastError = err;

      // The model answered but not in a usable shape: retrying the same model rarely helps,
      // so go straight to the fallback model.
      if (isUnparseableOutputError(err)) {
        fallbackReason = 'unparseable output';
        break;
      }

      if (!isRateLimitError(err)) {
        // Non-429 error fails immediately
        throw err;
      }

      if (attempt < retryDelays.length) {
        const waitMs = retryDelays[attempt];
        await delay(waitMs);
      }
    }
  }

  // If the primary model is rate limited or returns unusable output, fall back to gemini-2.5-flash-lite
  console.warn(
    `[LLM] Primary model (${primaryModel}) ${fallbackReason}. Falling back to ${fallbackModel}`
  );

  try {
    return await callModel(fallbackModel, prompt, schema);
  } catch (fallbackErr: any) {
    throw new Error(
      `Both primary (${primaryModel}) and fallback (${fallbackModel}) models failed. Last primary error: ${lastError?.message}. Fallback error: ${fallbackErr?.message}`
    );
  }
}

export interface JsonTextOptions {
  apiKey?: string;
  primaryModel?: string;
  fallbackModel?: string;
  /** Test seam: returns the raw model text for (modelName, prompt). */
  caller?: (modelName: string, prompt: string) => Promise<string>;
}

/**
 * Free-text JSON generation with model fallback, parsed leniently (markdown fences and
 * surrounding prose are tolerated). Used where a provider-side response schema is a poor
 * fit (e.g. the tool planner, whose `args` are free-form per tool) and for Gemma, which
 * does not support native function calling.
 */
export async function generateJsonWithFallback(
  prompt: string,
  options?: JsonTextOptions
): Promise<unknown> {
  const primaryModel = options?.primaryModel ?? 'gemma-4-31b-it';
  const fallbackModel = options?.fallbackModel ?? 'gemini-2.5-flash-lite';
  const apiKey =
    options?.apiKey ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GEMINI_API_KEY ??
    '';

  const callModel =
    options?.caller ??
    (async (modelName: string, promptText: string): Promise<string> => {
      const google = createGoogleGenerativeAI({ apiKey });
      const result = await generateText({ model: google(modelName) as any, prompt: promptText });
      return result.text;
    });

  const attempt = async (modelName: string): Promise<unknown> => {
    const text = await callModel(modelName, prompt);
    const json = extractJsonText(text);
    if (!json) throw new Error(`Model ${modelName} returned no JSON object`);
    return JSON.parse(json);
  };

  try {
    return await attempt(primaryModel);
  } catch (primaryErr: any) {
    console.warn(`[LLM] Primary model (${primaryModel}) failed for JSON generation: ${primaryErr?.message}. Falling back to ${fallbackModel}`);
    try {
      return await attempt(fallbackModel);
    } catch (fallbackErr: any) {
      throw new Error(
        `Both primary (${primaryModel}) and fallback (${fallbackModel}) models failed. Primary: ${primaryErr?.message}. Fallback: ${fallbackErr?.message}`
      );
    }
  }
}

/** True when an API key for the default (Gemini-API) models is configured. */
export function hasLlmApiKey(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY);
}
