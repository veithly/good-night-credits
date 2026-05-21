import { NextRequest, NextResponse } from "next/server";
import { applyDeviceImport, parseDeviceImport } from "@/lib/devices";
import { DEMO_USER_ID } from "@/lib/demo";
import { db } from "@/lib/store";
import { PROVIDERS, detectMode, disconnect, listConnections, type DeviceProvider } from "@/lib/oauth";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 8MB is plenty for daily-summary exports.
export const maxDuration = 30;

export async function GET() {
  await prepareRequestStore();
  const imports = db()
    .deviceImports.filter((d) => d.userId === DEMO_USER_ID)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);
  const connections = listConnections(DEMO_USER_ID).map((c) => ({
    id: c.id,
    provider: c.provider,
    mode: c.mode,
    connectedAt: c.connectedAt,
    lastSyncAt: c.lastSyncAt,
    scope: c.scope,
  }));
  const providerCatalog = Object.values(PROVIDERS).map((spec) => {
    const mode = detectMode(spec.id);
    return {
      id: spec.id,
      label: spec.label,
      scopes: spec.scopes,
      mode: mode.mode,
      reason: mode.reason ?? null,
    };
  });
  return NextResponse.json({ imports, connections, providers: providerCatalog });
}

export async function DELETE(req: NextRequest) {
  await prepareRequestStore();
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider");
  if (!provider || !(provider in PROVIDERS)) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 400 });
  }
  disconnect(DEMO_USER_ID, provider as DeviceProvider);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  await prepareRequestStore();
  const contentType = req.headers.get("content-type") ?? "";

  let text = "";
  let filename = "upload.csv";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file_required" }, { status: 400 });
    }
    filename = file.name || filename;
    text = await file.text();
  } else {
    const body = await req.json().catch(() => null);
    if (!body || !body.text) {
      return NextResponse.json({ error: "missing_text" }, { status: 400 });
    }
    text = String(body.text);
    filename = body.filename || filename;
  }

  if (text.length === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }
  if (text.length > 4_000_000) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const parsed = parseDeviceImport(filename, text);
  const entry = applyDeviceImport(DEMO_USER_ID, parsed);

  return NextResponse.json({
    parsed: { ...parsed, entry: undefined },
    entry,
  });
}
