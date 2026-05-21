"use client";

import { useEffect, useState } from "react";
import { useApp } from "../../providers";
import { ShieldCheck, Trash2 } from "lucide-react";

export default function SettingsPage() {
  const { snapshot, refresh, toast } = useApp();
  const [restStart, setRestStart] = useState("23:30");
  const [restEnd, setRestEnd] = useState("07:30");
  const [demoMode, setDemoMode] = useState(true);
  const [weekendRest, setWeekendRest] = useState(true);
  const [timezone, setTimezone] = useState("Asia/Shanghai");

  useEffect(() => {
    if (snapshot?.settings) {
      setRestStart(snapshot.settings.restWindowStart);
      setRestEnd(snapshot.settings.restWindowEnd);
      setDemoMode(snapshot.settings.demoModeEnabled);
      setWeekendRest(snapshot.settings.weekendRestEnabled);
    }
    if (snapshot?.user) setTimezone(snapshot.user.timezone);
  }, [snapshot]);

  async function save() {
    const r = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restWindowStart: restStart,
        restWindowEnd: restEnd,
        demoModeEnabled: demoMode,
        weekendRestEnabled: weekendRest,
      }),
    });
    if (r.ok) {
      toast({ title: "Settings saved", tone: "success" });
      refresh();
    }
  }

  async function deleteAll() {
    if (!confirm("Delete all your health data? This cannot be undone.")) return;
    await fetch("/api/health", { method: "DELETE" });
    toast({ title: "Health data deleted", tone: "info" });
    refresh();
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-[0.18em] text-moon-200/70">Settings & Privacy</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Your rest, your rhythm.</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card p-6">
          <div className="stat-label">Preferences</div>
          <h2 className="mt-1 font-display text-xl font-semibold">Defaults</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Default rest start">
              <input type="time" className="input" value={restStart} onChange={(e) => setRestStart(e.target.value)} />
            </Field>
            <Field label="Default rest end">
              <input type="time" className="input" value={restEnd} onChange={(e) => setRestEnd(e.target.value)} />
            </Field>
            <Field label="Timezone">
              <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </Field>
            <Field label="Weekend rest">
              <select className="input" value={weekendRest ? "1" : "0"} onChange={(e) => setWeekendRest(e.target.value === "1")}>
                <option value="1">Enabled</option>
                <option value="0">Disabled</option>
              </select>
            </Field>
            <Field label="Accelerated sessions">
              <select className="input" value={demoMode ? "1" : "0"} onChange={(e) => setDemoMode(e.target.value === "1")}>
                <option value="1">On — rest windows settle quickly</option>
                <option value="0">Off</option>
              </select>
            </Field>
          </div>
          <div className="mt-5">
            <button onClick={save} className="btn-primary">Save</button>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="stat-label">Privacy & consent</div>
          <h2 className="mt-1 font-display text-xl font-semibold">What we collect</h2>
          <ul className="mt-4 space-y-2 text-sm text-moon-100/85">
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-aurora-teal" /> Only derived scores and the amounts you input — no raw health logs.</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-aurora-teal" /> Prompts stored as hashes by default — full text never persisted.</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-aurora-teal" /> API keys live server-side only — never shipped to the browser bundle.</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-aurora-teal" /> Good Night Credits is not a medical product.</li>
          </ul>
          <div className="mt-5">
            <button onClick={deleteAll} className="btn-danger">
              <Trash2 className="h-4 w-4" /> Delete my health data
            </button>
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
