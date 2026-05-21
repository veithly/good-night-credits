import { NextRequest, NextResponse } from "next/server";
import {
  ChatMessage,
  chatCompletion,
  discoverAll,
  effectiveMaxTokens,
  estimateCreditCost,
  findModel,
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

function tokenFrom(req: NextRequest): string | null {
  // Accept either OpenAI-style "Authorization: Bearer ..." or Anthropic-style
  // "x-api-key: ..." so the same gnc_live_* key works for any SDK.
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(\S+)/i);
    if (m) return m[1];
    return auth.trim();
  }
  const xk = req.headers.get("x-api-key");
  return xk ? xk.trim() : null;
}

interface Body {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export async function POST(req: NextRequest) {
  await prepareRequestStore();
  const token = tokenFrom(req);
  if (!token) {
    return NextResponse.json(
      { error: { message: "Missing API key.", type: "invalid_request_error" } },
      { status: 401 },
    );
  }
  const rec = findByToken(token);
  if (!rec) {
    return NextResponse.json(
      { error: { message: "Invalid API key.", type: "invalid_request_error" } },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body.", type: "invalid_request_error" } },
      { status: 400 },
    );
  }
  if (!body?.model || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: { message: "Both `model` and non-empty `messages` are required.", type: "invalid_request_error" } },
      { status: 400 },
    );
  }

  const all = await discoverAll();
  const model = findModel(all, body.model);
  if (!model) {
    return NextResponse.json(
      { error: { message: `Unknown model \`${body.model}\`. Call /v1/models to list available ones.`, type: "model_not_found" } },
      { status: 404 },
    );
  }

  // Scope check.
  if (model.tier === "advanced" && rec.scope === "basic") {
    return NextResponse.json(
      {
        error: {
          message: "This API key is scoped to basic models. Issue a key with scope=all to use advanced models.",
          type: "permission_denied",
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
          error: {
            message: "Advanced model locked.",
            type: "tier_locked",
            requires: elig.reasons,
          },
        },
        { status: 402 },
      );
    }
  }

  // Cheap pre-flight cost estimate based on message size.
  const promptChars = body.messages.reduce((a, m) => a + (m.content?.length ?? 0), 0);
  const estimatedPromptTokens = Math.max(1, Math.ceil(promptChars / 4));
  const estimatedCompletionBudget = effectiveMaxTokens(model, body.max_tokens);
  const estimatedCost = estimateCreditCost(
    model,
    estimatedPromptTokens,
    estimatedCompletionBudget,
  );
  if (availableBalance(rec.userId) < estimatedCost) {
    return NextResponse.json(
      {
        error: {
          message: `Insufficient credits. Estimated cost ${estimatedCost} cr, balance ${availableBalance(rec.userId)} cr.`,
          type: "insufficient_credits",
        },
      },
      { status: 402 },
    );
  }

  let result;
  try {
    result = await chatCompletion(model, {
      messages: body.messages,
      maxTokens: body.max_tokens ?? 900,
      temperature: body.temperature ?? 0.6,
      stream: false,
    });
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message, type: "upstream_error" } },
      { status: 502 },
    );
  }

  const cost = estimateCreditCost(model, result.promptTokens, result.completionTokens);

  const evt: TokenEvent = {
    id: uid("evt"),
    userId: rec.userId,
    timestamp: Date.now(),
    // API-key calls behave like an external "agent" — they count against
    // the agent budget rather than the manual allowance (PRD §15.1).
    usageType: "agent",
    source: "api_gateway",
    tokensUsed: result.totalTokens,
    creditsUsed: cost,
    modelName: model.modelName,
    promptHash: shortHash(JSON.stringify(body.messages)),
    isDuringRestWindow: isInsideRestWindow(rec.userId),
  };
  db().tokenEvents.push(evt);
  save();

  addCredits({
    userId: rec.userId,
    amount: -cost,
    type: "agent_usage",
    reason: `API · ${model.publicId}`,
    relatedEntityType: "token_event",
    relatedEntityId: evt.id,
  });
  recordUsage(rec.id, cost);

  return NextResponse.json({
    id: `chatcmpl-${evt.id}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: model.publicId,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: result.text },
        finish_reason: result.finishReason ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      total_tokens: result.totalTokens,
    },
    // gnc-specific telemetry — provider intentionally omitted.
    gnc: {
      credits_used: cost,
      remaining_credits: availableBalance(rec.userId),
      tier: model.tier,
    },
  });
}
