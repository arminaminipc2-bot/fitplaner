import { REASONING } from "../../domain.js";

/**
 * The vocabulary the whole AI layer speaks. Provider adapters translate these
 * shapes onto their own wire protocol, so nothing above this layer knows
 * whether a reply came from OpenAI, Anthropic or Gemini.
 */

export type Reasoning = (typeof REASONING)[number];

export type ProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "groq"
  | "ollama"
  | "custom";

export type Protocol = "openai_compatible" | "anthropic" | "gemini";

export type Capabilities = {
  vision: boolean;
  tools: boolean;
  streaming: boolean;
  reasoning: boolean;
};

/** One content part of a turn. Images are base64 — the server resolved the ref. */
export type ImageInput = {
  mediaType: string;
  base64: string;
};

export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  images?: ImageInput[];
};

export type ChatRequest = {
  modelId: string;
  system: string;
  /** Oldest first; the last entry is the user turn the model must answer. */
  turns: ChatTurn[];
  reasoning: Reasoning;
  maxOutputTokens: number | null;
  temperature: number;
  /** Absent unless the caller opts in (Phase 6); never invented. */
  tools?: ToolSchema[];
};

export type ToolCall = {
  id: string | null;
  name: string;
  argumentsJson: string;
};

/**
 * Declaration handed to the provider so the model *may* answer with a call.
 * Phase 5 only forwards them and surfaces the resulting call as data — nothing
 * here executes it.
 */
export type ToolSchema = {
  name: string;
  description: string;
  parametersJson: string;
};

export type Usage = {
  tokensIn: number | null;
  tokensOut: number | null;
};

export type Completion = {
  text: string;
  /** Surfaced as data, never executed here (Phase 6 owns execution). */
  toolCalls: ToolCall[];
  usage: Usage;
  finishReason: string;
  modelId: string;
};

/** What a caller (the SSE route) receives while the answer is arriving. */
export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "tool"; call: ToolCall }
  | { type: "notice"; code: string; message: string }
  | { type: "done"; completion: Completion };

export type DiscoveredModel = {
  id: string;
  label: string;
  capabilities: Capabilities;
  /**
   * Honest provenance: null when the provider itself reported the capability
   * set, otherwise a machine code saying which parts are only our guess.
   */
  note: string | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
};

/** Credentials plus resolved endpoint — the key only ever exists server-side. */
export type ProviderTarget = {
  provider: ProviderId;
  protocol: Protocol;
  /** Row label, used in user-facing sentences only. */
  label: string;
  baseUrl: string;
  apiKey: string | null;
};

export interface ProviderAdapter {
  readonly protocol: Protocol;
  readonly defaultBaseUrl: string;
  complete(target: ProviderTarget, request: ChatRequest): Promise<Completion>;
  stream(
    target: ProviderTarget,
    request: ChatRequest,
    onEvent: (event: StreamEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<Completion>;
  listModels(target: ProviderTarget, signal?: AbortSignal): Promise<DiscoveredModel[]>;
  /** Cheapest authenticated round-trip that proves the key works. */
  verify(target: ProviderTarget, modelId: string, signal?: AbortSignal): Promise<Completion>;
}

export const EMPTY_USAGE: Usage = { tokensIn: null, tokensOut: null };
