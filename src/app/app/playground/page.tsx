"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../providers";
import { formatCredits } from "@/lib/utils";
import { Sparkles, FileText, Megaphone, ScrollText, ListChecks, Play, Lock, ShieldCheck, Cpu } from "lucide-react";

const TOOLS = [
  { id: "generate_readme" as const, label: "Generate README", icon: FileText,
    sample: "Generate a polished README for Good Night Credits, a wallet that rewards healthy AI usage rhythm.", cost: 2400 },
  { id: "generate_pitch" as const, label: "Generate Launch Pitch", icon: Megaphone,
    sample: "Draft a 5-slide launch pitch for Good Night Credits. Emphasise mass adoption + developer wellness.", cost: 5200 },
  { id: "review_code" as const, label: "Review My Code", icon: ScrollText,
    sample: "Review the rest-window settlement logic. Find the two most important fixes before production use.", cost: 3400 },
  { id: "plan_agent_tasks" as const, label: "Plan Agent Tasks", icon: ListChecks,
    sample: "Plan a 4-task overnight agent run that helps me ship the launch checklist tomorrow morning.", cost: 4800 },
];

type ToolId = (typeof TOOLS)[number]["id"];

interface DiscoveredModelLite {
  id: string;          // public id — e.g. "gpt-5.5"
  modelName: string;   // mirror of id, kept so existing call sites compile
  tier: "basic" | "advanced";
  inputCost: number;
  outputCost: number;
}

type Mode = "tools" | "model";

export default function PlaygroundPage() {
  const { snapshot, refresh, toast } = useApp();
  const [mode, setMode] = useState<Mode>("tools");

  // Tools mode
  const [tool, setTool] = useState<ToolId>("generate_readme");
  const [prompt, setPrompt] = useState(TOOLS[0].sample);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string>("");
  const [receipt, setReceipt] = useState<{ creditsUsed: number; remainingCredits: number; modelLabel?: string; tier?: string } | null>(null);

  // Model mode
  const [models, setModels] = useState<DiscoveredModelLite[]>([]);
  const [eligibility, setEligibility] = useState<{ allowed: boolean; reasons: string[] } | null>(null);
  const [modelId, setModelId] = useState<string>("");
  const [systemPrompt, setSystemPrompt] = useState<string>("You are GNC's AI co-pilot. Keep answers calm, concrete, and under 200 words.");
  const [maxTokens, setMaxTokens] = useState<number>(700);
  const [temperature, setTemperature] = useState<number>(0.6);

  useEffect(() => {
    fetch("/api/providers", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setModels(j.models);
        setEligibility({ allowed: j.eligibility.allowed, reasons: j.eligibility.reasons });
        // Smart default: the public gateway intentionally exposes one model
        // name, so the UI should land there directly.
        const all = j.models as DiscoveredModelLite[];
        const preferred = all[0];
        if (preferred) setModelId(preferred.id);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    const t = TOOLS.find((x) => x.id === tool);
    if (t) setPrompt(t.sample);
  }, [tool]);

  const activeModel = useMemo(() => models.find((m) => m.id === modelId) ?? null, [models, modelId]);
  const basicModels = useMemo(() => models.filter((m) => m.tier === "basic"), [models]);
  const advancedModels = useMemo(() => models.filter((m) => m.tier === "advanced"), [models]);
  const estCost = useMemo(() => {
    if (!activeModel) return 0;
    const promptTokens = Math.max(1, Math.ceil(prompt.length / 4));
    return Math.ceil((promptTokens / 1000) * activeModel.inputCost + (maxTokens / 1000) * activeModel.outputCost);
  }, [activeModel, prompt, maxTokens]);
  const fixedCost = TOOLS.find((t) => t.id === tool)!.cost;
  const cost = mode === "tools" ? fixedCost : estCost;
  const modelLocked = mode === "model" && activeModel?.tier === "advanced" && !eligibility?.allowed;

  async function runTools(forceDuringRest = false) {
    if (!snapshot) return;
    if (snapshot.wallet.availableCredits < fixedCost) {
      toast({ title: "Not enough credits", body: `Need ${fixedCost}, have ${snapshot.wallet.availableCredits}.`, tone: "danger" });
      return;
    }
    setRunning(true); setOutput(""); setReceipt(null);
    const r = await fetch("/api/playground", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, prompt, confirm_during_rest: forceDuringRest }),
    });
    if (r.status === 409) {
      const j = await r.json();
      const ok = confirm(j.message + "\n\nRun anyway?");
      setRunning(false);
      if (ok) runTools(true);
      return;
    }
    if (!r.ok) { const j = await r.json(); toast({ title: "Run failed", body: j.error, tone: "danger" }); setRunning(false); return; }
    const j = await r.json();
    setOutput(j.output);
    setReceipt({ creditsUsed: j.creditsUsed, remainingCredits: j.remainingCredits });
    setRunning(false); refresh();
  }

  async function runModelCall(forceDuringRest = false) {
    if (!snapshot || !activeModel) return;
    if (modelLocked) {
      toast({ title: "Model locked", body: eligibility?.reasons.join(" • ") ?? "Eligibility required.", tone: "danger" });
      return;
    }
    setRunning(true); setOutput(""); setReceipt(null);
    const r = await fetch("/api/playground", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "model",
        model_id: activeModel.id,
        prompt,
        system_prompt: systemPrompt,
        max_tokens: maxTokens,
        temperature,
        confirm_during_rest: forceDuringRest,
      }),
    });
    if (r.status === 409) {
      const j = await r.json();
      const ok = confirm(j.message + "\n\nRun anyway?");
      setRunning(false);
      if (ok) runModelCall(true);
      return;
    }
    if (!r.ok) {
      const j = await r.json();
      const body = j.requires?.length ? `Requires:\n${j.requires.map((s: string) => "• " + s).join("\n")}` : j.error;
      toast({ title: "Run failed", body, tone: "danger" });
      setRunning(false);
      return;
    }
    const j = await r.json();
    setOutput(j.output);
    setReceipt({
      creditsUsed: j.creditsUsed,
      remainingCredits: j.remainingCredits,
      modelLabel: j.modelId,
      tier: j.tier,
    });
    setRunning(false); refresh();
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-[0.18em] text-moon-200/70">AI Playground</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Spend credits on real AI.</h1>
        <p className="mt-1 max-w-2xl text-sm text-moon-200/70">
          Fixed-cost tool templates, or call any available model by name. Manual usage during your rest window pops a soft warning before running.
        </p>
      </header>

      {/* Mode tabs */}
      <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
        <button onClick={() => setMode("tools")} className={"rounded-lg px-4 py-1.5 text-sm transition-colors " + (mode === "tools" ? "bg-white/10 text-white" : "text-moon-200/70 hover:text-white")} data-testid="mode-tools">
          <Sparkles className="-mt-0.5 mr-1.5 inline h-3.5 w-3.5" /> Templates
        </button>
        <button onClick={() => setMode("model")} className={"rounded-lg px-4 py-1.5 text-sm transition-colors " + (mode === "model" ? "bg-white/10 text-white" : "text-moon-200/70 hover:text-white")} data-testid="mode-model">
          <Cpu className="-mt-0.5 mr-1.5 inline h-3.5 w-3.5" /> Model
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          {mode === "tools" ? (
            <div className="glass-card p-4">
              <div className="stat-label mb-2">Choose a tool</div>
              <div className="space-y-1">
                {TOOLS.map((t) => {
                  const Icon = t.icon;
                  const active = tool === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTool(t.id)}
                      data-testid={`tool-${t.id}`}
                      className={
                        "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-colors " +
                        (active ? "border-aurora-teal/40 bg-aurora-teal/10 text-white" : "border-white/5 bg-white/[0.02] text-moon-100 hover:bg-white/[0.04]")
                      }
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-aurora-teal" /> {t.label}
                      </span>
                      <span className="text-xs text-moon-200/80">{formatCredits(t.cost)} cr</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="glass-card p-4">
              <div className="stat-label mb-2">Model</div>
              <label className="block">
                <span className="label">Choose model</span>
                <select
                  className="input mt-1"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  data-testid="model-select"
                >
                  {basicModels.length > 0 && (
                    <optgroup label="Basic — always available">
                      {basicModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.id}</option>
                      ))}
                    </optgroup>
                  )}
                  {advancedModels.length > 0 && (
                    <optgroup label={eligibility?.allowed ? "Advanced — unlocked tonight" : "Advanced — needs rest + health"}>
                      {advancedModels.map((m) => (
                        <option key={m.id} value={m.id} disabled={!eligibility?.allowed}>
                          {m.id} {eligibility?.allowed ? "" : "(locked)"}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              {activeModel && (
                <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-moon-200/80" data-testid="model-card">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-moon-50">{activeModel.id}</span>
                    <span className={"rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] " + (activeModel.tier === "advanced" ? "bg-aurora-rose/15 text-aurora-rose" : "bg-aurora-teal/15 text-aurora-teal")}>{activeModel.tier}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <span>input {activeModel.inputCost}/1k</span>
                    <span className="text-right">output {activeModel.outputCost}/1k</span>
                  </div>
                </div>
              )}
              <label className="block mt-3">
                <span className="label">Max tokens — {maxTokens}</span>
                <input type="range" min={128} max={4000} step={32} value={maxTokens} onChange={(e) => setMaxTokens(parseInt(e.target.value))} className="mt-1 w-full accent-aurora-teal" />
              </label>
              <label className="block mt-3">
                <span className="label">Temperature — {temperature.toFixed(2)}</span>
                <input type="range" min={0} max={2} step={0.05} value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="mt-1 w-full accent-aurora-violet" />
              </label>

              {modelLocked && (
                <div className="mt-3 rounded-xl border border-aurora-rose/30 bg-aurora-rose/5 p-3 text-xs text-aurora-rose" data-testid="model-locked">
                  <Lock className="mr-1 inline h-3 w-3" /> Advanced tier locked.
                  <ul className="mt-2 list-inside list-disc space-y-0.5 text-moon-200/80">
                    {eligibility?.reasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              )}
              {!modelLocked && activeModel?.tier === "advanced" && (
                <div className="mt-3 rounded-xl border border-aurora-mint/30 bg-aurora-mint/5 p-3 text-xs text-aurora-mint">
                  <ShieldCheck className="mr-1 inline h-3 w-3" /> Advanced unlocked — rest & health verified.
                </div>
              )}
            </div>
          )}

          <div className="glass-card mt-4 p-4">
            <div className="stat-label">Wallet</div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-display text-2xl font-semibold gradient-text">{formatCredits(snapshot?.wallet.availableCredits ?? 0)}</span>
              <span className="text-xs text-moon-200/70">available</span>
            </div>
            <div className="divider my-3" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-moon-200/70">Estimated cost</span>
              <span className="font-mono text-moon-50">{formatCredits(cost)} cr</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-moon-200/70">After run</span>
              <span className="font-mono text-aurora-teal">{formatCredits((snapshot?.wallet.availableCredits ?? 0) - cost)} cr</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8">
          {mode === "model" && (
            <div className="glass-card mb-4 p-5">
              <div className="stat-label">System prompt</div>
              <textarea
                className="input mt-2 min-h-[80px]"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                maxLength={2000}
                data-testid="system-prompt"
              />
            </div>
          )}
          <div className="glass-card p-5">
            <div className="stat-label">Prompt</div>
            <textarea
              data-testid="playground-prompt"
              className="input mt-2 min-h-[140px]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={mode === "model" ? 8000 : 4000}
            />
            <div className="mt-3 flex items-center justify-between text-xs text-moon-200/70">
              <span>
                {prompt.length} / {mode === "model" ? 8000 : 4000} chars
              </span>
              <button
                onClick={() => (mode === "tools" ? runTools() : runModelCall())}
                disabled={running || !prompt.trim() || modelLocked}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="playground-run"
              >
                <Play className="h-4 w-4" /> {running ? "Running…" : "Run"}
              </button>
            </div>
          </div>

          <div className="glass-card mt-4 p-5">
            <div className="flex items-center justify-between">
              <div className="stat-label">Output</div>
              {receipt && (
                <div className="text-xs text-moon-200/70" data-testid="playground-receipt">
                  {receipt.modelLabel && <span className="mr-2 font-mono text-aurora-violet">{receipt.modelLabel}</span>}
                  Cost: <span className="font-mono text-aurora-rose">−{formatCredits(receipt.creditsUsed)} cr</span>
                  {" · "}
                  Balance: <span className="font-mono text-moon-50">{formatCredits(receipt.remainingCredits)} cr</span>
                </div>
              )}
            </div>
            <pre
              className="mt-3 max-h-[60vh] min-h-[200px] overflow-auto whitespace-pre-wrap rounded-xl border border-white/5 bg-black/40 p-4 font-mono text-xs text-moon-100"
              data-testid="playground-output"
            >
              {output ||
                (running ? (
                  <span className="text-moon-200/70"><Sparkles className="mr-1 inline h-3 w-3 animate-pulse" /> Streaming…</span>
                ) : (
                  <span className="text-moon-200/50">Output will appear here.</span>
                ))}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
