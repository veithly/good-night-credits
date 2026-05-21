import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createKey, deleteKey, listKeys, revokeKey } from "@/lib/api-keys";
import { DEMO_USER_ID } from "@/lib/demo";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().min(1).max(60),
  scope: z.enum(["basic", "all"]).optional(),
});

export async function GET() {
  await prepareRequestStore();
  const keys = listKeys(DEMO_USER_ID).map(({ hash: _hash, ...rest }) => {
    void _hash;
    return rest;
  });
  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  await prepareRequestStore();
  const body = await req.json();
  const parsed = CreateSchema.parse(body);
  const { record, token } = createKey({ userId: DEMO_USER_ID, ...parsed });
  // token is returned ONCE; client must store immediately.
  const { hash: _h, ...meta } = record;
  void _h;
  return NextResponse.json({ key: meta, token });
}

export async function DELETE(req: NextRequest) {
  await prepareRequestStore();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const action = url.searchParams.get("action");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  if (action === "revoke") {
    return NextResponse.json({ ok: revokeKey(DEMO_USER_ID, id) });
  }
  return NextResponse.json({ ok: deleteKey(DEMO_USER_ID, id) });
}
