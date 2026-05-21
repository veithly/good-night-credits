import { NextResponse } from "next/server";
import { db, todayKey } from "@/lib/store";
import { issueHealthBonuses, recalculateRecovery } from "@/lib/recovery";
import { DEMO_USER_ID } from "@/lib/demo";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await prepareRequestStore();
  const recovery = db().recovery.find((r) => r.userId === DEMO_USER_ID && r.date === todayKey());
  return NextResponse.json({ recovery });
}

export async function POST() {
  await prepareRequestStore();
  const recovery = recalculateRecovery(DEMO_USER_ID);
  const bonuses = issueHealthBonuses(DEMO_USER_ID);
  return NextResponse.json({ recovery, bonuses });
}
