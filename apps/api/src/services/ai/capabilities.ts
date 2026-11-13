import type { Capabilities, DiscoveredModel, Protocol, ProviderId } from "./types.js";

/**
 * Provider routing table and the only place that knows what a model *name*
 * implies. A list endpoint that reports nothing produces `false` plus a note —
 * we never claim a capability a provider has not stated.
 */

export const PROVIDER_PROTOCOL: Record<ProviderId, Protocol> = {
  openai: "openai_compatible",
  deepseek: "openai_compatible",
  groq: "openai_compatible",
  ollama: "openai_compatible",
  custom: "openai_compatible",
  anthropic: "anthropic",
  gemini: "gemini",
};

export const PROTOCOL_LABEL_FA: Record<Protocol, string> = {
  openai_compatible: "سازگار با OpenAI",
  anthropic: "Anthropic Messages",
  gemini: "Google Gemini",
};

export const DEFAULT_BASE_URL: Record<ProviderId, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  groq: "https://api.groq.com/openai/v1",
  ollama: "http://127.0.0.1:11434/v1",
  custom: "http://127.0.0.1:8787/api/mock-ai/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};

/**
 * Whether a provider needs a stored key at all. Ollama runs on the laptop and a
 * custom gateway may be an internal keyless one; everything else is refused
 * before a request is even built, rather than sending an empty bearer token.
 */
export const PROVIDER_REQUIRES_KEY: Record<ProviderId, boolean> = {
  openai: true,
  anthropic: true,
  gemini: true,
  deepseek: true,
  groq: true,
  ollama: false,
  custom: false,
};

/** Used only when neither the request nor AiModelConfig names a model. */
export const DEFAULT_MODEL: Record<ProviderId, string> = {
  openai: "gpt-4o-mini",
  deepseek: "deepseek-chat",
  groq: "llama-3.3-70b-versatile",
  ollama: "llama3.1",
  custom: "fitplaner-ai",
  anthropic: "claude-sonnet-4-5",
  gemini: "gemini-2.5-flash",
};

/** Providers whose list endpoint is the verification call too. */
export const MODEL_LIST_PATH: Partial<Record<Protocol, string>> = {
  openai_compatible: "/models",
  anthropic: "/v1/models",
  gemini: "/models",
};

const NONE: Capabilities = { vision: false, tools: false, streaming: false, reasoning: false };

/**
 * Conservative name matching for providers that return bare ids (OpenAI, Groq,
 * DeepSeek and Ollama do not describe capabilities in /models).
 */
export function inferCapabilities(provider: ProviderId, modelId: string): DiscoveredModel {
  const id = modelId.toLowerCase();
  const capabilities: Capabilities = { ...NONE, streaming: true };
  // This table is only consulted when the provider itself reported nothing.
  const notes: string[] = ["capabilities_inferred_from_model_name"];

  // Multimodal input
  if (/vision|multimodal|\b(gpt-4o|gpt-4\.1|chatgpt-4o|gemini|claude|qwen-vl|llava|minicpm-v|moondream|fitplaner)\b/.test(id)) {
    capabilities.vision = true;
  } else if (provider === "ollama") {
    capabilities.vision = /llava|minicpm|qwen2\.5-vl|moondream|nanobrowser/.test(id);
  } else {
    capabilities.vision = false;
  }

  // Function/tool calling
  if (provider === "openai" || provider === "groq" || provider === "deepseek" || provider === "custom") {
    capabilities.tools = /^(gpt-4|gpt-4o|gpt-4\.1|o[134]|gpt-5|chatgpt|deepseek-chat|llama-3\.[1-3]|fitplaner)/.test(id);
  } else if (provider === "anthropic") {
    capabilities.tools = id.startsWith("claude-");
  } else if (provider === "gemini") {
    capabilities.tools = /gemini-[12]/.test(id) && !/-live-|-audio-/.test(id);
  } else {
    capabilities.tools = false;
  }

  // Reasoning / thinking budgets
  if (/\b(o1|o3|o4-mini|gpt-5|deepseek-reasoner|thinking|reasoning)\b/.test(id)) {
    capabilities.reasoning = true;
  } else if (provider === "anthropic" && /claude-(3-7|4|opus-4)/.test(id)) {
    capabilities.reasoning = true;
  } else if (provider === "gemini" && /gemini-2\.[5-9]/.test(id)) {
    capabilities.reasoning = true;
  } else {
    capabilities.reasoning = false;
  }

  if (provider === "ollama") notes.push("ollama_local_capabilities_unverified");

  return {
    id: modelId,
    label: modelId,
    capabilities,
    note: notes.join(","),
    contextWindow: null,
    maxOutputTokens: null,
  };
}

/**
 * Anthropic's /v1/models reports family + ids and nothing about modalities, so
 * the vision/tool flags come from the name table above and are labelled as such.
 */
export function withProviderNote(model: DiscoveredModel, note: string): DiscoveredModel {
  return {
    ...model,
    note: model.note ? `${model.note},${note}` : note,
  };
}

export function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}
