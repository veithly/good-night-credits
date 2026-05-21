import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runModel, runPlaygroundTool } from "@/lib/playground";
import { PLAYGROUND_PRICING, type PlaygroundTool } from "@/lib/credits";
import { DEMO_USER_ID } from "@/lib/demo";
import { isInsideRestWindow } from "@/lib/rest-window";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ToolSchema = z.object({
  mode: z.literal("tool").optional(),
  tool: z.enum([
    "generate_readme",
    "generate_pitch",
    "review_code",
    "plan_agent_tasks",
  ]),
  prompt: z.string().min(1).max(4000),
  confirm_during_rest: z.boolean().optional(),
});

const ModelSchema = z.object({
  mode: z.literal("model"),
  model_id: z.string().min(1),
  prompt: z.string().min(1).max(8000),
  system_prompt: z.string().max(2000).optional(),
  max_tokens: z.number().int().min(64).max(4000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  confirm_during_rest: z.boolean().optional(),
});

export async function GET() {
  await prepareRequestStore();
  return NextResponse.json({ pricing: PLAYGROUND_PRICING });
}

export async function POST(req: NextRequest) {
  await prepareRequestStore();
  const body = await req.json();

  // Multi-provider model mode.
  if (body.mode === "model") {
    const parsed = ModelSchema.parse(body);
    if (isInsideRestWindow(DEMO_USER_ID) && !parsed.confirm_during_rest) {
      return NextResponse.json(
        {
          warning: "in_rest_window",
          message: "You are currently in your rest window. Running this task may reduce tonight's bonus.",
        },
        { status: 409 },
      );
    }
    try {
      const result = await runModel({
        userId: DEMO_USER_ID,
        modelId: parsed.model_id,
        prompt: parsed.prompt,
        systemPrompt: parsed.system_prompt,
        maxTokens: parsed.max_tokens,
        temperature: parsed.temperature,
      });
      return NextResponse.json(result);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.startsWith("tier_locked")) {
        return NextResponse.json(
          { error: "tier_locked", requires: msg.split(":")[1]?.split("|").map((s) => s.trim()).filter(Boolean) ?? [] },
          { status: 402 },
        );
      }
      if (msg.startsWith("insufficient_credits")) {
        return NextResponse.json({ error: "insufficient_credits", needed: parseInt(msg.split(":")[1] ?? "0") }, { status: 402 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  // Tool template mode (legacy).
  const parsed = ToolSchema.parse(body);
  if (isInsideRestWindow(DEMO_USER_ID) && !parsed.confirm_during_rest) {
    return NextResponse.json(
      {
        warning: "in_rest_window",
        message: "You are currently in your rest window. Running this task may reduce tonight's bonus.",
        cost: PLAYGROUND_PRICING[parsed.tool as PlaygroundTool].credits,
      },
      { status: 409 },
    );
  }
  try {
    const result = await runPlaygroundTool({
      userId: DEMO_USER_ID,
      tool: parsed.tool as PlaygroundTool,
      prompt: parsed.prompt,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
