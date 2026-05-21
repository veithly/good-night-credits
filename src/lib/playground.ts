// Server-side glue for the AI Playground + Agent runtime.

import { addCredits, availableBalance, PLAYGROUND_PRICING, type PlaygroundTool } from "./credits";
import { complete, systemPromptFor } from "./ai";
import { db, save, uid } from "./store";
import { isInsideRestWindow } from "./rest-window";
import { shortHash } from "./utils";
import {
  chatCompletion,
  discoverAll,
  effectiveMaxTokens,
  estimateCreditCost,
  findModel,
} from "./providers";
import { canUseTier } from "./eligibility";
import type { AgentJob, AgentTaskType, TokenEvent, UsageType } from "./types";

export interface RunResult {
  output: string;
  creditsUsed: number;
  remainingCredits: number;
  usageType: UsageType;
  tokenEventId: string;
}

interface RunArgs {
  userId: string;
  tool: PlaygroundTool;
  prompt: string;
  usageType?: UsageType;
  taskId?: string;
  source?: "playground" | "scheduled_agent" | "api_gateway" | "system";
  forceRun?: boolean; // bypass insufficient-credit guard for system jobs
}

export async function runPlaygroundTool(args: RunArgs): Promise<RunResult> {
  const tool = PLAYGROUND_PRICING[args.tool];
  if (!tool) throw new Error("unknown_tool");
  const cost = tool.credits;
  const balance = availableBalance(args.userId);
  if (!args.forceRun && balance < cost) throw new Error("insufficient_credits");

  const result = await complete(args.tool, {
    system: systemPromptFor(args.tool),
    user: args.prompt,
  });

  const usageType: UsageType = args.usageType ?? "manual";
  const inRest = isInsideRestWindow(args.userId);

  // Record token event.
  const evt: TokenEvent = {
    id: uid("evt"),
    userId: args.userId,
    timestamp: Date.now(),
    usageType,
    source: args.source ?? "playground",
    tokensUsed: result.tokensUsed,
    creditsUsed: cost,
    modelName: result.model,
    promptHash: shortHash(args.prompt),
    taskId: args.taskId,
    isDuringRestWindow: inRest,
  };
  db().tokenEvents.push(evt);
  save();

  // Debit ledger.
  addCredits({
    userId: args.userId,
    amount: -cost,
    type: usageType === "agent" ? "agent_usage" : "manual_usage",
    reason: `${tool.label} (${result.source === "offline" ? "offline" : "live"} ${result.model})`,
    relatedEntityType: "token_event",
    relatedEntityId: evt.id,
  });

  return {
    output: result.output,
    creditsUsed: cost,
    remainingCredits: availableBalance(args.userId),
    usageType,
    tokenEventId: evt.id,
  };
}

// ─── Agent jobs ────────────────────────────────────────────────────────────

const TASK_TO_TOOL: Record<AgentTaskType, PlaygroundTool> = {
  generate_readme: "generate_readme",
  generate_pitch: "generate_pitch",
  review_code: "review_code",
  plan_agent_tasks: "plan_agent_tasks",
};

export function createAgentJob(args: {
  userId: string;
  taskType: AgentTaskType;
  prompt: string;
  scheduledTime: number;
  maxBudget: number;
}): AgentJob {
  const job: AgentJob = {
    id: uid("job"),
    userId: args.userId,
    taskType: args.taskType,
    prompt: args.prompt,
    scheduledTime: args.scheduledTime,
    maxBudget: args.maxBudget,
    creditsUsed: 0,
    status: "scheduled",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  db().agentJobs.push(job);
  save();
  return job;
}

export async function runAgentJob(jobId: string): Promise<AgentJob | null> {
  const job = db().agentJobs.find((j) => j.id === jobId);
  if (!job) return null;
  if (job.status !== "scheduled") return job;

  const tool = TASK_TO_TOOL[job.taskType];
  const cost = PLAYGROUND_PRICING[tool].credits;
  if (cost > job.maxBudget) {
    job.status = "failed";
    job.updatedAt = Date.now();
    job.output = `Budget too low: ${cost} credits required, ${job.maxBudget} allocated.`;
    save();
    return job;
  }

  job.status = "running";
  job.updatedAt = Date.now();
  save();

  try {
    const r = await runPlaygroundTool({
      userId: job.userId,
      tool,
      prompt: job.prompt,
      usageType: "agent",
      taskId: job.id,
      source: "scheduled_agent",
      forceRun: true,
    });
    job.creditsUsed = r.creditsUsed;
    job.output = r.output;
    job.status = "completed";
  } catch (e) {
    job.output = String((e as Error).message ?? e);
    job.status = "failed";
  }
  job.updatedAt = Date.now();
  save();
  return job;
}

export function cancelAgentJob(userId: string, jobId: string): AgentJob | null {
  const job = db().agentJobs.find((j) => j.id === jobId && j.userId === userId);
  if (!job) return null;
  if (job.status === "scheduled") {
    job.status = "cancelled";
    job.updatedAt = Date.now();
    save();
  }
  return job;
}

// ─── Ad-hoc model execution (Playground "Custom" tab) ──────────────────────

export interface RunModelArgs {
  userId: string;
  /** Accepts public ids (`gpt-5.5`) and legacy canonical ids (`aurora:gpt-5.5`). */
  modelId: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  usageType?: UsageType;
  forceRun?: boolean;
}

export interface RunModelResult {
  output: string;
  modelId: string;          // public id — provider deliberately omitted
  tier: "basic" | "advanced";
  promptTokens: number;
  completionTokens: number;
  creditsUsed: number;
  remainingCredits: number;
}

export async function runModel(args: RunModelArgs): Promise<RunModelResult> {
  const all = await discoverAll();
  const model = findModel(all, args.modelId);
  if (!model) throw new Error("unknown_model");

  if (model.tier === "advanced") {
    const elig = canUseTier(args.userId, "advanced");
    if (!elig.allowed) {
      throw new Error("tier_locked:" + elig.reasons.join(" | "));
    }
  }

  const estPrompt = Math.max(1, Math.ceil(args.prompt.length / 4));
  const estCost = estimateCreditCost(model, estPrompt, effectiveMaxTokens(model, args.maxTokens));
  if (!args.forceRun && availableBalance(args.userId) < estCost) {
    throw new Error(`insufficient_credits:${estCost}`);
  }

  const messages = [
    { role: "system" as const, content: args.systemPrompt ?? "You are Good Night Credits' AI co-pilot. Be concise and useful." },
    { role: "user" as const, content: args.prompt },
  ];
  const result = await chatCompletion(model, {
    messages,
    maxTokens: args.maxTokens ?? 900,
    temperature: args.temperature ?? 0.6,
  });
  const cost = estimateCreditCost(model, result.promptTokens, result.completionTokens);
  const inRest = isInsideRestWindow(args.userId);

  const evt: TokenEvent = {
    id: uid("evt"),
    userId: args.userId,
    timestamp: Date.now(),
    usageType: args.usageType ?? "manual",
    source: "playground",
    tokensUsed: result.totalTokens,
    creditsUsed: cost,
    modelName: model.modelName,
    promptHash: shortHash(args.prompt),
    isDuringRestWindow: inRest,
  };
  db().tokenEvents.push(evt);
  save();

  addCredits({
    userId: args.userId,
    amount: -cost,
    type: (args.usageType ?? "manual") === "agent" ? "agent_usage" : "manual_usage",
    reason: `Playground · ${model.publicId}`,
    relatedEntityType: "token_event",
    relatedEntityId: evt.id,
  });

  return {
    output: result.text,
    modelId: model.publicId,
    tier: model.tier,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    creditsUsed: cost,
    remainingCredits: availableBalance(args.userId),
  };
}
