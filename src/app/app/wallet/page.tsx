"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { formatCredits, formatRelative } from "@/lib/utils";
import type { CreditTx, WalletSnapshot } from "@/lib/types";
import { ArrowUpRight, ArrowDownRight, Lock, Repeat2, Sparkles } from "lucide-react";

const TYPE_LABEL: Record<string, { label: string; tone: "earn" | "spend" | "stake" | "info" }> = {
  base_grant: { label: "Base allowance", tone: "earn" },
  sleep_bonus: { label: "Sleep bonus", tone: "earn" },
  movement_bonus: { label: "Movement bonus", tone: "earn" },
  break_bonus: { label: "Break bonus", tone: "earn" },
  curfew_bonus: { label: "Compute Curfew bonus", tone: "earn" },
  staking_yield: { label: "Stake yield", tone: "earn" },
  weekend_yield: { label: "Weekend yield", tone: "earn" },
  manual_usage: { label: "Playground usage", tone: "spend" },
  agent_usage: { label: "Agent usage", tone: "spend" },
  staking_lock: { label: "Stake locked", tone: "stake" },
  staking_return: { label: "Stake returned", tone: "info" },
  system_adjustment: { label: "System adjustment", tone: "info" },
};

export default function WalletPage() {
  const [snap, setSnap] = useState<WalletSnapshot | null>(null);
  const [ledger, setLedger] = useState<CreditTx[]>([]);
  const [filter, setFilter] = useState<"all" | "earn" | "spend">("all");

  async function load() {
    const r = await fetch("/api/wallet", { cache: "no-store" });
    const j = await r.json();
    setSnap(j.snapshot);
    setLedger(j.ledger);
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = ledger.filter((t) => {
    if (filter === "earn") return t.amount > 0;
    if (filter === "spend") return t.amount < 0;
    return true;
  });

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-[0.18em] text-moon-200/70">Compute Wallet</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Where every credit comes from.</h1>
        <p className="mt-1 max-w-2xl text-sm text-moon-200/70">
          Each line below ties back to a behaviour or AI action. Credits can&apos;t be withdrawn — they only buy AI compute inside Good Night Credits.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-5">
        <StatCard label="Available" value={formatCredits(snap?.availableCredits ?? 0)} accent="teal" />
        <StatCard label="Staked" value={formatCredits(snap?.stakedCredits ?? 0)} accent="amber" />
        <StatCard label="Today earned" value={`+${formatCredits(snap?.todayEarned ?? 0)}`} accent="mint" />
        <StatCard label="Today spent" value={`−${formatCredits(snap?.todaySpent ?? 0)}`} accent="rose" />
        <StatCard label="Weekly cap remaining" value={formatCredits(snap?.weeklyCapRemaining ?? 0)} accent="violet" />
      </div>

      <div className="glass-card p-6" data-testid="wallet-ledger">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="stat-label">Ledger</div>
            <h2 className="mt-1 font-display text-xl font-semibold">Recent transactions</h2>
          </div>
          <div className="flex gap-1">
            {(["all", "earn", "spend"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                data-testid={`wallet-filter-${f}`}
                className={
                  "rounded-full px-3 py-1 text-xs " +
                  (filter === f ? "bg-white/10 text-white" : "text-moon-200/70 hover:bg-white/5")
                }
              >
                {f === "all" ? "All" : f === "earn" ? "Earned" : "Spent"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-moon-200/60">
              No transactions yet.
            </div>
          )}
          {filtered.map((tx) => {
            const meta = TYPE_LABEL[tx.type] ?? { label: tx.type, tone: "info" as const };
            const Icon =
              meta.tone === "earn" ? ArrowUpRight :
              meta.tone === "spend" ? ArrowDownRight :
              meta.tone === "stake" ? Lock :
              Repeat2;
            const tone =
              meta.tone === "earn" ? "text-aurora-mint" :
              meta.tone === "spend" ? "text-aurora-rose" :
              meta.tone === "stake" ? "text-aurora-amber" :
              "text-moon-100";
            return (
              <div key={tx.id} className="ledger-row" data-testid={`tx-${tx.type}`}>
                <div className="col-span-1 flex items-center gap-2">
                  <div className={`grid h-7 w-7 place-items-center rounded-full bg-white/[0.04] ${tone}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                </div>
                <div className="col-span-6 truncate">
                  <div className="text-sm text-moon-50">{meta.label}</div>
                  <div className="text-[11px] text-moon-200/60">{tx.reason}</div>
                </div>
                <div className={`col-span-2 text-right font-mono text-sm ${tone}`}>
                  {tx.amount > 0 ? "+" : ""}
                  {formatCredits(tx.amount)}
                </div>
                <div className="col-span-2 text-right font-mono text-xs text-moon-200/70">
                  {formatCredits(tx.balanceAfter)} bal
                </div>
                <div className="col-span-1 hidden text-right text-[11px] text-moon-200/60 md:block">
                  {formatRelative(tx.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-1 h-4 w-4 text-aurora-teal" />
          <div>
            <div className="text-sm font-semibold">Credits cannot be withdrawn.</div>
            <p className="mt-1 text-xs text-moon-200/70">
              Good Night Credits only spends credits inside the platform — Playground, Agent, and the API Gateway.
              No real money, no off-ramp.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
