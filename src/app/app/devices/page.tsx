"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "../../providers";
import { formatCredits, formatRelative } from "@/lib/utils";
import {
  Upload,
  Watch,
  Activity,
  Apple,
  CheckCircle2,
  FileJson,
  ShieldCheck,
  Link as LinkIcon,
  Unlink,
  Loader2,
} from "lucide-react";

interface DeviceImport {
  id: string;
  source: string;
  filename: string;
  rows: number;
  bytes: number;
  createdAt: number;
}

interface DeviceConnection {
  id: string;
  provider: "fitbit" | "oura" | "google_fit";
  mode: "live" | "demo";
  connectedAt: number;
  lastSyncAt?: number;
  scope?: string;
}

interface ProviderRow {
  id: "fitbit" | "oura" | "google_fit";
  label: string;
  scopes: string;
  mode: "live" | "demo";
  reason: string | null;
}

const TEMPLATES = [
  {
    source: "apple_health",
    label: "Apple Health",
    icon: Apple,
    sample: JSON.stringify(
      {
        records: [
          { type: "HKCategoryTypeIdentifierSleepAnalysis", startDate: `${new Date().toISOString().slice(0, 10)}T00:30:00Z`, endDate: `${new Date().toISOString().slice(0, 10)}T08:00:00Z` },
          { type: "HKQuantityTypeIdentifierStepCount", startDate: `${new Date().toISOString().slice(0, 10)}T10:00:00Z`, value: 9100 },
          { type: "HKQuantityTypeIdentifierAppleExerciseTime", startDate: `${new Date().toISOString().slice(0, 10)}T11:00:00Z`, value: 38 },
        ],
      },
      null,
      2,
    ),
  },
  {
    source: "fitbit",
    label: "Fitbit CSV",
    icon: Activity,
    sample:
      "date,steps,minutes_asleep,sleep_score,minutes_fairly_active,minutes_very_active\n" +
      `${new Date().toISOString().slice(0, 10)},9325,468,84,28,16`,
  },
  {
    source: "oura",
    label: "Oura JSON",
    icon: Watch,
    sample: JSON.stringify(
      {
        sleep: [{ summary_date: new Date().toISOString().slice(0, 10), total: 28080, score: 88, efficiency: 91 }],
        activity: [{ summary_date: new Date().toISOString().slice(0, 10), steps: 8400, medium: 32, high: 12 }],
      },
      null,
      2,
    ),
  },
  {
    source: "google_fit",
    label: "Google Fit CSV",
    icon: FileJson,
    sample:
      "start_time,step_count,move_minutes_count,sleep_segment_duration_min\n" +
      `${new Date().toISOString().slice(0, 10)}T00:00:00,7900,29,455`,
  },
];

const PROVIDER_VISUAL: Record<ProviderRow["id"], { color: string; icon: React.ComponentType<{ className?: string }> }> = {
  fitbit: { color: "from-aurora-teal/30 to-aurora-teal/0", icon: Activity },
  oura: { color: "from-aurora-violet/30 to-aurora-violet/0", icon: Watch },
  google_fit: { color: "from-aurora-mint/30 to-aurora-mint/0", icon: FileJson },
};

export default function DevicesPage() {
  const { refresh, toast } = useApp();
  const [imports, setImports] = useState<DeviceImport[]>([]);
  const [connections, setConnections] = useState<DeviceConnection[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState<ProviderRow["id"] | null>(null);
  const [lastResult, setLastResult] = useState<{ source: string; date: string; bonus: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const r = await fetch("/api/devices", { cache: "no-store" });
    const j = await r.json();
    setImports(j.imports);
    setConnections(j.connections ?? []);
    setProviders(j.providers ?? []);
  }

  useEffect(() => {
    load();
    // Pick up the ?oauth=connected query the callback adds, so a successful
    // round-trip surfaces a toast even if the user navigated away in between.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const status = url.searchParams.get("oauth");
      const provider = url.searchParams.get("provider");
      const mode = url.searchParams.get("mode");
      if (status === "connected" && provider) {
        toast({
          title: `${provider} connected`,
          body: mode === "demo" ? "Secure authorization completed · recovery data imported." : "Secure authorization completed · latest data pulled.",
          tone: "success",
        });
        url.searchParams.delete("oauth");
        url.searchParams.delete("provider");
        url.searchParams.delete("mode");
        window.history.replaceState({}, "", url.toString());
        refresh();
      } else if (status === "denied" && provider) {
        toast({ title: `${provider} denied`, body: "You can connect any time from this page.", tone: "info" });
      } else if (status === "error") {
        toast({ title: "OAuth failed", body: url.searchParams.get("message") ?? "Unknown error", tone: "danger" });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadText(filename: string, text: string) {
    setBusy(true);
    const r = await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, text }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json();
      toast({ title: "Import failed", body: j.error, tone: "danger" });
      return;
    }
    const j = await r.json();
    setLastResult({
      source: j.parsed.source,
      date: j.entry.date,
      bonus:
        (j.entry.sleepDurationHours >= 7 ? 7000 : 4000) +
        (j.entry.steps >= 8000 ? 3000 : 1500),
    });
    toast({ title: "Device data imported", body: `${j.parsed.source} · ${j.entry.date}`, tone: "success" });
    load();
    refresh();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    await uploadText(f.name, text);
    if (fileRef.current) fileRef.current.value = "";
  }

  function connect(provider: ProviderRow["id"]) {
    setConnecting(provider);
    // Full-tab navigation keeps the OAuth flow deterministic for Playwright
    // recording. The callback redirects us back to /app/devices.
    window.location.href = `/api/devices/oauth/${provider}/start?redirect_after=/app/devices`;
  }

  async function disconnect(provider: ProviderRow["id"]) {
    const r = await fetch(`/api/devices?provider=${provider}`, { method: "DELETE" });
    if (!r.ok) {
      toast({ title: "Disconnect failed", body: (await r.json()).error, tone: "danger" });
      return;
    }
    toast({ title: `${provider} disconnected`, body: "Tokens cleared.", tone: "info" });
    load();
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-[0.18em] text-moon-200/70">Device imports</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Connect your wearables.</h1>
        <p className="mt-1 max-w-2xl text-sm text-moon-200/70">
          One tap to authorise Fitbit, Oura, or Google Fit. We pull the daily summary you&apos;d see in their app and
          turn it into bonus credits tonight. No raw heart-rate, GPS, or messages — only the totals that fund Recovery.
        </p>
      </header>

      {/* PRIMARY ACTION — OAuth connect cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {providers.map((p) => {
          const visual = PROVIDER_VISUAL[p.id];
          const Icon = visual.icon;
          const conn = connections.find((c) => c.provider === p.id);
          const isBusy = connecting === p.id;
          return (
            <div
              key={p.id}
              className={"glass-card relative overflow-hidden p-5"}
              data-testid={`connect-card-${p.id}`}
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${visual.color}`} />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <Icon className="h-6 w-6 text-white" />
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] " +
                      (p.mode === "live"
                        ? "bg-aurora-mint/20 text-aurora-mint"
                        : "bg-aurora-amber/15 text-aurora-amber")
                    }
                  >
                    Secure Connect
                  </span>
                </div>
                <h3 className="mt-3 font-display text-lg font-semibold">{p.label}</h3>
                <p className="mt-1 text-xs text-moon-200/70">
                  Scopes: <span className="font-mono">{p.scopes.split(/[ ,]+/).slice(0, 2).join(" · ")}</span>
                </p>

                {conn ? (
                  <div className="mt-4 space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-aurora-mint/30 bg-aurora-mint/5 px-3 py-1 text-xs text-aurora-mint">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Connected
                    </div>
                    <div className="text-[11px] text-moon-200/60">
                      Last sync: {conn.lastSyncAt ? formatRelative(conn.lastSyncAt) : "just now"}
                    </div>
                    <button
                      onClick={() => disconnect(p.id)}
                      className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-moon-200 hover:bg-white/[0.04]"
                      data-testid={`disconnect-${p.id}`}
                    >
                      <Unlink className="h-3 w-3" /> Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => connect(p.id)}
                    disabled={isBusy}
                    className="btn-primary mt-4 w-full justify-center"
                    data-testid={`connect-${p.id}`}
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Redirecting…
                      </>
                    ) : (
                      <>
                        <LinkIcon className="h-4 w-4" /> Connect with {p.label}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass-card p-6 lg:col-span-2">
          <div className="stat-label">Or upload a manual export</div>
          <h2 className="mt-1 font-display text-xl font-semibold">Apple Health & file imports</h2>
          <p className="mt-2 text-xs text-moon-200/70">
            HealthKit has no web OAuth — export from the Health app on your iPhone and drop the file here. CSV / JSON
            under 4 MB. Files never leave your runtime store; we extract only daily totals.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input ref={fileRef} onChange={onFile} type="file" accept=".csv,.json,.txt" className="hidden" id="device-file" data-testid="device-file" />
            <label htmlFor="device-file" className="btn-secondary cursor-pointer">
              <Upload className="h-4 w-4" /> {busy ? "Importing…" : "Choose file"}
            </label>
            <span className="text-xs text-moon-200/60">CSV · JSON · &lt; 4 MB</span>
          </div>

          <div className="mt-6">
            <div className="stat-label">Sample exports</div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {TEMPLATES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.source}
                    onClick={() => uploadText(`${t.source}.${t.sample.startsWith("{") ? "json" : "csv"}`, t.sample)}
                    className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left text-sm hover:bg-white/[0.04]"
                    data-testid={`device-sample-${t.source}`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 text-aurora-teal" />
                    <div>
                      <div className="font-medium">{t.label}</div>
                      <div className="text-xs text-moon-200/60">Click to import the sample payload</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {lastResult && (
            <div className="mt-6 rounded-xl border border-aurora-teal/30 bg-aurora-teal/5 p-4 text-sm">
              <div className="flex items-center gap-2 text-aurora-teal">
                <CheckCircle2 className="h-4 w-4" /> Imported {lastResult.source} for {lastResult.date}
              </div>
              <p className="mt-2 text-xs text-moon-200/80">
                Recovery recomputed. Approximate bonus credits booked tonight: <span className="font-mono text-aurora-mint">+{formatCredits(lastResult.bonus)}</span>.
              </p>
            </div>
          )}
        </div>

        <div className="glass-card p-6">
          <div className="stat-label">Trust ladder</div>
          <h3 className="mt-1 font-display text-xl font-semibold">Why source matters</h3>
          <ul className="mt-4 space-y-3 text-sm text-moon-100/85">
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-aurora-teal" />
              <div>
                <div className="font-medium">oauth_connection · 1.0×</div>
                <div className="text-xs text-moon-200/60">Real-time OAuth with Fitbit, Oura, Google Fit.</div>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-aurora-teal" />
              <div>
                <div className="font-medium">device_import · 1.0×</div>
                <div className="text-xs text-moon-200/60">Apple Health, Fitbit, Oura, Google Fit exports.</div>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-aurora-violet" />
              <div>
                <div className="font-medium">manual · 0.5×</div>
                <div className="text-xs text-moon-200/60">Numbers typed in yourself. Honest but unverified.</div>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-aurora-rose" />
              <div>
                <div className="font-medium">sample · informational only</div>
                <div className="text-xs text-moon-200/60">Guided presets for product evaluation.</div>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="mb-2 stat-label">Recent imports</div>
        <div className="space-y-2">
          {imports.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-moon-200/60">
              No device data yet. Connect a wearable above, or use one of the sample exports.
            </div>
          )}
          {imports.map((it) => (
            <div key={it.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-sm" data-testid={`device-import-${it.source}`}>
              <div className="flex items-center justify-between text-xs text-moon-200/70">
                <span>
                  {it.source} · {it.filename}
                </span>
                <span>{formatRelative(it.createdAt)}</span>
              </div>
              <div className="mt-1 text-moon-100">
                {it.rows} rows · {(it.bytes / 1024).toFixed(1)} KB
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
