import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createStake,
  emergencyUnlock,
  getActiveStake,
} from "@/lib/staking";
import { ensureUpcomingWindow } from "@/lib/rest-window";
import { db } from "@/lib/store";
import { DEMO_USER_ID } from "@/lib/demo";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  stake_amount: z.number().int().positive().max(200_000),
  yield_rate: z.number().min(0).max(0.5).optional(),
  duration_hours: z.number().min(1).max(24).optional(),
});

export async function GET() {
  await prepareRequestStore();
  const active = getActiveStake(DEMO_USER_ID);
  const history = db()
    .restStakes.filter((s) => s.userId === DEMO_USER_ID)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);
  return NextResponse.json({ active, history });
}

export async function POST(req: NextRequest) {
  await prepareRequestStore();
  const body = await req.json();
  const action = body.action ?? "create";

  if (action === "create") {
    const parsed = CreateSchema.parse(body);
    const win = ensureUpcomingWindow(DEMO_USER_ID);
    try {
      const stake = createStake({
        userId: DEMO_USER_ID,
        restWindowId: win.id,
        stakeAmount: parsed.stake_amount,
        yieldRate: parsed.yield_rate,
        durationHours: parsed.duration_hours,
      });
      return NextResponse.json({ stake });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  if (action === "emergency_unlock") {
    const stake = getActiveStake(DEMO_USER_ID);
    if (!stake) return NextResponse.json({ error: "no_active_stake" }, { status: 400 });
    const updated = emergencyUnlock(DEMO_USER_ID, stake.id);
    return NextResponse.json({ stake: updated });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
