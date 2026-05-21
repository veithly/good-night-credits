"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, Coins, BotMessageSquare, HeartPulse, Moon, ArrowRight, PlayCircle, ShieldCheck, Lock, Watch, KeyRound } from "lucide-react";
import { useApp } from "../providers";
import { StatCard } from "@/components/StatCard";
import { ScoreRing } from "@/components/ScoreRing";
import { formatCredits, formatRelative } from "@/lib/utils";

interface TierProbe {
  eligibility: { allowed: boolean; reasons: string[]; hints: { stakedYesterday: boolean; healthUploadedRecently: boolean; deviceImportedThisWeek: boolean } };
  models: { tier: "basic" | "advanced" }[];
}

export default function DashboardPage() {
  const { snapshot, refresh, loading, toast } = useApp();
  const [countdown, setCountdown] = useState("—");
  const [tier, setTier] = useState<TierProbe | null>(null);

  useEffect(() => {
    function tick() {
      if (!snapshot) return;
      const ms = snapshot.upcomingWindow.start - Date.now();
      if (ms <= 0) {
        setCountdown("active");
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setCountdown(`${h}h ${m}m`);
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [snapshot]);

  useEffect(() => {
    fetch("/api/providers", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setTier(j as TierProbe))
      .catch(() => null);
  }, [snapshot]);

  const ledger = useMemo(() => snapshot?.user, [snapshot]);
  const basicModelCount = tier?.models.filter((m) => m.tier === "basic").length ?? 0;
  const advancedModelCount = tier?.models.filter((m) => m.tier === "advanced").length ?? 0;
  const hasAdvancedModels = advancedModelCount > 0;

  if (loading || !snapshot) {
    return <DashboardSkeleton />;
  }

  const { wallet, recovery, settings, upcomingWindow, activeStake, agentJobs, streakDays } = snapshot;

  async function startDemoRest() {
    const r = await fetch("/api/curfew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start_demo" }),
    });
    if (!r.ok) {
      toast({ title: "Could not start rest preview", tone: "danger" });
      return;
    }
      toast({ title: "Rest session started", body: "Tonight's rest window is running in accelerated time.", tone: "info" });
    await new Promise((res) => setTimeout(res, 45_000));
    const s = await fetch("/api/curfew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "settle" }),
    });
    const j = await s.json();
    const reward = j?.window?.rewardEarned ?? 0;
    toast({
      title: "Rest Window completed",
      body: `+${formatCredits(reward)} credits credited.`,
      tone: "success",
    });
    refresh();
  }

  async function applyPreset(preset: "well_rested" | "average" | "burned_out") {
    const r = await fetch("/api/health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset }),
    });
    if (r.ok) {
      toast({ title: "Health data applied", body: `Preset: ${preset.replace("_", " ")}`, tone: "success" });
      refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-moon-200/70">Dashboard</div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight" data-testid="dash-greeting">
            Good evening, {ledger?.username ?? "builder"}.
          </h1>
          <p className="mt-1 text-sm text-moon-200/70">
            Your rest window starts in <span className="text-aurora-teal">{countdown}</span>. Streak ·{" "}
            <span className="text-aurora-violet">{streakDays} days</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={startDemoRest} className="btn-primary" data-testid="cta-demo-rest">
            <PlayCircle className="h-4 w-4" /> Start Rest Session
          </button>
          <Link href="/app/playground" className="btn-ghost">
            <Sparkles className="h-4 w-4" /> Open Playground
          </Link>
        </div>
      </div>

      {/* Tier-status strip (multi-provider gateway + eligibility) */}
      {tier && (
        <div
          className={
            "glass-card flex flex-wrap items-center justify-between gap-3 p-4 " +
            (!hasAdvancedModels || tier.eligibility.allowed
              ? "border-aurora-mint/30 bg-aurora-mint/[0.04]"
              : "border-aurora-amber/30 bg-aurora-amber/[0.04]")
          }
          data-testid="tier-strip"
        >
          <div className="flex items-center gap-3">
            {!hasAdvancedModels || tier.eligibility.allowed ? (
              <ShieldCheck className="h-5 w-5 text-aurora-mint" />
            ) : (
              <Lock className="h-5 w-5 text-aurora-amber" />
            )}
            <div>
              <div className="font-display text-sm font-semibold">
                {!hasAdvancedModels
                  ? "Configured wallet model is live"
                  : tier.eligibility.allowed
                  ? "Advanced models unlocked"
                  : "Advanced models locked"}
              </div>
              <div className="text-xs text-moon-200/70">
                {basicModelCount} basic models available
                {hasAdvancedModels ? ` · ${advancedModelCount} advanced models` : ""}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
            {hasAdvancedModels ? (
              <>
                <Pill ok={tier.eligibility.hints.stakedYesterday} icon={<Coins className="h-3 w-3" />}>Rest stake</Pill>
                <Pill ok={tier.eligibility.hints.healthUploadedRecently} icon={<HeartPulse className="h-3 w-3" />}>Health 24h</Pill>
                <Pill ok={tier.eligibility.hints.deviceImportedThisWeek} icon={<Watch className="h-3 w-3" />}>Device 7d</Pill>
              </>
            ) : null}
            <Link href="/app/api-keys" className="btn-ghost text-xs" data-testid="dash-api-keys-link">
              <KeyRound className="h-3.5 w-3.5" /> Issue API key
            </Link>
          </div>
        </div>
      )}

      {/* Wallet stat row */}
      <div className="grid gap-4 md:grid-cols-4" data-testid="wallet-row">
        <StatCard
          label="Available credits"
          value={<span className="gradient-text">{formatCredits(wallet.availableCredits)}</span>}
          hint="Usable in Playground + Agent"
          accent="teal"
        />
        <StatCard
          label="Staked"
          value={formatCredits(wallet.stakedCredits)}
          hint={activeStake ? `Stake matures with rest window` : "No active stake"}
          accent="amber"
        />
        <StatCard
          label="Today earned"
          value={`+${formatCredits(wallet.todayEarned)}`}
          hint="Base · Sleep · Movement · Break · Curfew"
          accent="mint"
        />
        <StatCard
          label="Today spent"
          value={`−${formatCredits(wallet.todaySpent)}`}
          hint="Playground + Agent"
          accent="rose"
        />
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recovery */}
        <div className="glass-card p-6 lg:col-span-2">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <div className="stat-label">Recovery Score</div>
              <h2 className="mt-1 font-display text-2xl font-semibold">Today&apos;s recovery breakdown</h2>
            </div>
            <Link href="/app/recovery" className="text-xs text-aurora-teal hover:underline">
              View detail →
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div data-testid="recovery-ring">
              <ScoreRing score={recovery?.totalScore ?? 0} />
            </div>
            <div className="grid flex-1 grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Sub label="Sleep" value={recovery?.sleepScore ?? 0} bonus={recovery?.bonuses.sleepBonus ?? 0} accent="teal" />
              <Sub label="Movement" value={recovery?.movementScore ?? 0} bonus={recovery?.bonuses.movementBonus ?? 0} accent="mint" />
              <Sub label="Break" value={recovery?.breakScore ?? 0} bonus={recovery?.bonuses.breakBonus ?? 0} accent="violet" />
              <Sub label="AI Rhythm" value={recovery?.aiRhythmScore ?? 0} bonus={recovery?.bonuses.curfewBonus ?? 0} accent="rose" />
            </div>
          </div>

          <div className="divider my-5" />

          <div>
            <div className="stat-label">Quick health input</div>
            <div className="mt-2 flex flex-wrap gap-2" data-testid="presets">
              {(["well_rested", "average", "burned_out"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => applyPreset(p)}
                  className="btn-ghost text-xs"
                  data-testid={`preset-${p}`}
                >
                  {p === "well_rested" ? "Well rested" : p === "average" ? "Average" : "Burned out"}
                </button>
              ))}
              <Link href="/app/recovery" className="btn-ghost text-xs">
                Manual input <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Tonight card */}
        <div className="glass-card p-6">
          <div className="stat-label">Tonight&apos;s plan</div>
          <h3 className="mt-1 font-display text-xl font-semibold">Rest window</h3>
          <div className="mt-4 space-y-3 text-sm">
            <Row icon={<Moon className="h-4 w-4 text-aurora-violet" />} label="Window">
              {settings.restWindowStart} → {settings.restWindowEnd}
            </Row>
            <Row icon={<Sparkles className="h-4 w-4 text-aurora-teal" />} label="Manual allowance">
              {settings.manualUsageAllowance} cr
            </Row>
            <Row icon={<BotMessageSquare className="h-4 w-4 text-aurora-rose" />} label="Agent budget">
              {formatCredits(settings.agentBudget)} cr
            </Row>
            <Row icon={<Coins className="h-4 w-4 text-aurora-amber" />} label="Estimated reward">
              +{formatCredits(upcomingWindow.estimatedReward)} cr
            </Row>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <Link href="/app/curfew" className="btn-ghost text-sm">Adjust curfew</Link>
            <Link href="/app/staking" className="btn-primary text-sm">
              Activate Rest Stake <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Active stake */}
        <div className="glass-card p-6 lg:col-span-2">
          <div className="flex items-end justify-between">
            <div>
              <div className="stat-label">Active stake</div>
              <h3 className="mt-1 font-display text-xl font-semibold">Rest Stake</h3>
            </div>
            <Link href="/app/staking" className="text-xs text-aurora-teal hover:underline">Manage →</Link>
          </div>
          {activeStake ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Mini label="Principal" value={`${formatCredits(activeStake.stakeAmount)} cr`} />
              <Mini label="Yield rate" value={`${(activeStake.yieldRate * 100).toFixed(0)}%`} />
              <Mini label="Expected yield" value={`+${formatCredits(activeStake.expectedYield)} cr`} accent="mint" />
              <div className="md:col-span-3 rounded-xl border border-aurora-amber/20 bg-aurora-amber/5 p-3 text-xs text-moon-100/80">
                Condition · no manual AI use during rest window. Principal returns regardless.
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-sm text-moon-200/70">
              No active stake. <Link href="/app/staking" className="text-aurora-teal underline">Start one</Link> before bedtime to lock in tomorrow&apos;s yield.
            </div>
          )}
        </div>

        {/* Agent jobs */}
        <div className="glass-card p-6">
          <div className="flex items-end justify-between">
            <div>
              <div className="stat-label">Agent jobs</div>
              <h3 className="mt-1 font-display text-xl font-semibold">Scheduled tonight</h3>
            </div>
            <Link href="/app/agent" className="text-xs text-aurora-teal hover:underline">All →</Link>
          </div>
          <div className="mt-4 space-y-2">
            {agentJobs.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center text-sm text-moon-200/70">
                No jobs scheduled. <Link href="/app/agent" className="text-aurora-teal underline">Schedule one</Link>.
              </div>
            )}
            {agentJobs.map((j) => (
              <motion.div
                key={j.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-sm"
              >
                <div className="flex items-center justify-between text-xs text-moon-200/70">
                  <span>{j.taskType.replace("_", " ")}</span>
                  <span className={statusTone(j.status)}>{j.status}</span>
                </div>
                <div className="mt-1 truncate text-moon-100">{j.prompt.slice(0, 80)}</div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-moon-200/60">
                  <span>budget {formatCredits(j.maxBudget)} cr</span>
                  <span>{formatRelative(j.scheduledTime)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Hero CTA strip */}
      <div className="glass-card relative overflow-hidden p-6">
        <div className="absolute inset-0 moon-grad opacity-40" aria-hidden />
        <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="stat-label">Guided product path</div>
            <div className="mt-1 font-display text-xl font-semibold tracking-tight">
              Stake 20,000 · Schedule README agent · Start Rest Session
            </div>
            <p className="mt-1 text-sm text-moon-100/80">
              The wallet settles the curfew bonus, stake yield, and agent output into one morning balance.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/app/staking" className="btn-primary">
              <Coins className="h-4 w-4" /> Stake
            </Link>
            <Link href="/app/agent" className="btn-ghost">
              <BotMessageSquare className="h-4 w-4" /> Agent
            </Link>
            <button onClick={startDemoRest} className="btn-ghost">
              <PlayCircle className="h-4 w-4" /> Run session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sub({ label, value, bonus, accent }: { label: string; value: number; bonus: number; accent: "teal" | "mint" | "violet" | "rose" }) {
  const tone =
    accent === "teal" ? "text-aurora-teal" : accent === "mint" ? "text-aurora-mint" : accent === "violet" ? "text-aurora-violet" : "text-aurora-rose";
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <div className="text-[10px] uppercase tracking-[0.15em] text-moon-200/60">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 text-[11px] text-moon-200/70">+{formatCredits(bonus)} cr bonus</div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-moon-200/80">
        {icon} {label}
      </span>
      <span className="font-mono text-moon-50">{children}</span>
    </div>
  );
}

function Mini({ label, value, accent = "moon" }: { label: string; value: React.ReactNode; accent?: "moon" | "mint" }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <div className="stat-label">{label}</div>
      <div className={"mt-1 font-display text-xl font-semibold " + (accent === "mint" ? "text-aurora-mint" : "text-white")}>
        {value}
      </div>
    </div>
  );
}

function statusTone(status: string) {
  switch (status) {
    case "scheduled":
      return "text-aurora-amber";
    case "running":
      return "text-aurora-teal";
    case "completed":
      return "text-aurora-mint";
    case "failed":
      return "text-aurora-rose";
    default:
      return "text-moon-200/60";
  }
}

function Pill({ ok, icon, children }: { ok?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 " +
        (ok
          ? "border-aurora-mint/40 bg-aurora-mint/10 text-aurora-mint"
          : "border-aurora-amber/40 bg-aurora-amber/10 text-aurora-amber")
      }
    >
      {icon} {children}
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-white/5" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card h-28 animate-pulse" />
        ))}
      </div>
      <div className="glass-card h-72 animate-pulse" />
    </div>
  );
}
