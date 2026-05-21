"use client";

import { useEffect, useState } from "react";
import { useApp } from "../../providers";
import { formatCredits, formatRelative } from "@/lib/utils";
import { BotMessageSquare, Plus, Play, Ban, Sparkles } from "lucide-react";
import type { AgentJob, AgentTaskType } from "@/lib/types";

const TASKS: { id: AgentTaskType; label: string; sample: string; cost: number }[] = [
  {
    id: "generate_readme",
    label: "README",
    sample: "Generate a polished README for Good Night Credits including quick start and architecture.",
    cost: 2400,
  },
  {
    id: "generate_pitch",
    label: "Pitch Deck",
    sample: "Draft a 5-slide launch pitch for Good Night Credits emphasising healthy AI usage.",
    cost: 5200,
  },
  {
    id: "review_code",
    label: "Code Review",
    sample: "Review the rest-window settlement function for off-by-one bugs.",
    cost: 3400,
  },
  {
    id: "plan_agent_tasks",
    label: "Task Plan",
    sample: "Plan a 4-task overnight agent run targeting tomorrow's launch checklist.",
    cost: 4800,
  },
];

export default function AgentPage() {
  const { refresh, toast } = useApp();
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [task, setTask] = useState<AgentTaskType>("generate_readme");
  const [prompt, setPrompt] = useState(TASKS[0].sample);
  const [budget, setBudget] = useState(8000);
  const [runAt, setRunAt] = useState<string>(() => new Date(Date.now() + 60_000).toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/agent-jobs", { cache: "no-store" });
    const j = await r.json();
    setJobs(j.jobs);
  }
  useEffect(() => {
    load();
    const taskMeta = TASKS.find((t) => t.id === task);
    if (taskMeta) {
      setPrompt(taskMeta.sample);
      setBudget(Math.max(taskMeta.cost, budget));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  async function create() {
    setBusy(true);
    const r = await fetch("/api/agent-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        task_type: task,
        prompt,
        scheduled_time: new Date(runAt).getTime(),
        max_budget: budget,
      }),
    });
    setBusy(false);
    if (r.ok) {
      toast({ title: "Agent job scheduled", tone: "success" });
      load();
      refresh();
    }
  }

  async function runNow(id: string) {
    setBusy(true);
    await fetch("/api/agent-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run_now", job_id: id }),
    });
    setBusy(false);
    toast({ title: "Agent job completed", tone: "success" });
    load();
    refresh();
  }

  async function cancel(id: string) {
    await fetch("/api/agent-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", job_id: id }),
    });
    toast({ title: "Cancelled", tone: "info" });
    load();
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-[0.18em] text-moon-200/70">Scheduled Agent</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Let the agent work while you sleep.</h1>
        <p className="mt-1 max-w-2xl text-sm text-moon-200/70">
          Schedule a task before bed. It runs on a tight budget during your rest window — without breaking your curfew bonus.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="glass-card p-6 lg:col-span-3">
          <div className="stat-label">Create job</div>
          <h2 className="mt-1 font-display text-xl font-semibold">New agent task</h2>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {TASKS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTask(t.id)}
                className={
                  "rounded-xl border p-3 text-left text-sm transition-colors " +
                  (task === t.id
                    ? "border-aurora-teal/40 bg-aurora-teal/10 text-white"
                    : "border-white/5 bg-white/[0.02] text-moon-100 hover:bg-white/[0.04]")
                }
                data-testid={`agent-task-${t.id}`}
              >
                <div className="font-medium">{t.label}</div>
                <div className="text-xs text-moon-200/70">{formatCredits(t.cost)} cr</div>
              </button>
            ))}
          </div>

          <label className="mt-5 block">
            <span className="label">Prompt</span>
            <textarea
              data-testid="agent-prompt"
              className="input mt-1 min-h-[120px]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="label">Run time</span>
              <input
                type="datetime-local"
                className="input mt-1"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Max budget (credits)</span>
              <input
                type="number"
                className="input mt-1"
                min={100}
                max={50000}
                value={budget}
                onChange={(e) => setBudget(parseInt(e.target.value) || 0)}
              />
            </label>
          </div>

          <div className="mt-5 flex gap-2">
            <button onClick={create} disabled={busy} className="btn-primary" data-testid="agent-create">
              <Plus className="h-4 w-4" /> Schedule
            </button>
          </div>
        </div>

        <div className="glass-card p-6 lg:col-span-2">
          <div className="stat-label">How agent usage protects your bonus</div>
          <ul className="mt-3 space-y-2 text-sm text-moon-100/85">
            <li className="flex gap-2"><Sparkles className="mt-0.5 h-4 w-4 text-aurora-teal" /> Scheduled jobs count as <span className="text-aurora-teal">agent usage</span>, not manual.</li>
            <li className="flex gap-2"><Sparkles className="mt-0.5 h-4 w-4 text-aurora-teal" /> Agent usage doesn&apos;t break the curfew bonus.</li>
            <li className="flex gap-2"><Sparkles className="mt-0.5 h-4 w-4 text-aurora-teal" /> Each job runs only inside its declared budget.</li>
            <li className="flex gap-2"><Sparkles className="mt-0.5 h-4 w-4 text-aurora-teal" /> Editing the prompt mid-rest reclassifies the run as manual.</li>
          </ul>
        </div>
      </div>

      <div className="glass-card p-6" data-testid="agent-list">
        <div className="mb-3 flex items-center gap-2 text-sm">
          <BotMessageSquare className="h-4 w-4 text-aurora-teal" /> Recent jobs
        </div>
        <div className="space-y-3">
          {jobs.map((j) => (
            <div key={j.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-4 text-sm" data-testid={`agent-job-${j.id}`}>
              <div className="flex items-center justify-between text-xs text-moon-200/70">
                <span>{j.taskType.replace("_", " ")} · budget {formatCredits(j.maxBudget)} cr</span>
                <span
                  className={
                    j.status === "completed" ? "text-aurora-mint" :
                    j.status === "running" ? "text-aurora-teal" :
                    j.status === "failed" ? "text-aurora-rose" :
                    j.status === "scheduled" ? "text-aurora-amber" : "text-moon-200/60"
                  }
                >
                  {j.status}
                </span>
              </div>
              <div className="mt-1 text-moon-100">{j.prompt}</div>
              {j.output && (
                <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/40 p-3 font-mono text-[11px]">
                  {j.output}
                </pre>
              )}
              <div className="mt-3 flex items-center justify-between text-[11px] text-moon-200/70">
                <span>
                  Scheduled {formatRelative(j.scheduledTime)} · created {formatRelative(j.createdAt)}
                </span>
                <div className="flex gap-2">
                  {j.status === "scheduled" && (
                    <>
                      <button onClick={() => runNow(j.id)} className="btn-ghost text-xs">
                        <Play className="h-3 w-3" /> Run now
                      </button>
                      <button onClick={() => cancel(j.id)} className="btn-danger text-xs">
                        <Ban className="h-3 w-3" /> Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {jobs.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-moon-200/60">
              No agent jobs yet. Schedule one above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
