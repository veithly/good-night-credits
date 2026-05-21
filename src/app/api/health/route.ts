import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, save, todayKey, uid } from "@/lib/store";
import { issueHealthBonuses, recalculateRecovery } from "@/lib/recovery";
import { DEMO_PRESETS, DEMO_USER_ID, type DemoPresetKey } from "@/lib/demo";
import type { HealthEntry } from "@/lib/types";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ManualSchema = z.object({
  sleep_duration_hours: z.number().min(0).max(16),
  sleep_quality_score: z.number().min(0).max(100),
  steps: z.number().min(0).max(60_000),
  active_minutes: z.number().min(0).max(360),
  break_count: z.number().min(0).max(20),
  total_break_minutes: z.number().min(0).max(240),
});

const PresetSchema = z.object({ preset: z.enum(["well_rested", "average", "burned_out"]) });

export async function GET() {
  await prepareRequestStore();
  const today = db().health.find((h) => h.userId === DEMO_USER_ID && h.date === todayKey());
  return NextResponse.json({ entry: today });
}

export async function POST(req: NextRequest) {
  await prepareRequestStore();
  const body = await req.json();
  let payload:
    | z.infer<typeof ManualSchema>
    | { preset: DemoPresetKey };
  if ("preset" in body) {
    payload = PresetSchema.parse(body);
  } else {
    payload = ManualSchema.parse(body);
  }

  const entry: HealthEntry = (() => {
    if ("preset" in payload) {
      const p = DEMO_PRESETS[payload.preset];
      return {
        id: uid("h"),
        userId: DEMO_USER_ID,
        date: todayKey(),
        sleepDurationHours: p.sleepDurationHours,
        sleepQualityScore: p.sleepQualityScore,
        steps: p.steps,
        activeMinutes: p.activeMinutes,
        breakCount: p.breakCount,
        totalBreakMinutes: p.totalBreakMinutes,
        source: "demo",
        createdAt: Date.now(),
      };
    }
    return {
      id: uid("h"),
      userId: DEMO_USER_ID,
      date: todayKey(),
      sleepDurationHours: payload.sleep_duration_hours,
      sleepQualityScore: payload.sleep_quality_score,
      steps: payload.steps,
      activeMinutes: payload.active_minutes,
      breakCount: payload.break_count,
      totalBreakMinutes: payload.total_break_minutes,
      source: "manual",
      createdAt: Date.now(),
    };
  })();

  // Replace today's entry to avoid double-counting.
  const list = db().health;
  const idx = list.findIndex(
    (h) => h.userId === DEMO_USER_ID && h.date === todayKey(),
  );
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  save();

  const recovery = recalculateRecovery(DEMO_USER_ID);
  const bonuses = issueHealthBonuses(DEMO_USER_ID);

  return NextResponse.json({ entry, recovery, bonuses });
}

export async function DELETE() {
  await prepareRequestStore();
  // Honour PRD §F13: user can delete their data.
  const before = db().health.length;
  db().health = db().health.filter((h) => h.userId !== DEMO_USER_ID);
  db().recovery = db().recovery.filter((r) => r.userId !== DEMO_USER_ID);
  save();
  return NextResponse.json({ deleted: before - db().health.length });
}
