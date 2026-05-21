"use client";

import { useEffect, useState } from "react";
import { useApp } from "../../providers";
import { ScoreRing } from "@/components/ScoreRing";
import { formatCredits } from "@/lib/utils";
import { ShieldCheck, Trash2, RefreshCcw } from "lucide-react";

type Preset = "well_rested" | "average" | "burned_out";

interface Form {
  sleep_duration_hours: number;
  sleep_quality_score: number;
  steps: number;
  active_minutes: number;
  break_count: number;
  total_break_minutes: number;
}

const DEFAULT_FORM: Form = {
  sleep_duration_hours: 7.8,
  sleep_quality_score: 86,
  steps: 8200,
  active_minutes: 34,
  break_count: 3,
  total_break_minutes: 48,
};

export default function RecoveryPage() {
  const { snapshot, refresh, toast } = useApp();
  const [form, setForm] = useState<Form>(DEFAULT_FORM);
  const [consent, setConsent] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (snapshot?.todayHealth) {
      setForm({
        sleep_duration_hours: snapshot.todayHealth.sleepDurationHours,
        sleep_quality_score: snapshot.todayHealth.sleepQualityScore,
        steps: snapshot.todayHealth.steps,
        active_minutes: snapshot.todayHealth.activeMinutes,
        break_count: snapshot.todayHealth.breakCount,
        total_break_minutes: snapshot.todayHealth.totalBreakMinutes,
      });
    }
  }, [snapshot?.todayHealth]);

  async function submit() {
    if (!consent) {
      toast({ title: "Please confirm consent", tone: "danger" });
      return;
    }
    setSaving(true);
    const r = await fetch("/api/health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (r.ok) {
      toast({ title: "Recovery recomputed", tone: "success" });
      refresh();
    } else {
      toast({ title: "Could not save", tone: "danger" });
    }
  }

  async function preset(p: Preset) {
    const r = await fetch("/api/health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset: p }),
    });
    if (r.ok) {
      toast({ title: `Preset applied: ${p.replace("_", " ")}`, tone: "info" });
      refresh();
    }
  }

  async function deleteData() {
    await fetch("/api/health", { method: "DELETE" });
    toast({ title: "Health data deleted", tone: "info" });
    refresh();
  }

  const recovery = snapshot?.recovery;

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-[0.18em] text-moon-200/70">Recovery</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
          Sleep · Move · Break · AI Rhythm
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-moon-200/70">
          Recovery Score = 35% Sleep + 20% Movement + 20% Break + 25% AI Rhythm. Each component publishes its own bonus reason in the wallet ledger.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass-card p-6 lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            <ScoreRing score={recovery?.totalScore ?? 0} size={200} />
            <div className="mt-3 text-sm text-moon-200/80">Today&apos;s recovery</div>
            <div className="mt-1 text-xs text-moon-200/60">
              Bonus total: +{formatCredits(
                (recovery?.bonuses.sleepBonus ?? 0) +
                (recovery?.bonuses.movementBonus ?? 0) +
                (recovery?.bonuses.breakBonus ?? 0) +
                (recovery?.bonuses.curfewBonus ?? 0),
              )} credits
            </div>
          </div>
          <div className="divider my-5" />
          <div className="space-y-2 text-sm">
            <Breakdown label="Sleep score" value={recovery?.sleepScore ?? 0} bonus={recovery?.bonuses.sleepBonus ?? 0} />
            <Breakdown label="Movement score" value={recovery?.movementScore ?? 0} bonus={recovery?.bonuses.movementBonus ?? 0} />
            <Breakdown label="Break score" value={recovery?.breakScore ?? 0} bonus={recovery?.bonuses.breakBonus ?? 0} />
            <Breakdown label="AI Rhythm score" value={recovery?.aiRhythmScore ?? 0} bonus={recovery?.bonuses.curfewBonus ?? 0} />
          </div>
        </div>

        <div className="glass-card p-6 lg:col-span-2">
          <div className="flex items-end justify-between">
            <div>
              <div className="stat-label">Today&apos;s data</div>
              <h2 className="mt-1 font-display text-xl font-semibold">Manual input</h2>
            </div>
            <div className="flex gap-1">
              {(["well_rested", "average", "burned_out"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => preset(p)}
                  className="btn-ghost text-xs"
                  data-testid={`preset-${p}`}
                >
                  {p.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Sleep duration (hours)">
              <input type="number" step="0.1" min={0} max={16} className="input" value={form.sleep_duration_hours}
                     onChange={(e) => setForm({ ...form, sleep_duration_hours: parseFloat(e.target.value) || 0 })} />
            </Field>
            <Field label="Sleep quality (0–100)">
              <input type="number" min={0} max={100} className="input" value={form.sleep_quality_score}
                     onChange={(e) => setForm({ ...form, sleep_quality_score: parseInt(e.target.value) || 0 })} />
            </Field>
            <Field label="Steps">
              <input type="number" min={0} className="input" value={form.steps}
                     onChange={(e) => setForm({ ...form, steps: parseInt(e.target.value) || 0 })} />
            </Field>
            <Field label="Active minutes">
              <input type="number" min={0} className="input" value={form.active_minutes}
                     onChange={(e) => setForm({ ...form, active_minutes: parseInt(e.target.value) || 0 })} />
            </Field>
            <Field label="Break count">
              <input type="number" min={0} className="input" value={form.break_count}
                     onChange={(e) => setForm({ ...form, break_count: parseInt(e.target.value) || 0 })} />
            </Field>
            <Field label="Total break minutes">
              <input type="number" min={0} className="input" value={form.total_break_minutes}
                     onChange={(e) => setForm({ ...form, total_break_minutes: parseInt(e.target.value) || 0 })} />
            </Field>
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-xl border border-aurora-teal/20 bg-aurora-teal/5 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-aurora-teal" />
            <label className="flex-1 text-xs text-moon-100/80">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mr-2 align-middle" />
              We use your sleep, movement, rest, and AI-usage data only to calculate credits.
              Good Night Credits does not provide medical advice. You can delete this data anytime.
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={submit} disabled={saving} className="btn-primary" data-testid="save-health">
              <RefreshCcw className="h-4 w-4" /> {saving ? "Saving…" : "Save & recompute"}
            </button>
            <button onClick={deleteData} className="btn-danger">
              <Trash2 className="h-4 w-4" /> Delete my data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Breakdown({ label, value, bonus }: { label: string; value: number; bonus: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-moon-200/80">{label}</span>
      <span className="font-mono text-moon-50">
        {value} <span className="ml-2 text-aurora-mint">+{formatCredits(bonus)}</span>
      </span>
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
