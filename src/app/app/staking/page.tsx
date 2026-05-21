"use client";

import { useEffect, useState } from "react";
import { useApp } from "../../providers";
import { formatCredits } from "@/lib/utils";
import { Coins, Unlock, History } from "lucide-react";
import type { RestStake } from "@/lib/types";

export default function StakingPage() {
  const { snapshot, refresh, toast } = useApp();
  const [amount, setAmount] = useState(20000);
  const [rate, setRate] = useState(0.2);
  const [history, setHistory] = useState<RestStake[]>([]);
  const [active, setActive] = useState<RestStake | null>(null);

  async function load() {
    const r = await fetch("/api/staking", { cache: "no-store" });
    const j = await r.json();
    setActive(j.active);
    setHistory(j.history);
  }
  useEffect(() => {
    load();
  }, []);

  async function stake() {
    const r = await fetch("/api/staking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", stake_amount: amount, yield_rate: rate }),
    });
    const j = await r.json();
    if (!r.ok) {
      toast({ title: "Could not stake", body: j.error, tone: "danger" });
      return;
    }
    toast({
      title: "Stake activated",
      body: `Locked ${formatCredits(amount)} cr · Expected yield +${formatCredits(j.stake.expectedYield)}`,
      tone: "success",
    });
    load();
    refresh();
  }

  async function unlock() {
    await fetch("/api/staking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "emergency_unlock" }),
    });
    toast({ title: "Emergency unlock", body: "Principal returned. Yield forfeit.", tone: "info" });
    load();
    refresh();
  }

  const available = snapshot?.wallet.availableCredits ?? 0;
  const expectedYield = Math.min(Math.floor(amount * rate), 10000);

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-[0.18em] text-moon-200/70">Rest Staking</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Lock credits while you sleep.</h1>
        <p className="mt-1 max-w-2xl text-sm text-moon-200/70">
          Stake unused credits during your rest window. Don&apos;t touch manual AI until morning — wake up with a bonus yield. Principal is always returned.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass-card p-6 lg:col-span-2">
          <div className="flex items-end justify-between">
            <div>
              <div className="stat-label">Create stake</div>
              <h2 className="mt-1 font-display text-xl font-semibold">Tonight&apos;s position</h2>
            </div>
            <div className="text-xs text-moon-200/70">
              Available: <span className="font-mono text-moon-50">{formatCredits(available)}</span>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="label">Stake amount</span>
              <input
                data-testid="stake-amount"
                type="number"
                className="input mt-1"
                min={0}
                max={available}
                value={amount}
                onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
              />
              <input
                type="range"
                min={0}
                max={Math.max(available, 1)}
                value={amount}
                onChange={(e) => setAmount(parseInt(e.target.value))}
                className="mt-2 w-full accent-aurora-teal"
              />
            </label>
            <label className="block">
              <span className="label">Yield rate</span>
              <select
                className="input mt-1"
                value={String(rate)}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                data-testid="stake-rate"
              >
                <option value="0.05">4 h · 5%</option>
                <option value="0.1">6 h · 10%</option>
                <option value="0.2">8 h · 20% (recommended)</option>
                <option value="0.25">Weekend · 25%</option>
              </select>
              <p className="mt-2 text-xs text-moon-200/60">
                Yield is capped at 10,000 credits per day.
              </p>
            </label>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
            <Stat label="Principal" value={`${formatCredits(amount)} cr`} />
            <Stat label="Yield rate" value={`${(rate * 100).toFixed(0)}%`} />
            <Stat label="Expected yield" value={`+${formatCredits(expectedYield)} cr`} accent="mint" />
          </div>

          <div className="mt-5 rounded-xl border border-aurora-amber/20 bg-aurora-amber/5 p-3 text-xs text-moon-100/80">
            <strong className="text-aurora-amber">Conditions.</strong> No manual AI usage during the rest window.
            Scheduled agent jobs under your agent budget are allowed.
            Emergency unlock returns principal but cancels yield.
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={stake}
              disabled={amount <= 0 || amount > available}
              className="btn-primary"
              data-testid="cta-stake"
            >
              <Coins className="h-4 w-4" /> Activate Rest Stake
            </button>
            <button
              onClick={unlock}
              disabled={!active}
              className="btn-danger"
              data-testid="cta-unlock"
            >
              <Unlock className="h-4 w-4" /> Emergency Unlock
            </button>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="stat-label">Active stake</div>
          {active ? (
            <div className="mt-3 space-y-2 text-sm">
              <Row label="Principal" value={`${formatCredits(active.stakeAmount)} cr`} />
              <Row label="Rate" value={`${(active.yieldRate * 100).toFixed(0)}%`} />
              <Row label="Expected yield" value={`+${formatCredits(active.expectedYield)} cr`} />
              <Row label="Status" value={active.status} />
            </div>
          ) : (
            <div className="mt-3 text-sm text-moon-200/70">No active stake.</div>
          )}
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="mb-3 flex items-center gap-2 text-sm">
          <History className="h-4 w-4 text-moon-200/70" /> History
        </div>
        <div className="space-y-2">
          {history.map((s) => (
            <div key={s.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-moon-200/80">{new Date(s.createdAt).toLocaleString()}</span>
                <span
                  className={
                    s.status === "completed" ? "text-aurora-mint" :
                    s.status === "broken" ? "text-aurora-rose" :
                    s.status === "unlocked" ? "text-aurora-amber" :
                    "text-aurora-teal"
                  }
                >
                  {s.status}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-3 text-xs text-moon-200/80">
                <span>Principal {formatCredits(s.stakeAmount)} cr</span>
                <span>Rate {(s.yieldRate * 100).toFixed(0)}%</span>
                <span className="text-right text-aurora-mint">Yield +{formatCredits(s.actualYield)} cr</span>
              </div>
            </div>
          ))}
          {history.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-moon-200/60">
              No stakes yet. Stake before your rest window to lock in tomorrow&apos;s yield.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "moon" }: { label: string; value: React.ReactNode; accent?: "moon" | "mint" }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <div className="stat-label">{label}</div>
      <div className={"mt-1 font-display text-lg " + (accent === "mint" ? "text-aurora-mint" : "text-white")}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-moon-200/80">{label}</span>
      <span className="font-mono text-moon-50">{value}</span>
    </div>
  );
}
