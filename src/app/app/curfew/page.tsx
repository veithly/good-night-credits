"use client";

import { useEffect, useState } from "react";
import { useApp } from "../../providers";
import { formatCredits } from "@/lib/utils";
import { PlayCircle, CheckCircle2 } from "lucide-react";

interface CurfewState {
  settings: {
    restWindowStart: string;
    restWindowEnd: string;
    manualUsageAllowance: number;
    agentBudget: number;
  };
  history: { id: string; startTime: number; endTime: number; status: string; manualTokensUsed: number; rewardEarned: number }[];
}

export default function CurfewPage() {
  const { refresh, toast } = useApp();
  const [state, setState] = useState<CurfewState | null>(null);
  const [start, setStart] = useState("23:30");
  const [end, setEnd] = useState("07:30");
  const [allowance, setAllowance] = useState(500);
  const [budget, setBudget] = useState(10000);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  async function load() {
    const r = await fetch("/api/curfew", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as CurfewState;
      setState(j);
      setStart(j.settings.restWindowStart);
      setEnd(j.settings.restWindowEnd);
      setAllowance(j.settings.manualUsageAllowance);
      setBudget(j.settings.agentBudget);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    const r = await fetch("/api/curfew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        rest_window_start: start,
        rest_window_end: end,
        manual_usage_allowance: allowance,
        agent_budget: budget,
      }),
    });
    if (r.ok) {
      toast({ title: "Curfew updated", tone: "success" });
      load();
      refresh();
    } else {
      toast({ title: "Could not save", tone: "danger" });
    }
  }

  async function startPreview() {
    setRunning(true);
    setProgress(0);
    await fetch("/api/curfew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start_demo" }),
    });
    const TOTAL = 45_000;
    const t0 = Date.now();
    const id = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / TOTAL);
      setProgress(k);
      if (k >= 1) clearInterval(id);
    }, 200);
    await new Promise((res) => setTimeout(res, TOTAL));
    const r = await fetch("/api/curfew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "settle" }),
    });
    const j = await r.json();
    toast({
      title: "Rest session completed",
      body: `+${formatCredits(j?.window?.rewardEarned ?? 0)} credits credited`,
      tone: "success",
    });
    setRunning(false);
    load();
    refresh();
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-[0.18em] text-moon-200/70">Compute Curfew</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Protect your rest window.</h1>
        <p className="mt-1 max-w-2xl text-sm text-moon-200/70">
          Keep manual AI usage below your allowance and earn the full curfew bonus, multiplied by your rest streak.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card p-6">
          <div className="stat-label">Settings</div>
          <h2 className="mt-1 font-display text-xl font-semibold">Rest window</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Start">
              <input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} data-testid="curfew-start" />
            </Field>
            <Field label="End">
              <input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="curfew-end" />
            </Field>
            <Field label="Manual usage allowance (credits)">
              <input type="number" className="input" value={allowance} min={0} max={5000}
                     onChange={(e) => setAllowance(parseInt(e.target.value) || 0)} />
            </Field>
            <Field label="Agent budget (credits)">
              <input type="number" className="input" value={budget} min={0} max={50000}
                     onChange={(e) => setBudget(parseInt(e.target.value) || 0)} />
            </Field>
          </div>
          <div className="mt-5 flex gap-2">
            <button onClick={save} className="btn-primary" data-testid="curfew-save">Save</button>
            <button onClick={startPreview} className="btn-ghost" disabled={running} data-testid="curfew-start-demo">
              <PlayCircle className="h-4 w-4" /> {running ? "Resting…" : "Start Rest Session"}
            </button>
          </div>

          {running && (
            <div className="mt-5" data-testid="rest-countdown">
              <div className="flex items-center justify-between text-xs text-moon-200/70">
                <span>Accelerated rest window</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full bg-gradient-to-r from-aurora-teal to-aurora-violet transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="glass-card p-6">
          <div className="stat-label">History</div>
          <h2 className="mt-1 font-display text-xl font-semibold">Recent rest windows</h2>
          <div className="mt-4 space-y-2">
            {(state?.history ?? []).slice().reverse().map((w) => (
              <div key={w.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-moon-200/80">
                    {new Date(w.startTime).toLocaleString()} → {new Date(w.endTime).toLocaleString()}
                  </span>
                  <span
                    className={
                      w.status === "completed" ? "text-aurora-mint" :
                      w.status === "broken" ? "text-aurora-rose" :
                      w.status === "active" ? "text-aurora-teal" : "text-moon-200/60"
                    }
                  >
                    {w.status === "completed" && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                    {w.status}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>Manual usage: <span className="font-mono">{formatCredits(w.manualTokensUsed)} cr</span></div>
                  <div className="text-right">
                    Reward: <span className="font-mono text-aurora-mint">+{formatCredits(w.rewardEarned)} cr</span>
                  </div>
                </div>
              </div>
            ))}
            {(state?.history ?? []).length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-moon-200/60">
                No rest windows settled yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
