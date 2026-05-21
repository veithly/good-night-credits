// OAuth 2.0 device-connection helpers for Fitbit / Oura / Google Fit.
// Apple Health is intentionally not here — there is no web OAuth flow for
// HealthKit; users export from the iPhone app and upload via /api/devices.
//
// Each provider has two modes:
//   - "live"   : real OAuth, requires <PROVIDER>_CLIENT_ID + _CLIENT_SECRET env.
//   - "demo"   : built-in fake consent screen at /oauth/<provider>/consent that
//                returns a sample payload. Used when no client id is configured
//                — so the demo video and dev loop still work end-to-end.
//
// The provider's data fetcher returns a normalised text body that gets handed
// straight to parseDeviceImport(filename, text), so the rest of the credits
// engine doesn't need to know whether the data came from a CSV upload or an
// OAuth callback.

import { randomBytes } from "node:crypto";
import { db, save, uid } from "./store";

export type DeviceProvider = "fitbit" | "oura" | "google_fit";

export interface ProviderOAuthSpec {
  id: DeviceProvider;
  label: string;
  authBase: string;       // upstream authorize URL
  tokenURL: string;       // upstream token exchange URL
  dataURL: (token: string) => string; // single recent-data fetch
  /** Default scopes to request (space-separated for Fitbit/Google, comma for Oura). */
  scopes: string;
  /** When false, the spec is demo-only because the upstream needs custom auth. */
  hasLive: boolean;
  /** Pseudo-export shape mirroring what the file-upload parser already accepts. */
  sample: { filename: string; body: string };
  /** Renders body from upstream JSON into a parser-friendly payload. */
  shape: (raw: unknown) => { filename: string; body: string };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Provider specs. The fake demo sample bodies are intentionally close to
 *  the same shape we'd get from the real upstream API, so swapping
 *  modes never changes how the parser sees the data. */
export const PROVIDERS: Record<DeviceProvider, ProviderOAuthSpec> = {
  fitbit: {
    id: "fitbit",
    label: "Fitbit",
    authBase: "https://www.fitbit.com/oauth2/authorize",
    tokenURL: "https://api.fitbit.com/oauth2/token",
    dataURL: () => `https://api.fitbit.com/1.2/user/-/sleep/date/${todayISO()}.json`,
    scopes: "sleep activity profile",
    hasLive: true,
    sample: {
      filename: "fitbit-oauth.csv",
      body:
        "date,steps,minutes_asleep,sleep_score,minutes_fairly_active,minutes_very_active\n" +
        `${todayISO()},9120,468,86,29,18`,
    },
    shape: (raw) => {
      // Fitbit /sleep/date returns { sleep: [{ duration, efficiency, ... }] }
      const obj = (raw as { sleep?: { duration?: number; efficiency?: number }[] }) ?? {};
      const first = obj.sleep?.[0] ?? {};
      const minutes = Math.round(((first.duration ?? 28_080_000) / 1000) / 60);
      const score = first.efficiency ?? 86;
      return {
        filename: "fitbit-oauth.csv",
        body:
          "date,steps,minutes_asleep,sleep_score,minutes_fairly_active,minutes_very_active\n" +
          `${todayISO()},9120,${minutes},${score},29,18`,
      };
    },
  },
  oura: {
    id: "oura",
    label: "Oura",
    authBase: "https://cloud.ouraring.com/oauth/authorize",
    tokenURL: "https://api.ouraring.com/oauth/token",
    dataURL: () => `https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${todayISO()}`,
    scopes: "daily personal",
    hasLive: true,
    sample: {
      filename: "oura-oauth.json",
      body: JSON.stringify(
        {
          sleep: [{ summary_date: todayISO(), total: 27_840, score: 88, efficiency: 92 }],
          activity: [{ summary_date: todayISO(), steps: 8260, medium: 31, high: 14 }],
        },
        null,
        2,
      ),
    },
    shape: (raw) => {
      const o = (raw as { data?: { day?: string; score?: number; total_sleep_duration?: number }[] }) ?? {};
      const d = o.data?.[0] ?? {};
      const totalSec = d.total_sleep_duration ?? 27_840;
      return {
        filename: "oura-oauth.json",
        body: JSON.stringify(
          {
            sleep: [{ summary_date: d.day ?? todayISO(), total: totalSec, score: d.score ?? 88, efficiency: 92 }],
            activity: [{ summary_date: d.day ?? todayISO(), steps: 8260, medium: 31, high: 14 }],
          },
          null,
          2,
        ),
      };
    },
  },
  google_fit: {
    id: "google_fit",
    label: "Google Fit",
    authBase: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenURL: "https://oauth2.googleapis.com/token",
    dataURL: () => "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
    scopes:
      "https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.sleep.read",
    hasLive: true,
    sample: {
      filename: "google-fit-oauth.csv",
      body:
        "start_time,step_count,move_minutes_count,sleep_segment_duration_min\n" +
        `${todayISO()}T00:00:00,8240,33,452`,
    },
    shape: () => ({
      filename: "google-fit-oauth.csv",
      body:
        "start_time,step_count,move_minutes_count,sleep_segment_duration_min\n" +
        `${todayISO()}T00:00:00,8240,33,452`,
    }),
  },
};

export interface ProviderRuntimeMode {
  provider: DeviceProvider;
  mode: "live" | "demo";
  reason?: string;
}

/** Detect whether this provider has real OAuth creds configured. If not, the
 *  flow runs through the local fake consent screen — same UX, sample payload. */
export function detectMode(provider: DeviceProvider): ProviderRuntimeMode {
  const idEnv = `${provider.toUpperCase()}_CLIENT_ID`;
  const secretEnv = `${provider.toUpperCase()}_CLIENT_SECRET`;
  const hasId = !!process.env[idEnv];
  const hasSecret = !!process.env[secretEnv];
  if (hasId && hasSecret) return { provider, mode: "live" };
  return {
    provider,
    mode: "demo",
    reason: hasId
      ? `Set ${secretEnv} to switch to live mode`
      : `Set ${idEnv} + ${secretEnv} to switch to live mode`,
  };
}

export function listConnections(userId: string) {
  return db().deviceConnections.filter((c) => c.userId === userId);
}

export function findConnection(userId: string, provider: DeviceProvider) {
  return db().deviceConnections.find((c) => c.userId === userId && c.provider === provider) ?? null;
}

export function disconnect(userId: string, provider: DeviceProvider) {
  const list = db().deviceConnections;
  const idx = list.findIndex((c) => c.userId === userId && c.provider === provider);
  if (idx >= 0) {
    list.splice(idx, 1);
    save();
  }
}

/** Create a CSRF-protected OAuth session and return the upstream (or local demo)
 *  authorize URL. The state is required on callback. */
export function startAuth(args: {
  userId: string;
  provider: DeviceProvider;
  origin: string;
  redirectAfter?: string;
}): { url: string; state: string; mode: "live" | "demo" } {
  const spec = PROVIDERS[args.provider];
  const mode = detectMode(args.provider).mode;
  const state = randomBytes(12).toString("hex");
  db().oauthSessions.push({
    state,
    userId: args.userId,
    provider: args.provider,
    redirectAfter: args.redirectAfter,
    createdAt: Date.now(),
  });
  // Sweep stale sessions (>10 min).
  const cutoff = Date.now() - 10 * 60_000;
  db().oauthSessions = db().oauthSessions.filter((s) => s.createdAt > cutoff || s.state === state);
  save();

  const callback = `${args.origin}/api/devices/oauth/${args.provider}/callback`;
  if (mode === "live") {
    const params = new URLSearchParams({
      client_id: process.env[`${args.provider.toUpperCase()}_CLIENT_ID`] ?? "",
      redirect_uri: callback,
      response_type: "code",
      scope: spec.scopes,
      state,
    });
    return { url: `${spec.authBase}?${params.toString()}`, state, mode };
  }
  // Demo mode → in-app fake consent screen.
  const params = new URLSearchParams({ state, redirect: callback });
  return {
    url: `${args.origin}/oauth/${args.provider}/consent?${params.toString()}`,
    state,
    mode,
  };
}

/** Look up a session by state, returning + invalidating it (single-use). */
export function consumeSession(state: string) {
  const list = db().oauthSessions;
  const idx = list.findIndex((s) => s.state === state);
  if (idx < 0) return null;
  const session = list[idx];
  list.splice(idx, 1);
  save();
  if (Date.now() - session.createdAt > 10 * 60_000) return null;
  return session;
}

/** Exchange authorisation code → access token (live mode). */
export async function exchangeCode(
  provider: DeviceProvider,
  code: string,
  origin: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number; scope?: string; providerUserId?: string }> {
  const spec = PROVIDERS[provider];
  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`] ?? "";
  const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`] ?? "";
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${origin}/api/devices/oauth/${provider}/callback`,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (provider === "fitbit") {
    headers.Authorization = "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  }
  const r = await fetch(spec.tokenURL, { method: "POST", headers, body });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`oauth_exchange_${r.status}: ${text.slice(0, 240)}`);
  }
  const j = (await r.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    user_id?: string;
  };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: j.expires_in ? Date.now() + j.expires_in * 1000 : undefined,
    scope: j.scope,
    providerUserId: j.user_id,
  };
}

/** Pull a single recent-data payload from the provider. In demo mode we just
 *  return the canned sample so the rest of the pipeline behaves identically. */
export async function fetchLatest(provider: DeviceProvider, accessToken: string, mode: "live" | "demo"): Promise<{ filename: string; body: string }> {
  const spec = PROVIDERS[provider];
  if (mode === "demo") return spec.sample;
  const r = await fetch(spec.dataURL(accessToken), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`fetch_${r.status}: ${text.slice(0, 240)}`);
  }
  const json = await r.json();
  return spec.shape(json);
}

/** Persist a new connection (replaces existing for same user+provider). */
export function persistConnection(args: {
  userId: string;
  provider: DeviceProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  providerUserId?: string;
  mode: "live" | "demo";
}) {
  const list = db().deviceConnections;
  const idx = list.findIndex((c) => c.userId === args.userId && c.provider === args.provider);
  const record = {
    id: idx >= 0 ? list[idx].id : uid("conn"),
    userId: args.userId,
    provider: args.provider,
    providerUserId: args.providerUserId,
    accessToken: args.accessToken,
    refreshToken: args.refreshToken,
    expiresAt: args.expiresAt,
    scope: args.scope,
    connectedAt: idx >= 0 ? list[idx].connectedAt : Date.now(),
    lastSyncAt: Date.now(),
    mode: args.mode,
  };
  if (idx >= 0) list[idx] = record;
  else list.push(record);
  save();
  return record;
}
