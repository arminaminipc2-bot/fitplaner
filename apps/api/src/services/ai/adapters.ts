import { AppError } from "../../http.js";
import { anthropicAdapter } from "./anthropic.js";
import { PROVIDER_PROTOCOL } from "./capabilities.js";
import { geminiAdapter } from "./gemini.js";
import { openaiAdapter } from "./openai.js";
import type { Completion, ProviderAdapter, ProviderId, Protocol, ProviderTarget } from "./types.js";

/** One seam between "which provider" and "which wire protocol". */
const ADAPTERS: Record<Protocol, ProviderAdapter> = {
  openai_compatible: openaiAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
};

export function adapterFor(provider: ProviderId): ProviderAdapter {
  return ADAPTERS[PROVIDER_PROTOCOL[provider]];
}

export type VerifyResult =
  | { method: "model_list"; models: number }
  | { method: "generation"; completion: Completion };

/**
 * The cheapest authenticated round-trip that proves a key: the model list first,
 * because it costs no tokens. A gateway without a list endpoint (a `custom`
 * base URL, for instance) falls back to one four-token generation.
 */
export async function verifyTarget(target: ProviderTarget, modelId: string): Promise<VerifyResult> {
  const adapter = adapterFor(target.provider);
  try {
    const models = await adapter.listModels(target);
    return { method: "model_list", models: models.length };
  } catch (error) {
    const listWasUnusable =
      error instanceof AppError &&
      ["provider_model_unavailable", "provider_request_rejected", "ai_invalid_response"].includes(error.code);
    if (!listWasUnusable) throw error;
    const completion = await adapter.verify(target, modelId);
    return { method: "generation", completion };
  }
}
