import { generateObject } from 'ai';
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
    });
    return result.object;
  };

  const callModel = options?.caller ?? defaultCaller;

  let lastError: any = null;

  // Try primary model with up to 2 rate-limit retries
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      return await callModel(primaryModel, prompt, schema);
    } catch (err: any) {
      lastError = err;
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

  // If rate limits exhausted on primary model, fallback to gemini-2.5-flash-lite
  console.warn(
    `[LLM] Primary model (${primaryModel}) rate limit exhausted. Falling back to ${fallbackModel}`
  );

  try {
    return await callModel(fallbackModel, prompt, schema);
  } catch (fallbackErr: any) {
    throw new Error(
      `Both primary (${primaryModel}) and fallback (${fallbackModel}) models failed. Last primary error: ${lastError?.message}. Fallback error: ${fallbackErr?.message}`
    );
  }
}
