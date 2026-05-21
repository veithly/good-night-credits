// Credits engine — single source of truth for every wallet mutation.
// Every entry MUST go through `addCredits` so balance + ledger stay in sync.

import { db, save, uid } from "./store";
import type { CreditTx, CreditTxType, WalletSnapshot } from "./types";

export const LIMITS = {
  dailyMax: 50_000,
  weeklyMax: 250_000,
  baseDaily: 10_000,
  curfewBonusMax: 12_000,
  sleepBonusMax: 8_000,
  movementBonusMax: 4_000,
  breakBonusMax: 3_000,
  stakingYieldMax: 10_000,
} as const;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function startOfWeek(ts: number): number {
  const d = new Date(ts);
  const day = d.getDay() || 7; // Mon = 1, Sun = 7
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (day - 1));
  return d.getTime();
}

export function availableBalance(userId: string): number {
  const txs = db().ledger.filter((t) => t.userId === userId);
  // Available = sum of all non-staking-lock entries minus active staking locks.
  return txs.reduce((acc, t) => acc + t.amount, 0);
}

export function stakedBalance(userId: string): number {
  const stakes = db().restStakes.filter((s) => s.userId === userId && s.status === "active");
  return stakes.reduce((acc, s) => acc + s.stakeAmount, 0);
}

export function todayEarned(userId: string): number {
  const dayStart = startOfDay(Date.now());
  return db()
    .ledger.filter((t) => t.userId === userId && t.createdAt >= dayStart && t.amount > 0 && t.type !== "staking_return")
    .reduce((acc, t) => acc + t.amount, 0);
}

export function todaySpent(userId: string): number {
  const dayStart = startOfDay(Date.now());
  return Math.abs(
    db()
      .ledger.filter((t) => t.userId === userId && t.createdAt >= dayStart && t.amount < 0 && t.type !== "staking_lock")
      .reduce((acc, t) => acc + t.amount, 0),
  );
}

export function weeklyCapRemaining(userId: string): number {
  const weekStart = startOfWeek(Date.now());
  const earned = db()
    .ledger.filter(
      (t) =>
        t.userId === userId &&
        t.createdAt >= weekStart &&
        t.amount > 0 &&
        ["base_grant", "sleep_bonus", "movement_bonus", "break_bonus", "curfew_bonus", "staking_yield", "weekend_yield"].includes(t.type),
    )
    .reduce((acc, t) => acc + t.amount, 0);
  return Math.max(0, LIMITS.weeklyMax - earned);
}

export function walletSnapshot(userId: string): WalletSnapshot {
  return {
    availableCredits: availableBalance(userId),
    stakedCredits: stakedBalance(userId),
    todayEarned: todayEarned(userId),
    todaySpent: todaySpent(userId),
    weeklyCapRemaining: weeklyCapRemaining(userId),
  };
}

export interface AddCreditsArgs {
  userId: string;
  amount: number; // positive = earn, negative = spend
  type: CreditTxType;
  reason: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  bypassCap?: boolean;
}

export function addCredits(args: AddCreditsArgs): CreditTx {
  let amount = args.amount;

  if (amount > 0 && !args.bypassCap) {
    const remaining = weeklyCapRemaining(args.userId);
    if (remaining <= 0 && ["sleep_bonus", "movement_bonus", "break_bonus", "curfew_bonus", "staking_yield", "weekend_yield"].includes(args.type)) {
      amount = 0;
    } else if (remaining < amount && ["sleep_bonus", "movement_bonus", "break_bonus", "curfew_bonus", "staking_yield", "weekend_yield"].includes(args.type)) {
      amount = remaining;
    }
  }

  const balanceAfter = availableBalance(args.userId) + amount;
  const tx: CreditTx = {
    id: uid("tx"),
    userId: args.userId,
    amount,
    type: args.type,
    reason: args.reason,
    relatedEntityType: args.relatedEntityType,
    relatedEntityId: args.relatedEntityId,
    balanceAfter,
    createdAt: Date.now(),
  };
  db().ledger.push(tx);
  save();
  return tx;
}

export function recentLedger(userId: string, limit = 40): CreditTx[] {
  return db()
    .ledger.filter((t) => t.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

// Grant the daily base allowance idempotently — only once per local day.
export function grantDailyBase(userId: string): CreditTx | null {
  const dayStart = startOfDay(Date.now());
  const already = db().ledger.find(
    (t) => t.userId === userId && t.type === "base_grant" && t.createdAt >= dayStart,
  );
  if (already) return null;
  return addCredits({
    userId,
    amount: LIMITS.baseDaily,
    type: "base_grant",
    reason: "Base daily allowance",
  });
}

// ─── Pricing — fixed tier ladder for Playground ────────────────────────────

export const PLAYGROUND_PRICING = {
  generate_readme: { credits: 2400, label: "Generate README", size: "small" as const },
  generate_pitch: { credits: 5200, label: "Generate Launch Pitch", size: "medium" as const },
  review_code: { credits: 3400, label: "Review My Code", size: "small" as const },
  plan_agent_tasks: { credits: 4800, label: "Plan Agent Tasks", size: "medium" as const },
} as const;

export type PlaygroundTool = keyof typeof PLAYGROUND_PRICING;
