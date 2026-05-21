"use client";

import { useEffect, useState } from "react";
import { useApp } from "../../providers";
import { formatCredits, formatRelative } from "@/lib/utils";
import { Copy, KeyRound, Plus, Trash2, ShieldCheck, ShieldX, Terminal, AlertTriangle, CheckCircle2 } from "lucide-react";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  scope: "basic" | "all";
  createdAt: number;
  lastUsedAt?: number;
  usageCount: number;
  totalCreditsUsed: number;
  revoked: boolean;
}

interface DiscoveredModelLite {
  id: string;
  modelName: string;   // mirror, kept so existing call sites compile
  tier: "basic" | "advanced";
  inputCost: number;
  outputCost: number;
}

export default function ApiKeysPage() {
  const { toast } = useApp();
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [models, setModels] = useState<DiscoveredModelLite[]>([]);
  const [eligibility, setEligibility] = useState<{ allowed: boolean; reasons: string[]; hints: { stakedYesterday: boolean; healthUploadedRecently: boolean; deviceImportedThisWeek: boolean } } | null>(null);
  const [showToken, setShowToken] = useState<{ id: string; token: string } | null>(null);
  const [newName, setNewName] = useState("VibeCoder primary key");
  const [newScope, setNewScope] = useState<"basic" | "all">("basic");
  const [origin, setOrigin] = useState("http://localhost:3000");
  const [sdkTab, setSdkTab] = useState<"claude-code" | "openclaw" | "hermes" | "sdk" | "curl">("claude-code");

  async function loadKeys() {
    const r = await fetch("/api/api-keys", { cache: "no-store" });
    const j = await r.json();
    setKeys(j.keys);
  }
  async function loadProviders() {
    // Endpoint is now strictly model-list + eligibility — no backing provider
    // detail leaks out of the server.
    const r = await fetch("/api/providers", { cache: "no-store" });
    const j = await r.json();
    setModels(j.models);
    setEligibility(j.eligibility);
  }

  useEffect(() => {
    loadKeys();
    loadProviders();
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  async function create() {
    const r = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, scope: newScope }),
    });
    if (!r.ok) {
      toast({ title: "Could not create key", tone: "danger" });
      return;
    }
    const j = await r.json();
    setShowToken({ id: j.key.id, token: j.token });
    toast({ title: "API key created", body: "Copy it now — it won't be shown again.", tone: "success" });
    loadKeys();
  }

  async function revoke(id: string) {
    await fetch(`/api/api-keys?id=${id}&action=revoke`, { method: "DELETE" });
    toast({ title: "Key revoked", tone: "info" });
    loadKeys();
  }

  async function remove(id: string) {
    if (!confirm("Delete this key permanently?")) return;
    await fetch(`/api/api-keys?id=${id}`, { method: "DELETE" });
    loadKeys();
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast({ title: "Copied", tone: "info" }));
  }

  const basicCount = models.filter((m) => m.tier === "basic").length;
  const advancedCount = models.filter((m) => m.tier === "advanced").length;
  const hasAdvancedModels = advancedCount > 0;

  const sampleToken = showToken?.token ?? "gnc_live_<paste-your-key>";
  const sampleModel = models[0]?.id
    ?? "configured-model";

  const curlSample = `curl ${origin}/api/v1/chat/completions \\
  -H "Authorization: Bearer ${sampleToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${sampleModel}",
    "messages": [{ "role": "user", "content": "Ship me tomorrow morning." }]
  }'`;

  const sdkSample = `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: "${sampleToken}",
  baseURL: "${origin}/api",
});

const msg = await client.messages.create({
  model: "${sampleModel}",
  max_tokens: 512,
  system: "You are a senior VibeCoder. Be terse.",
  messages: [{ role: "user", content: "Refactor my agent loop in 5 bullets." }],
});

console.log(msg.content[0].text, msg.usage);

// Chat Completions clients also work:
import OpenAI from "openai";
const ai = new OpenAI({
  apiKey: "${sampleToken}",
  baseURL: "${origin}/api/v1",
});
const r = await ai.chat.completions.create({
  model: "${sampleModel}",
  messages: [{ role: "user", content: "Plan tomorrow morning." }],
});
console.log(r.choices[0].message.content, r.usage);`;

  const claudeCodeSample = `# Claude Code
# Import Good Night Credits as the Anthropic-compatible API endpoint.

export ANTHROPIC_BASE_URL="${origin}/api"
export ANTHROPIC_API_KEY="${sampleToken}"
export ANTHROPIC_MODEL="${sampleModel}"

claude   # every prompt now debits your Good Night Credits wallet.`;

  const openClawSample = `# OpenClaw
# Settings -> API endpoints -> Claude-compatible

Base URL: ${origin}/api
API Key:  ${sampleToken}
Model:    ${sampleModel}

# Equivalent environment form:
ANTHROPIC_BASE_URL=${origin}/api
ANTHROPIC_API_KEY=${sampleToken}
ANTHROPIC_MODEL=${sampleModel}`;

  const hermesSample = `# Hermes
# Add a Claude-compatible endpoint profile.

endpoint: claude-compatible
base_url: ${origin}/api
api_key: ${sampleToken}
model: ${sampleModel}

# The gateway also accepts direct /v1/messages at:
# ${origin}/api/v1/messages`;

  const sdkBlock = (() => {
    switch (sdkTab) {
      case "claude-code": return claudeCodeSample;
      case "openclaw": return openClawSample;
      case "hermes": return hermesSample;
      case "sdk": return sdkSample;
      case "curl": return curlSample;
    }
  })();

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-[0.18em] text-moon-200/70">API Keys & Gateway</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Real keys. Real models. Real wallet debits.</h1>
        <p className="mt-1 max-w-2xl text-sm text-moon-200/70">
          Issue one wallet key and import it into Claude Code, OpenClaw, Hermes, or your own SDK client.
          Claude-style tools use <span className="font-mono text-aurora-teal">{origin}/api</span>; Chat Completions clients use <span className="font-mono text-aurora-teal">{origin}/api/v1</span>.
        </p>
      </header>

      {/* Eligibility */}
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {eligibility?.allowed ? (
              <CheckCircle2 className="h-5 w-5 text-aurora-mint" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-aurora-amber" />
            )}
            <div>
              <div className="font-display text-lg font-semibold">
                {!hasAdvancedModels
                  ? "Configured model is available"
                  : eligibility?.allowed
                  ? "Advanced models unlocked"
                  : "Advanced models locked"}
              </div>
              <div className="text-xs text-moon-200/70">
                Public catalogue follows the configured model exposure.
                Current exposure: {models.length} model · {basicCount} basic{hasAdvancedModels ? ` · ${advancedCount} advanced` : ""}.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {hasAdvancedModels ? (
              <>
                <Pill ok={eligibility?.hints.stakedYesterday}>Rest stake yesterday</Pill>
                <Pill ok={eligibility?.hints.healthUploadedRecently}>Health uploaded ≤ 24 h</Pill>
                <Pill ok={eligibility?.hints.deviceImportedThisWeek}>Device import ≤ 7 d</Pill>
              </>
            ) : null}
          </div>
        </div>
        {hasAdvancedModels && !eligibility?.allowed && eligibility?.reasons.length ? (
          <ul className="mt-3 space-y-1 text-xs text-moon-200/80">
            {eligibility.reasons.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Models — routing source intentionally hidden */}
      <div className="glass-card p-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="stat-label">Catalogue</div>
            <h2 className="mt-1 font-display text-xl font-semibold">Models on this key</h2>
            <p className="mt-1 text-xs text-moon-200/70">
              Call models by their plain name. Routing stays private; your code only needs the model id and wallet key.
            </p>
          </div>
          <div className="text-xs text-moon-200/70">{models.length} total</div>
        </div>
        <div className="mt-3 grid max-h-72 gap-1.5 overflow-auto pr-1 text-sm md:grid-cols-2">
          {models.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
              data-testid={`model-${m.id}`}
            >
              <div className="min-w-0">
                <div className="truncate font-mono text-xs text-moon-50">{m.id}</div>
                <div className="text-[10px] text-moon-200/60">
                  model id · in {m.inputCost}/1k · out {m.outputCost}/1k
                </div>
              </div>
              <span
                className={
                  "ml-2 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] " +
                  (m.tier === "advanced" ? "bg-aurora-rose/15 text-aurora-rose" : "bg-aurora-teal/15 text-aurora-teal")
                }
              >
                {m.tier}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Issue key */}
      <div className="glass-card p-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="stat-label">Issue key</div>
            <h2 className="mt-1 font-display text-xl font-semibold">Create a new API key</h2>
          </div>
          <KeyRound className="h-5 w-5 text-aurora-teal" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block md:col-span-2">
            <span className="label">Name</span>
            <input className="input mt-1" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} data-testid="key-name" />
          </label>
          <label className="block">
            <span className="label">Scope</span>
            <select className="input mt-1" value={newScope} onChange={(e) => setNewScope(e.target.value as "basic" | "all")} data-testid="key-scope">
              <option value="basic">basic — basic models only</option>
              <option value="all">all — basic + advanced (subject to eligibility)</option>
            </select>
          </label>
        </div>
        <div className="mt-4">
          <button className="btn-primary" onClick={create} data-testid="key-create">
            <Plus className="h-4 w-4" /> Generate key
          </button>
        </div>

        {showToken && (
          <div className="mt-5 rounded-xl border border-aurora-teal/30 bg-aurora-teal/5 p-4 text-sm" data-testid="key-token">
            <div className="text-xs uppercase tracking-[0.18em] text-aurora-teal">One-time token</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="break-all rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-aurora-teal">
                {showToken.token}
              </code>
              <button onClick={() => copy(showToken.token)} className="btn-ghost text-xs"><Copy className="h-3.5 w-3.5" /> Copy</button>
              <button onClick={() => setShowToken(null)} className="btn-ghost text-xs">Hide</button>
            </div>
            <p className="mt-2 text-xs text-moon-200/70">
              Store this somewhere safe — we only show it once. The key hash is what we keep on disk.
            </p>
          </div>
        )}
      </div>

      {/* Active keys */}
      <div className="glass-card p-6">
        <div className="stat-label">Active keys</div>
        <h2 className="mt-1 font-display text-xl font-semibold">Your keys</h2>
        <div className="mt-3 space-y-2">
          {keys.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-moon-200/60">
              No keys yet. Generate one above.
            </div>
          )}
          {keys.map((k) => (
            <div key={k.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-4 text-sm" data-testid={`key-row-${k.id}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{k.name}</div>
                  <div className="text-[11px] text-moon-200/70 font-mono">{k.prefix}…{k.last4}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={"rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] " + (k.scope === "all" ? "bg-aurora-violet/15 text-aurora-violet" : "bg-aurora-teal/15 text-aurora-teal")}>{k.scope}</span>
                  {k.revoked ? (
                    <span className="rounded-full bg-aurora-rose/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-aurora-rose">revoked</span>
                  ) : (
                    <span className="rounded-full bg-aurora-mint/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-aurora-mint">active</span>
                  )}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-moon-200/70">
                <span>Created {formatRelative(k.createdAt)}</span>
                <span>{k.usageCount} calls</span>
                <span className="text-right">−{formatCredits(k.totalCreditsUsed)} cr</span>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                {!k.revoked && (
                  <button onClick={() => revoke(k.id)} className="btn-ghost text-xs"><ShieldX className="h-3.5 w-3.5" /> Revoke</button>
                )}
                <button onClick={() => remove(k.id)} className="btn-danger text-xs"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Code examples — both Chat Completions and Claude Messages shapes work on one key */}
      <div className="glass-card p-6">
        <div className="mb-2 flex items-center gap-2 text-sm">
          <Terminal className="h-4 w-4 text-aurora-teal" /> <span className="stat-label">Usage</span>
        </div>
        <h2 className="font-display text-xl font-semibold">Import this API into your coding stack</h2>
        <p className="mt-1 text-xs text-moon-200/70">
          One key, two compatible shapes —
          <span className="mx-1 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px]">/chat/completions</span>
          and
          <span className="mx-1 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px]">/messages</span>
          . Use the endpoint style your tool already speaks.
        </p>

        <div className="mt-4 inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {(["claude-code", "openclaw", "hermes", "sdk", "curl"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSdkTab(t)}
              className={
                "rounded-lg px-3 py-1.5 text-xs transition-colors " +
                (sdkTab === t ? "bg-white/10 text-white" : "text-moon-200/70 hover:text-white")
              }
              data-testid={`sdk-tab-${t}`}
            >
              {t === "claude-code" && "Claude Code"}
              {t === "openclaw" && "OpenClaw"}
              {t === "hermes" && "Hermes"}
              {t === "sdk" && "SDK"}
              {t === "curl" && "cURL"}
            </button>
          ))}
        </div>

        <pre
          className="mt-3 overflow-auto rounded-xl border border-white/5 bg-black/40 p-4 font-mono text-[11px] text-moon-100"
          data-testid={`sdk-block-${sdkTab}`}
        >
          {sdkBlock}
        </pre>

        <div className="mt-3 grid gap-2 text-xs text-moon-200/60 md:grid-cols-2">
          <div>
            <ShieldCheck className="mr-1 inline h-3 w-3 text-aurora-mint" />
            Errors follow each shape&apos;s native format — <code>tier_locked</code> (402) means the model needs sleep + a fresh health import.
          </div>
          <div>
            <Terminal className="mr-1 inline h-3 w-3 text-aurora-teal" />
            Same wallet for both shapes. Every call debits credits and gets logged in your token feed.
          </div>
        </div>
      </div>
    </div>
  );
}

function Pill({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] " +
        (ok
          ? "border-aurora-mint/30 bg-aurora-mint/10 text-aurora-mint"
          : "border-aurora-amber/30 bg-aurora-amber/10 text-aurora-amber")
      }
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {children}
    </span>
  );
}
