/**
 * Anthropic-compatible `/v1/messages` gateway.
 *
 * Same wallet + tier-gate as `/v1/chat/completions`, just speaks the Anthropic
 * request/response shape so the official Anthropic SDKs — and tools that ride
 * on top of them (Claude Code, the desktop Claude app's "Custom API URL", any
 * code that imports `@anthropic-ai/sdk`) — can point at us with their normal
 * `x-api-key: <gnc_live_...>` header and have it Just Work.
 *
 * The actual upstream call always goes out as OpenAI chat/completions because
 * every provider we ship is OpenAI-compatible. This file is purely a
 * translation layer: Anthropic request → OpenAI request, then OpenAI response
 * → Anthropic response.
 *
 * What this DOES NOT support yet:
 *   - Tool use / vision content blocks. Tool-call and image blocks are
 *     stripped to a `[non-text content]` placeholder so we never silently
 *     drop billable tokens. (Aurora's upstream handles tools natively when we
 *     do add it.)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  chatCompletion,
  discoverAll,
  effectiveMaxTokens,
  estimateCreditCost,
  findModel,
  type ChatMessage,
} from "@/lib/providers";
import { canUseTier } from "@/lib/eligibility";
import { findByToken, recordUsage } from "@/lib/api-keys";
import { addCredits, availableBalance } from "@/lib/credits";
import { db, save, uid } from "@/lib/store";
import { isInsideRestWindow } from "@/lib/rest-window";
import { shortHash } from "@/lib/utils";
import type { TokenEvent } from "@/lib/types";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Auth ──────────────────────────────────────────────────────────────────

function tokenFrom(req: NextRequest): string | null {
  // Anthropic SDKs send `x-api-key`. OpenAI clients use `Authorization: Bearer`.
  // We accept both so a single gnc_live_* key works for any caller.
  const xk = req.headers.get("x-api-key");
  if (xk) return xk.trim();
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(\S+)/i);
  return m ? m[1] : auth.trim();
}

// ─── Anthropic request shape ──────────────────────────────────────────────

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source?: { type: string; media_type?: string; data?: string } }
  | { type: "tool_use"; id?: string; name?: string; input?: unknown }
  | { type: "tool_result"; tool_use_id?: string; content?: AnthropicContentBlock[] | string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string | Array<{ type: "text"; text: string }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
  metadata?: { user_id?: string };
}

// ─── Translators ──────────────────────────────────────────────────────────

function flattenContent(content: AnthropicMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => {
      if (b.type === "text") return b.text;
      if (b.type === "tool_result") {
        if (typeof b.content === "string") return b.content;
        if (Array.isArray(b.content)) return flattenContent(b.content);
        return "";
      }
      return `[${b.type} block]`;
    })
    .filter(Boolean)
    .join("\n");
}

function flattenSystem(system?: AnthropicRequest["system"]): string {
  if (!system) return "";
  if (typeof system === "string") return system;
  return system
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
}

function toOpenAIMessages(req: AnthropicRequest): ChatMessage[] {
  const out: ChatMessage[] = [];
  const sys = flattenSystem(req.system);
  if (sys) out.push({ role: "system", content: sys });
  for (const m of req.messages ?? []) {
    out.push({ role: m.role, content: flattenContent(m.content) });
  }
  return out;
}

/** OpenAI finish_reason → Anthropic stop_reason. */
function toStopReason(finish: string | undefined): "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" {
  switch (finish) {
    case "length":
      return "max_tokens";
    case "tool_calls":
      return "tool_use";
    case "stop_sequence":
      return "stop_sequence";
    default:
      return "end_turn";
  }
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function chunks(text: string, size = 96): string[] {
  if (!text) return [""];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

// ─── POST /v1/messages ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  await prepareRequestStore();
  const token = tokenFrom(req);
  if (!token) {
    return NextResponse.json(
      {
        type: "error",
        error: {
          type: "authentication_error",
          message:
            "Missing API key. Send `x-api-key: <gnc_live_...>` (Anthropic style) or `Authorization: Bearer <gnc_live_...>`.",
        },
      },
      { status: 401 },
    );
  }
  const rec = findByToken(token);
  if (!rec) {
    return NextResponse.json(
      { type: "error", error: { type: "authentication_error", message: "Invalid API key." } },
      { status: 401 },
    );
  }

  let body: AnthropicRequest;
  try {
    body = (await req.json()) as AnthropicRequest;
  } catch {
    return NextResponse.json(
      { type: "error", error: { type: "invalid_request_error", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }
  if (!body?.model || !Array.isArray(body?.messages) || body.messages.length === 0) {
    return NextResponse.json(
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Both `model` and a non-empty `messages` array are required.",
        },
      },
      { status: 400 },
    );
  }

  const all = await discoverAll();
  const model = findModel(all, body.model);
  if (!model) {
    return NextResponse.json(
      {
        type: "error",
        error: {
          type: "not_found_error",
          message: `Unknown model \`${body.model}\`. GET /v1/models to list available ones.`,
        },
      },
      { status: 404 },
    );
  }

  // Scope check (basic key cannot call advanced models).
  if (model.tier === "advanced" && rec.scope === "basic") {
    return NextResponse.json(
      {
        type: "error",
        error: {
          type: "permission_error",
          message: "This API key is scoped to basic models. Issue a new key with scope=all.",
        },
      },
      { status: 403 },
    );
  }

  // Eligibility check (only enforced for advanced models).
  if (model.tier === "advanced") {
    const elig = canUseTier(rec.userId, "advanced");
    if (!elig.allowed) {
      return NextResponse.json(
        {
          type: "error",
          error: {
            type: "permission_error",
            message: "Advanced model locked. Sleep + sync your wearable, then retry.",
            requires: elig.reasons,
          },
        },
        { status: 402 },
      );
    }
  }

  // Cheap pre-flight cost estimate so we don't burn an upstream call when
  // the wallet is empty.
  const messages = toOpenAIMessages(body);
  const promptChars = messages.reduce((a, m) => a + m.content.length, 0);
  const estimatedPromptTokens = Math.max(1, Math.ceil(promptChars / 4));
  const requestedMax = body.max_tokens ?? 1024;
  const estimatedCost = estimateCreditCost(
    model,
    estimatedPromptTokens,
    effectiveMaxTokens(model, requestedMax),
  );
  if (availableBalance(rec.userId) < estimatedCost) {
    return NextResponse.json(
      {
        type: "error",
        error: {
          type: "rate_limit_error",
          message: `Insufficient credits. Estimated cost ${estimatedCost} cr, balance ${availableBalance(rec.userId)} cr.`,
        },
      },
      { status: 402 },
    );
  }

  let result;
  try {
    result = await chatCompletion(model, {
      messages,
      maxTokens: requestedMax,
      temperature: body.temperature ?? 0.7,
      stream: false,
    });
  } catch (e) {
    return NextResponse.json(
      {
        type: "error",
        error: { type: "api_error", message: (e as Error).message },
      },
      { status: 502 },
    );
  }

  const cost = estimateCreditCost(model, result.promptTokens, result.completionTokens);

  const evt: TokenEvent = {
    id: uid("evt"),
    userId: rec.userId,
    timestamp: Date.now(),
    usageType: "agent",
    source: "api_gateway",
    tokensUsed: result.totalTokens,
    creditsUsed: cost,
    modelName: model.modelName,
    promptHash: shortHash(JSON.stringify(messages)),
    isDuringRestWindow: isInsideRestWindow(rec.userId),
  };
  db().tokenEvents.push(evt);
  save();

  addCredits({
    userId: rec.userId,
    amount: -cost,
    type: "agent_usage",
    reason: `Anthropic API · ${model.publicId}`,
    relatedEntityType: "token_event",
    relatedEntityId: evt.id,
  });
  recordUsage(rec.id, cost);

  const text = result.text ?? "";
  const stopReason = toStopReason(result.finishReason);
  const message = {
    id: `msg_${evt.id}`,
    type: "message",
    role: "assistant",
    model: model.publicId,
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: result.promptTokens,
      output_tokens: result.completionTokens,
    },
    // gnc-specific telemetry on a namespaced field so Anthropic SDKs ignore it.
    gnc: {
      credits_used: cost,
      remaining_credits: availableBalance(rec.userId),
      tier: model.tier,
    },
  };

  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            sse("message_start", {
              type: "message_start",
              message: { ...message, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: result.promptTokens, output_tokens: 0 } },
            }),
          ),
        );
        controller.enqueue(
          encoder.encode(
            sse("content_block_start", {
              type: "content_block_start",
              index: 0,
              content_block: { type: "text", text: "" },
            }),
          ),
        );
        for (const part of chunks(text)) {
          controller.enqueue(
            encoder.encode(
              sse("content_block_delta", {
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text: part },
              }),
            ),
          );
        }
        controller.enqueue(encoder.encode(sse("content_block_stop", { type: "content_block_stop", index: 0 })));
        controller.enqueue(
          encoder.encode(
            sse("message_delta", {
              type: "message_delta",
              delta: { stop_reason: stopReason, stop_sequence: null },
              usage: { output_tokens: result.completionTokens },
            }),
          ),
        );
        controller.enqueue(encoder.encode(sse("message_stop", { type: "message_stop" })));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  return NextResponse.json(message);
}
