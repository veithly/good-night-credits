import { NextResponse } from "next/server";
import { discoverAll } from "@/lib/providers";
import { canUseTier, eligibilityFor } from "@/lib/eligibility";
import { DEMO_USER_ID } from "@/lib/demo";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public-facing model list for the in-app Playground.
 *
 * Deliberately stripped down: we never leak the backing provider id, URL, or
 * key fingerprint to the client. The Playground only needs to know *which
 * models exist* and *whether the wallet can call them right now*; it does not
 * need to know which upstream is actually serving the request.
 */
export async function GET() {
  await prepareRequestStore();
  const models = await discoverAll();
  const elig = canUseTier(DEMO_USER_ID, "advanced");
  const hints = eligibilityFor(DEMO_USER_ID);
  return NextResponse.json({
    models: models.map((m) => ({
      id: m.publicId,
      modelName: m.publicId,
      tier: m.tier,
      inputCost: m.inputCost,
      outputCost: m.outputCost,
    })),
    eligibility: { allowed: elig.allowed, reasons: elig.reasons, hints },
  });
}
