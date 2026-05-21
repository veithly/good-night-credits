import { NextResponse } from "next/server";
import { snapshotFor } from "@/lib/dashboard";
import { DEMO_USER_ID } from "@/lib/demo";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await prepareRequestStore();
  return NextResponse.json({ snapshot: snapshotFor(DEMO_USER_ID) });
}
