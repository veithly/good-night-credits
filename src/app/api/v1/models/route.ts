import { NextRequest, NextResponse } from "next/server";
import { discoverAll } from "@/lib/providers";
import { canUseTier } from "@/lib/eligibility";
import { findByToken, recordUsage } from "@/lib/api-keys";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenFrom(req: NextRequest): string | null {
  // Accept either OpenAI-style "Authorization: Bearer ..." or Anthropic-style
  // "x-api-key: ..." so the same gnc_live_* key works for any client.
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(\S+)/i);
    if (m) return m[1];
    return auth.trim();
  }
  const xk = req.headers.get("x-api-key");
  return xk ? xk.trim() : null;
}

export async function GET(req: NextRequest) {
  await prepareRequestStore();
  const token = tokenFrom(req);
  if (!token) {
    return NextResponse.json(
      { error: { message: "Missing API key. Send `Authorization: Bearer <gnc_live_...>` or `x-api-key: <gnc_live_...>`.", type: "invalid_request_error" } },
      { status: 401 },
    );
  }
  const rec = findByToken(token);
  if (!rec) {
    return NextResponse.json(
      { error: { message: "Invalid API key.", type: "invalid_request_error" } },
      { status: 401 },
    );
  }
  recordUsage(rec.id, 0);

  const all = await discoverAll();
  const elig = canUseTier(rec.userId, "advanced");
  const data = all.map((m) => ({
    id: m.publicId,
    object: "model",
    // Note: we deliberately do NOT expose the backing provider id or upstream
    // owner — the user only ever sees the model name. The wallet still routes
    // correctly because findModel() resolves m.publicId server-side.
    tier: m.tier,
    input_cost_per_1k: m.inputCost,
    output_cost_per_1k: m.outputCost,
    available_to_caller: rec.scope === "all" && (m.tier === "basic" || elig.allowed),
    gate: m.tier === "advanced" ? { requires: elig.reasons } : null,
  }));
  return NextResponse.json({
    object: "list",
    data,
  });
}
