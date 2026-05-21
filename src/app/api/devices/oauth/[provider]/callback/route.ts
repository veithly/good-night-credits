import { NextRequest, NextResponse } from "next/server";
import { applyDeviceImport, parseDeviceImport } from "@/lib/devices";
import { DEMO_USER_ID } from "@/lib/demo";
import { prepareRequestStore } from "@/lib/request-store";
import {
  PROVIDERS,
  consumeSession,
  exchangeCode,
  fetchLatest,
  persistConnection,
  type DeviceProvider,
} from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** OAuth callback. Handles both live providers (auth code → token exchange →
 *  data fetch) and the local demo-mode consent screen (just imports the
 *  built-in sample payload). The browser lands here either way; we then
 *  302 onwards to the redirectAfter path with a short status query string. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  await prepareRequestStore();
  const { provider } = await ctx.params;
  if (!(provider in PROVIDERS)) {
    return NextResponse.redirect(
      new URL(`/app/devices?oauth=unknown_provider`, req.url),
    );
  }
  const p = provider as DeviceProvider;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const demoMode = url.searchParams.get("demo") === "1";

  if (!state) {
    return NextResponse.redirect(new URL(`/app/devices?oauth=missing_state`, req.url));
  }
  const session = consumeSession(state);
  if (!session || session.provider !== p) {
    return NextResponse.redirect(new URL(`/app/devices?oauth=bad_state`, req.url));
  }

  if (error) {
    return NextResponse.redirect(
      new URL(`/app/devices?oauth=denied&provider=${p}`, req.url),
    );
  }

  try {
    let access: { accessToken: string; refreshToken?: string; expiresAt?: number; scope?: string; providerUserId?: string };
    let mode: "live" | "demo";
    if (demoMode) {
      access = { accessToken: `demo_${state.slice(0, 8)}`, scope: PROVIDERS[p].scopes };
      mode = "demo";
    } else if (code) {
      const forwardedHost = req.headers.get("x-forwarded-host");
      const forwardedProto = req.headers.get("x-forwarded-proto");
      const origin = forwardedHost
        ? `${forwardedProto ?? "https"}://${forwardedHost}`
        : url.origin;
      access = await exchangeCode(p, code, origin);
      mode = "live";
    } else {
      return NextResponse.redirect(new URL(`/app/devices?oauth=missing_code`, req.url));
    }

    const connection = persistConnection({
      userId: session.userId ?? DEMO_USER_ID,
      provider: p,
      ...access,
      mode,
    });

    // Pull a recent payload and pipe it through the same parser path that
    // CSV/JSON uploads use — keeps "device data is device data" regardless
    // of how it arrived.
    const { filename, body } = await fetchLatest(p, connection.accessToken, mode);
    const parsed = parseDeviceImport(filename, body);
    applyDeviceImport(connection.userId, parsed);

    const dest = new URL(session.redirectAfter ?? "/app/devices", req.url);
    dest.searchParams.set("oauth", "connected");
    dest.searchParams.set("provider", p);
    dest.searchParams.set("mode", mode);
    return NextResponse.redirect(dest);
  } catch (e) {
    const dest = new URL("/app/devices", req.url);
    dest.searchParams.set("oauth", "error");
    dest.searchParams.set("provider", p);
    dest.searchParams.set("message", (e as Error).message.slice(0, 160));
    return NextResponse.redirect(dest);
  }
}
