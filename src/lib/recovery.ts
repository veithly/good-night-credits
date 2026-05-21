// Recovery scoring — implements PRD §11.

import { clamp, hoursBetween } from "./utils";
import { LIMITS, addCredits, walletSnapshot } from "./credits";
import { db, getSettings, getStreakMultiplier, save, todayKey, uid } from "./store";
import type { HealthEntry, RecoveryScore, TokenEvent } from "./types";

interface Weights {
  sleep: number;
  movement: number;
  break: number;
  aiRhythm: number;
}

const WEIGHTS: Weights = { sleep: 0.35, movement: 0.2, break: 0.2, aiRhythm: 0.25 };

export function sleepScoreOf(h: HealthEntry): number {
  const { sleepDurationHours: dur, sleepQualityScore: qual } = h;
  let durationScore = 0;
  if (dur >= 7 && dur <= 9) durationScore = 100;
  else if (dur >= 6 && dur < 7) durationScore = 70;
  else if (dur > 9 && dur <= 9.5) durationScore = 95;
  else if (dur > 9.5) durationScore = 80; // diminishing returns past optimal
  else if (dur >= 5 && dur < 6) durationScore = 50;
  else durationScore = 30;
  const qualityScore = clamp(qual, 0, 100);
  return Math.round(durationScore * 0.6 + qualityScore * 0.4);
}

export function movementScoreOf(h: HealthEntry): number {
  const stepScore = Math.min(h.steps / 8000, 1) * 60;
  const activeScore = Math.min(h.activeMinutes / 30, 1) * 40;
  return Math.round(stepScore + activeScore);
}

export function breakScoreOf(h: HealthEntry): number {
  const countScore = Math.min(h.breakCount / 3, 1) * 50;
  const durationScore = Math.min(h.totalBreakMinutes / 45, 1) * 50;
  return Math.round(countScore + durationScore);
}

export interface AIRhythmContext {
  manualUsageInRest: number;
  agentUsageInRest: number;
  workHourUsageRatio: number; // 0–1; share of daily manual usage that landed in work hours
  weekendQuiet: boolean;
  curfewCompleted: boolean;
}

export function aiRhythmScoreOf(ctx: AIRhythmContext): number {
  const allowance = 500;
  const compliance =
    ctx.manualUsageInRest <= allowance ? 100 : ctx.manualUsageInRest <= 3000 ? 50 : 0;
  const workHour = Math.round(clamp(ctx.workHourUsageRatio, 0, 1) * 100);
  const weekend = ctx.weekendQuiet ? 100 : 60;
  const scheduled = ctx.curfewCompleted ? 100 : 70;
  return Math.round(
    compliance * 0.5 + workHour * 0.2 + weekend * 0.2 + scheduled * 0.1,
  );
}

export interface ComputedRecovery {
  sleepScore: number;
  movementScore: number;
  breakScore: number;
  aiRhythmScore: number;
  totalScore: number;
  bonuses: {
    sleepBonus: number;
    movementBonus: number;
    breakBonus: number;
    curfewBonus: number;
  };
}

export function computeRecovery(
  health: HealthEntry,
  rhythm: AIRhythmContext,
  restHours: number,
  streakMultiplier: number,
): ComputedRecovery {
  const sleepScore = sleepScoreOf(health);
  const movementScore = movementScoreOf(health);
  const breakScore = breakScoreOf(health);
  const aiRhythmScore = aiRhythmScoreOf(rhythm);
  const totalScore = Math.round(
    sleepScore * WEIGHTS.sleep +
      movementScore * WEIGHTS.movement +
      breakScore * WEIGHTS.break +
      aiRhythmScore * WEIGHTS.aiRhythm,
  );

  const sleepBonus = Math.round((sleepScore / 100) * LIMITS.sleepBonusMax);
  const movementBonus = Math.round((movementScore / 100) * LIMITS.movementBonusMax);
  const breakBonus = Math.round((breakScore / 100) * LIMITS.breakBonusMax);

  const complianceMultiplier =
    rhythm.manualUsageInRest <= 500 ? 1 : rhythm.manualUsageInRest <= 3000 ? 0.5 : 0;
  const baseCurfew = Math.min(restHours * 1000, LIMITS.curfewBonusMax);
  const curfewBonus = Math.round(baseCurfew * complianceMultiplier * streakMultiplier);

  return {
    sleepScore,
    movementScore,
    breakScore,
    aiRhythmScore,
    totalScore,
    bonuses: { sleepBonus, movementBonus, breakBonus, curfewBonus },
  };
}

export function rhythmContextFor(userId: string): AIRhythmContext {
  const today = todayKey();
  const startToday = new Date(today).getTime();
  const settings = getSettings(userId);
  const events: TokenEvent[] = db().tokenEvents.filter(
    (e) => e.userId === userId && e.timestamp >= startToday,
  );
  const inRest = events.filter((e) => e.isDuringRestWindow);
  const manualInRest = inRest
    .filter((e) => e.usageType === "manual")
    .reduce((a, b) => a + b.creditsUsed, 0);
  const agentInRest = inRest
    .filter((e) => e.usageType === "agent")
    .reduce((a, b) => a + b.creditsUsed, 0);
  const allManual = events.filter((e) => e.usageType === "manual");
  const workHourManual = allManual.filter((e) => {
    const h = new Date(e.timestamp).getHours();
    return h >= 9 && h < 19;
  });
  const workHourRatio = allManual.length === 0 ? 0.8 : workHourManual.length / allManual.length;
  const day = new Date().getDay();
  const isWeekend = day === 0 || day === 6;
  const weekendQuiet = isWeekend ? manualInRest <= 5000 : true;
  const curfewCompleted = manualInRest <= settings.manualUsageAllowance;
  return {
    manualUsageInRest: manualInRest,
    agentUsageInRest: agentInRest,
    workHourUsageRatio: workHourRatio,
    weekendQuiet,
    curfewCompleted,
  };
}

// Recompute the recovery row for `today` and emit the corresponding ledger bonuses
// for any portion not already granted today. Idempotent per (userId, date, bonusType).
export function recalculateRecovery(userId: string, date = todayKey()): RecoveryScore | null {
  const health = db().health.find((h) => h.userId === userId && h.date === date);
  if (!health) return null;
  const settings = getSettings(userId);
  const rhythm = rhythmContextFor(userId);
  const restHours = hoursBetween(settings.restWindowStart, settings.restWindowEnd);
  const streakMult = getStreakMultiplier(userId);
  const computed = computeRecovery(health, rhythm, restHours, streakMult);

  const existing = db().recovery.find((r) => r.userId === userId && r.date === date);
  const row: RecoveryScore = existing ?? {
    id: uid("rec"),
    userId,
    date,
    sleepScore: computed.sleepScore,
    movementScore: computed.movementScore,
    breakScore: computed.breakScore,
    aiRhythmScore: computed.aiRhythmScore,
    totalScore: computed.totalScore,
    bonuses: computed.bonuses,
    createdAt: Date.now(),
  };
  if (existing) {
    Object.assign(existing, computed, { totalScore: computed.totalScore, bonuses: computed.bonuses });
  } else {
    db().recovery.push(row);
  }
  save();
  return row;
}

// Issue health-derived bonuses for today, idempotent per (date, bonusType).
export function issueHealthBonuses(userId: string, date = todayKey()): { sleep: number; movement: number; brk: number } {
  const recovery = db().recovery.find((r) => r.userId === userId && r.date === date);
  if (!recovery) return { sleep: 0, movement: 0, brk: 0 };
  const dayStart = new Date(date).getTime();
  const already = db().ledger.filter((t) => t.userId === userId && t.createdAt >= dayStart);
  function granted(type: string) {
    return already.find((t) => t.type === type);
  }
  let sleep = 0, movement = 0, brk = 0;
  if (!granted("sleep_bonus") && recovery.bonuses.sleepBonus > 0) {
    addCredits({ userId, amount: recovery.bonuses.sleepBonus, type: "sleep_bonus", reason: `Sleep score ${recovery.sleepScore}` });
    sleep = recovery.bonuses.sleepBonus;
  }
  if (!granted("movement_bonus") && recovery.bonuses.movementBonus > 0) {
    addCredits({ userId, amount: recovery.bonuses.movementBonus, type: "movement_bonus", reason: `Movement score ${recovery.movementScore}` });
    movement = recovery.bonuses.movementBonus;
  }
  if (!granted("break_bonus") && recovery.bonuses.breakBonus > 0) {
    addCredits({ userId, amount: recovery.bonuses.breakBonus, type: "break_bonus", reason: `Break score ${recovery.breakScore}` });
    brk = recovery.bonuses.breakBonus;
  }
  // touch snapshot to refresh.
  walletSnapshot(userId);
  return { sleep, movement, brk };
}
