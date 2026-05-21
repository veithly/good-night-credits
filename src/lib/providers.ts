// Private AI gateway — exposes a single public model name while keeping the
// backing API origin and routing details server-side.

import { shortHash } from "./utils";

export type ModelTier = "basic" | "advanced";

export interface ProviderConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  badges?: string[];
  /** When set, only these model IDs are surfaced; everything else hidden. */
  allowlist?: string[];
}

export interface DiscoveredModel {
  /** Internal canonical id like `aurora:gpt-5.5`. Kept for back-compat — never surfaced to users. */
  id: string;
  /** User-facing id with the provider stripped — e.g. `gpt-5.5`. */
  publicId: string;
  providerId: string;
  modelName: string;           // upstream id (gpt-5.5)
  ownedBy?: string;
  tier: ModelTier;
  inputCost: number;           // credits per 1k input tokens
  outputCost: number;          // credits per 1k output tokens
  contextWindow?: number;
  label: string;
  /**
   * Format-family hint used by the public gateway to decide which translation
   * to apply (OpenAI vs Anthropic). The upstream call always uses OpenAI
   * chat/completions because every provider we ship is OpenAI-compatible —
   * this flag only tells the public response shape what to look like.
   */
  family: "openai" | "anthropic" | "google";
}

function parsePublicModelIds(): string[] {
  const raw = process.env.MODEL_GATEWAY_MODELS || process.env.MODEL_GATEWAY_MODEL || "step-3.6";
  const ids = raw
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : ["step-3.6"];
}

export const PUBLIC_MODEL_ID = parsePublicModelIds()[0] ?? "step-3.6";
const PUBLIC_MODEL_ID_LIST = parsePublicModelIds();
const PUBLIC_MODEL_IDS = new Set(PUBLIC_MODEL_ID_LIST.map((id) => id.toLowerCase()));
const PRIVATE_PROVIDER_ID = "gateway";

export function listProviders(): ProviderConfig[] {
  const key = process.env.MODEL_GATEWAY_API_KEY;
  const baseURL = (process.env.MODEL_GATEWAY_BASE_URL_SECRET || process.env.MODEL_GATEWAY_BASE_URL || "").replace(/\/$/, "");
  if (!key || !baseURL) return [];
  return [
    {
      id: PRIVATE_PROVIDER_ID,
      name: "Private Model Gateway",
      baseURL,
      apiKey: key,
      allowlist: PUBLIC_MODEL_ID_LIST,
      badges: ["wallet"],
    } satisfies ProviderConfig,
  ];
}

export function getProvider(id: string): ProviderConfig | null {
  return listProviders().find((p) => p.id === id) ?? null;
}

// ── Model classification ────────────────────────────────────────────────────

/** Patterns that mark a model as advanced (gated behind rest+health). */
const ADVANCED_PATTERNS = [
  /^gpt-5/i,
  /^gpt-4o/i,
  /^o1/i,
  /^o3/i,
  /^claude-3\.7/i,
  /^claude-3-opus/i,
  /^claude-sonnet/i,
  /^gemini-2\.5-pro/i,
  /^gemini-3/i,
  /codex/i,
  /^deepseek-reasoner/i,
];

const BASIC_PATTERNS = [
  /^step-3\.6$/i,
  /flash-lite/i,
  /^gpt-4o-mini/i,
  /^gpt-3\.5/i,
  /^gpt-5\.4-mini/i,
  /^gemini-2\.5-flash$/i,
  /^claude-3-haiku/i,
  /^deepseek-chat/i,
  /^mistral/i,
];

function classify(modelId: string): ModelTier {
  if (BASIC_PATTERNS.some((p) => p.test(modelId))) return "basic";
  if (ADVANCED_PATTERNS.some((p) => p.test(modelId))) return "advanced";
  return "basic"; // unknown models default to basic to stay welcoming
}

function familyFor(modelId: string): "openai" | "anthropic" | "google" {
  if (/^claude/i.test(modelId)) return "anthropic";
  if (/^gemini/i.test(modelId)) return "google";
  return "openai";
}

function priceFor(tier: ModelTier): { inputCost: number; outputCost: number } {
  if (tier === "advanced") return { inputCost: 200, outputCost: 400 };
  return { inputCost: 50, outputCost: 100 };
}

function isStepReasoningModel(modelName: string): boolean {
  return /^step-3(\.|-|$)/i.test(modelName);
}

export function effectiveMaxTokens(model: DiscoveredModel, requestedMaxTokens?: number): number {
  const requested = requestedMaxTokens ?? 900;
  return isStepReasoningModel(model.modelName) ? Math.max(requested, 900) : requested;
}

// ── Discovery cache ─────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { ts: number; models: DiscoveredModel[] }>();

interface UpstreamModelRow {
  id: string;
  object?: string;
  owned_by?: string;
  context_length?: number;
}

/** Comma-separated denylist substrings — matched case-insensitively against the
 * model id. Lets ops hide chronically-broken model families per provider
 * without redeploying. Example: AURORA_DENYLIST=gemini,codex-auto-review
 */
export async function discoverModels(provider: ProviderConfig, opts: { fresh?: boolean } = {}): Promise<DiscoveredModel[]> {
  const key = provider.id;
  if (!opts.fresh) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.models;
  }
  try {
    const r = await fetch(`${provider.baseURL}/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`models_${r.status}`);
    const j = (await r.json()) as { data?: UpstreamModelRow[] };
    const rows = j.data ?? [];
    const models: DiscoveredModel[] = rows
      .filter((m) => m.id && !/embedding|whisper|tts|moderation|image/i.test(m.id))
      .filter((m) => PUBLIC_MODEL_IDS.has(publicIdFor(m.id).toLowerCase()))
      .map((m) => {
        const tier = classify(m.id);
        const price = priceFor(tier);
        return {
          id: `${provider.id}:${m.id}`,
          publicId: publicIdFor(m.id),
          providerId: provider.id,
          modelName: m.id,
          ownedBy: m.owned_by,
          tier,
          family: familyFor(m.id),
          inputCost: price.inputCost,
          outputCost: price.outputCost,
          contextWindow: m.context_length,
          label: m.id,
        } satisfies DiscoveredModel;
      })
      .sort((a, b) => {
        // basic first within owner, then alphabetic
        if (a.tier !== b.tier) return a.tier === "basic" ? -1 : 1;
        return a.modelName.localeCompare(b.modelName);
      });
    cache.set(key, { ts: Date.now(), models });
    return models;
  } catch (e) {
    void e;
    // Fall back to the configured public model so the UI and API contract stay
    // stable even if catalog discovery is temporarily unavailable.
    const models = PUBLIC_MODEL_ID_LIST.map((id) => {
      const tier = classify(id);
      const price = priceFor(tier);
      return {
        id: `${provider.id}:${id}`,
        publicId: publicIdFor(id),
        providerId: provider.id,
        modelName: id,
        ownedBy: undefined,
        tier,
        family: familyFor(id),
        inputCost: price.inputCost,
        outputCost: price.outputCost,
        label: id,
      } satisfies DiscoveredModel;
    });
    cache.set(key, { ts: Date.now(), models });
    return models;
  }
}

function publicIdFor(rawModelId: string): string {
  const slash = rawModelId.lastIndexOf("/");
  if (slash >= 0) return rawModelId.slice(slash + 1);
  return rawModelId;
}

/**
 * Provider priority order — kept so future private gateway redundancy can
 * dedupe without changing the public model contract.
 */
const PROVIDER_PRIORITY = [PRIVATE_PROVIDER_ID];

function providerRank(id: string): number {
  const i = PROVIDER_PRIORITY.indexOf(id);
  return i === -1 ? 99 : i;
}

export async function discoverAll(): Promise<DiscoveredModel[]> {
  const providers = listProviders();
  if (providers.length === 0) {
    return PUBLIC_MODEL_ID_LIST.map((id) => {
      const tier = classify(id);
      const price = priceFor(tier);
      return {
        id: `${PRIVATE_PROVIDER_ID}:${id}`,
        publicId: id,
        providerId: PRIVATE_PROVIDER_ID,
        modelName: id,
        tier,
        family: familyFor(id),
        inputCost: price.inputCost,
        outputCost: price.outputCost,
        label: id,
      };
    });
  }
  const results = await Promise.all(providers.map((p) => discoverModels(p)));
  // Dedupe by publicId so users only ever see one entry per model name. The
  // backing provider is kept on the record so the gateway can still route, it
  // just never leaks out of the server.
  const byPublic = new Map<string, DiscoveredModel>();
  for (const m of results.flat()) {
    const existing = byPublic.get(m.publicId);
    if (!existing || providerRank(m.providerId) < providerRank(existing.providerId)) {
      byPublic.set(m.publicId, m);
    }
  }
  return [...byPublic.values()].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "basic" ? -1 : 1;
    return a.publicId.localeCompare(b.publicId);
  });
}

/**
 * Find a model by any of:
 *   - new public id  (`gpt-5.5`)                 ← preferred
 *   - legacy canonical id  (`aurora:gpt-5.5`)    ← back-compat
 *   - raw upstream model name  (also `gpt-5.5` here, but kept in case the
 *     upstream returns a vendor-prefixed form like `openai/gpt-5.5`)
 */
export function findModel(allModels: DiscoveredModel[], id: string): DiscoveredModel | null {
  const lc = id.toLowerCase();
  return (
    allModels.find((m) => m.publicId.toLowerCase() === lc) ??
    allModels.find((m) => m.id.toLowerCase() === lc) ??
    allModels.find((m) => m.modelName.toLowerCase() === lc) ??
    null
  );
}

// ── Chat completion (streaming + non-streaming) ────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ChatRequest {
  modelId: string;            // canonical id, e.g. aurora:gpt-5.5
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ChatResponse {
  text: string;
  modelName: string;
  providerId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason?: string;
  raw?: unknown;
}

export async function chatCompletion(model: DiscoveredModel, req: Omit<ChatRequest, "modelId">): Promise<ChatResponse> {
  const provider = getProvider(model.providerId);
  if (!provider) {
    if (process.env.MODEL_GATEWAY_DEMO_MODE === "1" || process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
      const text = "Sleep restores; stimulants borrow from tomorrow.";
      const promptTokens = Math.ceil(JSON.stringify(req.messages).length / 4);
      const completionTokens = Math.ceil(text.length / 4);
      return {
        text,
        modelName: model.modelName,
        providerId: model.providerId,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        finishReason: "stop",
      };
    }
    throw new Error("provider_not_configured");
  }
  const gatewayMessages: ChatMessage[] = [
    {
      role: "system",
      content:
        "Return only the final answer text in assistant content. Do not expose reasoning, analysis, or scratch work.",
    },
    ...req.messages,
  ];
  const maxTokens = effectiveMaxTokens(model, req.maxTokens);
  const body: Record<string, unknown> = {
    model: model.modelName,
    messages: gatewayMessages,
    temperature: req.temperature ?? 0.6,
    stream: false,
  };
  if (!isStepReasoningModel(model.modelName)) {
    body.max_tokens = maxTokens;
  }

  const r = await fetch(`${provider.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`upstream_${r.status}: ${body.slice(0, 240)}`);
  }
  const j = (await r.json()) as {
    choices?: { message?: { content?: string | null; reasoning?: string | null }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const msg = j.choices?.[0]?.message;
  const text = (msg?.content && msg.content.trim().length > 0 ? msg.content : msg?.reasoning) ?? "";
  const usage = j.usage ?? {};
  const promptTokens = usage.prompt_tokens ?? Math.ceil(JSON.stringify(gatewayMessages).length / 4);
  const completionTokens = usage.completion_tokens ?? Math.ceil(text.length / 4);
  return {
    text,
    modelName: model.modelName,
    providerId: model.providerId,
    promptTokens,
    completionTokens,
    totalTokens: usage.total_tokens ?? promptTokens + completionTokens,
    finishReason: j.choices?.[0]?.finish_reason,
    raw: j,
  };
}

export function estimateCreditCost(model: DiscoveredModel, promptTokens: number, completionTokens: number): number {
  const input = (promptTokens / 1000) * model.inputCost;
  const output = (completionTokens / 1000) * model.outputCost;
  return Math.ceil(input + output);
}

export function providerSummary(): { id: string; name: string; baseURL: string; configured: boolean; keyHash: string; badges?: string[] }[] {
  const key = process.env.MODEL_GATEWAY_API_KEY ?? "";
  const baseURL = process.env.MODEL_GATEWAY_BASE_URL_SECRET || process.env.MODEL_GATEWAY_BASE_URL;
  return [{
    id: PRIVATE_PROVIDER_ID,
    name: "Private Model Gateway",
    baseURL: "",
    configured: Boolean(key && baseURL),
    keyHash: key ? shortHash(key) : "",
    badges: ["wallet"],
  }];
}
