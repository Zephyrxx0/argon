import { BriefingSchema, type Briefing } from '../schemas/briefing.js';
import { buildBriefingPrompt } from './prompt.js';
import { generateStructuredWithFallback, type LLMOptions } from './llm.js';
import type { EvidenceBundle } from './types.js';

export class BriefingValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: unknown,
    public readonly rawOutput?: unknown
  ) {
    super(message);
    this.name = 'BriefingValidationError';
  }
}

export interface NarrationOptions {
  llmOptions?: LLMOptions<Briefing>;
  customGenerator?: (prompt: string) => Promise<unknown>;
}

export async function narrateBriefing(
  task: string,
  bundle: EvidenceBundle,
  options?: NarrationOptions
): Promise<Briefing> {
  const initialPrompt = buildBriefingPrompt(task, bundle);

  const generate = async (promptText: string): Promise<unknown> => {
    if (options?.customGenerator) {
      return await options.customGenerator(promptText);
    }
    return await generateStructuredWithFallback(
      promptText,
      BriefingSchema,
      options?.llmOptions
    );
  };

  const rawOutput = await generate(initialPrompt);
  const firstParse = BriefingSchema.safeParse(rawOutput);

  if (firstParse.success) {
    return firstParse.data;
  }

  // Automated 1-step Zod repair loop conforming to D-10
  console.warn(
    '[Narrator] Initial briefing output failed Zod schema validation. Triggering 1-step repair loop.'
  );

  const errorIssues = firstParse.error.issues;
  const repairPrompt = `${initialPrompt}

---
CRITICAL CORRECTION REQUIRED:
Your previous response failed schema validation with the following errors:
${JSON.stringify(errorIssues, null, 2)}

Previous Output:
${JSON.stringify(rawOutput, null, 2)}

Please return a corrected, valid JSON object that strictly adheres to the BriefingSchema.
Every claim in keyTakeaways, affectedComponents, keyOwners, constrainingDecisions, and precedents MUST include non-empty citedNodeIds: string[] matching exact NodeId values from the <EVIDENCE> block above.`;

  const repairedOutput = await generate(repairPrompt);
  const secondParse = BriefingSchema.safeParse(repairedOutput);

  if (!secondParse.success) {
    throw new BriefingValidationError(
      'Briefing narration output failed Zod schema validation after 1 repair attempt.',
      secondParse.error.issues,
      repairedOutput
    );
  }

  return secondParse.data;
}
