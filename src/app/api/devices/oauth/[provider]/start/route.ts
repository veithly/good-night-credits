import { NextRequest, NextResponse } from "next/server";
import { DEMO_USER_ID } from "@/lib/demo";
import { PROVIDERS, detectMode, startAuth, type DeviceProvider } from "@/lib/oauth";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  await prepareRequestStore();
  const { provider } = await ctx.params;
  if (!(provider in PROVIDERS)) {
    return NextResponse.json({ error: "unknown_provider", supported: Object.keys(PROVIDERS) }, { status: 400 });
  }
  const p = provider as DeviceProvider;
  const url = new URL(req.url);
  // Build the public origin the browser sees, not the server-side `req.url`.
  // X-Forwarded headers are honoured first so this works behind reverse proxies.
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const origin = forwardedHost
    ? `${forwardedProto ?? "https"}://${forwardedHost}`
    : url.origin;

  const redirectAfter = url.searchParams.get("redirect_after") ?? "/app/devices";
  const auth = startAuth({
    userId: DEMO_USER_ID,
    provider: p,
    origin,
    redirectAfter,
  });
  const mode = detectMode(p);

  // Default: redirect the browser to the upstream (or local demo) auth URL.
  // Callers that want the JSON instead can pass ?format=json — handy for the
  // smoke test and for the dashboard "Connect" buttons that prefer to open a
  // popup window from the client.
  if (url.searchParams.get("format") === "json") {
    return NextResponse.json({
      provider: p,
      url: auth.url,
      mode: auth.mode,
      reason: mode.reason ?? null,
    });
  }
  return NextResponse.redirect(auth.url);
}
