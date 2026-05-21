import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cancelAgentJob, createAgentJob, runAgentJob } from "@/lib/playground";
import { db } from "@/lib/store";
import { DEMO_USER_ID } from "@/lib/demo";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  task_type: z.enum([
    "generate_readme",
    "generate_pitch",
    "review_code",
    "plan_agent_tasks",
  ]),
  prompt: z.string().min(1).max(4000),
  scheduled_time: z.number().optional(),
  max_budget: z.number().min(100).max(50_000),
});

export async function GET() {
  await prepareRequestStore();
  const jobs = db()
    .agentJobs.filter((j) => j.userId === DEMO_USER_ID)
    .sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  await prepareRequestStore();
  const body = await req.json();
  const action = body.action ?? "create";

  if (action === "create") {
    const parsed = CreateSchema.parse(body);
    const job = createAgentJob({
      userId: DEMO_USER_ID,
      taskType: parsed.task_type,
      prompt: parsed.prompt,
      scheduledTime: parsed.scheduled_time ?? Date.now() + 60_000,
      maxBudget: parsed.max_budget,
    });
    return NextResponse.json({ job });
  }

  if (action === "run_now") {
    const job = await runAgentJob(body.job_id);
    return NextResponse.json({ job });
  }

  if (action === "cancel") {
    const job = cancelAgentJob(DEMO_USER_ID, body.job_id);
    return NextResponse.json({ job });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
