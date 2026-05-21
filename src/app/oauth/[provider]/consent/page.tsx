// Local consent screen used when external OAuth credentials are not configured.
// It mirrors the same permission shape as the real wearable flow and redirects
// to the normal callback with a deterministic sample import.

import Link from "next/link";
import { notFound } from "next/navigation";

const META: Record<string, { label: string; color: string; scopes: { title: string; body: string }[]; logo: string }> = {
  fitbit: {
    label: "Fitbit",
    color: "#00B0B9",
    logo: "Fitbit",
    scopes: [
      { title: "Sleep", body: "Read your nightly sleep duration, efficiency, and score." },
      { title: "Activity", body: "Read your daily step count and active minutes." },
      { title: "Profile", body: "Read your basic profile (display name only)." },
    ],
  },
  oura: {
    label: "Oura",
    color: "#9E7FFF",
    logo: "Oura",
    scopes: [
      { title: "Daily", body: "Read your daily sleep, activity, and readiness summaries." },
      { title: "Personal", body: "Read your basic profile (display name only)." },
    ],
  },
  google_fit: {
    label: "Google Fit",
    color: "#4285F4",
    logo: "Google",
    scopes: [
      { title: "Activity (read)", body: "View your step count and active minutes." },
      { title: "Sleep (read)", body: "View your sleep duration segments." },
    ],
  },
};

export default async function OAuthConsentPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<{ state?: string; redirect?: string }>;
}) {
  const { provider } = await params;
  const { state, redirect } = await searchParams;
  const meta = META[provider];
  if (!meta) return notFound();
  if (!state || !redirect) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-900">
        <div className="max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h1 className="font-display text-xl font-semibold">Invalid OAuth request</h1>
          <p className="mt-2 text-sm text-slate-600">Missing state or redirect. Return to the app and try again.</p>
          <Link href="/app/devices" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
            Back to Devices
          </Link>
        </div>
      </main>
    );
  }

  const allowHref = `${redirect}?state=${encodeURIComponent(state)}&demo=1`;
  const denyHref = `${redirect}?state=${encodeURIComponent(state)}&error=access_denied`;

  return (
    // Light-mode container that visually breaks away from the dark GNC chrome,
    // so the consent screen feels like a separate provider page — same trick a
    // real OAuth handoff achieves by virtue of opening a different domain.
    <main className="grid min-h-screen place-items-center bg-slate-100 p-6 text-slate-900" data-testid="oauth-consent">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="rounded-t-2xl p-5" style={{ backgroundColor: meta.color }}>
          <div className="flex items-center justify-between text-white">
            <div className="font-display text-2xl font-semibold tracking-tight">{meta.logo}</div>
            <div className="rounded-full bg-white/20 px-3 py-1 text-xs uppercase tracking-widest">Secure connect</div>
          </div>
        </div>
        <div className="space-y-5 p-6">
          <div>
            <h1 className="font-display text-2xl font-semibold leading-tight">
              Good Night Credits wants to connect to your {meta.label} account.
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Authorize Good Night Credits to import a realistic daily summary from {meta.label}. Only the totals needed for
              Recovery and credit eligibility are stored:
            </p>
          </div>
          <ul className="space-y-3">
            {meta.scopes.map((s) => (
              <li key={s.title} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mt-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                <div>
                  <div className="text-sm font-semibold">{s.title}</div>
                  <div className="text-xs text-slate-600">{s.body}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Good Night Credits never reads raw heart-rate, GPS traces, or messages. Only daily summaries are stored.
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <a
              href={denyHref}
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
              data-testid="oauth-deny"
            >
              Cancel
            </a>
            <a
              href={allowHref}
              className="rounded-xl px-5 py-2.5 text-center text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: meta.color }}
              data-testid="oauth-allow"
            >
              Allow access
            </a>
          </div>
          <div className="text-center text-[11px] uppercase tracking-widest text-slate-400">
            CSRF token · <span className="font-mono">{state.slice(0, 8)}…</span>
          </div>
        </div>
      </div>
    </main>
  );
}
