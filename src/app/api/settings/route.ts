import { NextRequest, NextResponse } from "next/server";
import { getSettings, setSettings } from "@/lib/store";
import { DEMO_USER_ID } from "@/lib/demo";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await prepareRequestStore();
  return NextResponse.json({ settings: getSettings(DEMO_USER_ID) });
}

export async function POST(req: NextRequest) {
  await prepareRequestStore();
  const body = await req.json();
  const cur = getSettings(DEMO_USER_ID);
  const next = { ...cur, ...body, userId: DEMO_USER_ID };
  setSettings(next);
  return NextResponse.json({ settings: next });
}
