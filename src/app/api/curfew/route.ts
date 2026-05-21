import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, getSettings, save } from "@/lib/store";
import {
  cancelWindow,
  ensureUpcomingWindow,
  settleWindow,
  startWindow,
} from "@/lib/rest-window";
import { DEMO_REST_COMPRESS_MS, DEMO_USER_ID } from "@/lib/demo";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  rest_window_start: z.string().regex(/^\d{2}:\d{2}$/),
  rest_window_end: z.string().regex(/^\d{2}:\d{2}$/),
  manual_usage_allowance: z.number().min(0).max(5000),
  agent_budget: z.number().min(0).max(50_000),
});

export async function GET() {
  await prepareRequestStore();
  const settings = getSettings(DEMO_USER_ID);
  const windows = db().restWindows.filter((w) => w.userId === DEMO_USER_ID).slice(-10);
  const upcoming = ensureUpcomingWindow(DEMO_USER_ID);
  return NextResponse.json({ settings, upcoming, history: windows });
}

export async function POST(req: NextRequest) {
  await prepareRequestStore();
  const body = await req.json();
  const action: string = body.action ?? "update";

  if (action === "update") {
    const parsed = UpdateSchema.parse(body);
    const settings = getSettings(DEMO_USER_ID);
    settings.restWindowStart = parsed.rest_window_start;
    settings.restWindowEnd = parsed.rest_window_end;
    settings.manualUsageAllowance = parsed.manual_usage_allowance;
    settings.agentBudget = parsed.agent_budget;
    save();
    // Refresh upcoming window so it reflects new times.
    const upcoming = db().restWindows.find(
      (w) => w.userId === DEMO_USER_ID && (w.status === "scheduled" || w.status === "active"),
    );
    if (upcoming && upcoming.status === "scheduled") {
      cancelWindow(DEMO_USER_ID, upcoming.id);
    }
    const next = ensureUpcomingWindow(DEMO_USER_ID);
    return NextResponse.json({ settings, upcoming: next });
  }

  if (action === "start_demo") {
    const win = startWindow(DEMO_USER_ID, DEMO_REST_COMPRESS_MS);
    return NextResponse.json({ window: win, compressed_ms: DEMO_REST_COMPRESS_MS });
  }

  if (action === "settle") {
    const settled = settleWindow(DEMO_USER_ID);
    return NextResponse.json({ window: settled });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
