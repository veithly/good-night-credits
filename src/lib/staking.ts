// Rest Staking — PRD §20.2.

import { addCredits, availableBalance, LIMITS } from "./credits";
import { db, save, uid } from "./store";
import type { RestStake } from "./types";

export interface CreateStakeArgs {
  userId: string;
  restWindowId: string;
  stakeAmount: number;
  yieldRate?: number;
  durationHours?: number;
}

export function getActiveStake(userId: string): RestStake | null {
  return (
    db().restStakes.find((s) => s.userId === userId && s.status === "active") ?? null
  );
}

export function createStake(args: CreateStakeArgs): RestStake {
  const balance = availableBalance(args.userId);
  if (args.stakeAmount <= 0) throw new Error("stake_amount must be > 0");
  if (args.stakeAmount > balance) throw new Error("insufficient_available_credits");

  const yieldRate = args.yieldRate ?? 0.2;
  const expectedYield = Math.min(args.stakeAmount * yieldRate, LIMITS.stakingYieldMax);

  const stake: RestStake = {
    id: uid("stk"),
    userId: args.userId,
    restWindowId: args.restWindowId,
    stakeAmount: args.stakeAmount,
    yieldRate,
    expectedYield,
    actualYield: 0,
    status: "active",
    emergencyUnlocked: false,
    createdAt: Date.now(),
  };
  db().restStakes.push(stake);
  save();

  addCredits({
    userId: args.userId,
    amount: -args.stakeAmount,
    type: "staking_lock",
    reason: `Stake ${args.stakeAmount} credits for rest window`,
    relatedEntityType: "rest_stake",
    relatedEntityId: stake.id,
  });

  return stake;
}

export function emergencyUnlock(userId: string, stakeId: string): RestStake | null {
  const stake = db().restStakes.find((s) => s.id === stakeId && s.userId === userId);
  if (!stake || stake.status !== "active") return null;
  stake.status = "unlocked";
  stake.emergencyUnlocked = true;
  stake.completedAt = Date.now();
  save();
  addCredits({
    userId,
    amount: stake.stakeAmount,
    type: "staking_return",
    reason: "Emergency unlock — principal returned",
    relatedEntityType: "rest_stake",
    relatedEntityId: stake.id,
  });
  return stake;
}

export function settleStakeForWindow(userId: string, restWindowId: string, complianceMultiplier: number) {
  const stake = db().restStakes.find(
    (s) => s.userId === userId && s.restWindowId === restWindowId && s.status === "active",
  );
  if (!stake) return;

  // Always return principal.
  addCredits({
    userId,
    amount: stake.stakeAmount,
    type: "staking_return",
    reason: "Rest stake principal returned",
    relatedEntityType: "rest_stake",
    relatedEntityId: stake.id,
  });

  if (complianceMultiplier === 1 && !stake.emergencyUnlocked) {
    const yieldAmount = Math.min(
      Math.floor(stake.stakeAmount * stake.yieldRate),
      LIMITS.stakingYieldMax,
    );
    addCredits({
      userId,
      amount: yieldAmount,
      type: "staking_yield",
      reason: `Rest Stake yield (×${stake.yieldRate.toFixed(2)})`,
      relatedEntityType: "rest_stake",
      relatedEntityId: stake.id,
    });
    stake.actualYield = yieldAmount;
    stake.status = "completed";
  } else {
    stake.actualYield = 0;
    stake.status = "broken";
  }
  stake.completedAt = Date.now();
  save();
}
