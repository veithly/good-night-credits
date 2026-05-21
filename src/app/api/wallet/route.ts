import { NextResponse } from "next/server";
import { recentLedger, walletSnapshot, grantDailyBase } from "@/lib/credits";
import { DEMO_USER_ID } from "@/lib/demo";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await prepareRequestStore();
  const snapshot = walletSnapshot(DEMO_USER_ID);
  const ledger = recentLedger(DEMO_USER_ID, 60);
  return NextResponse.json({ snapshot, ledger });
}

export async function POST() {
  await prepareRequestStore();
  const tx = grantDailyBase(DEMO_USER_ID);
  return NextResponse.json({ tx, granted: Boolean(tx) });
}
