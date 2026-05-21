// Rest Window + Compute Curfew settlement — PRD §20.1.

import { addCredits, LIMITS } from "./credits";
import { bumpStreak, db, getSettings, getStreakMultiplier, save, uid } from "./store";
import { nextWindowAt, within } from "./utils";
import { settleStakeForWindow } from "./staking";
import type { RestWindow, RestWindowStatus } from "./types";

export function ensureUpcomingWindow(userId: string): RestWindow {
  const settings = getSettings(userId);
  const now = new Date();
  const existing = db().restWindows.find(
    (w) => w.userId === userId && (w.status === "scheduled" || w.status === "active"),
  );
  if (existing) return existing;
  const { start, end } = nextWindowAt(now, settings.restWindowStart, settings.restWindowEnd);
  const w: RestWindow = {
    id: uid("rw"),
    userId,
    startTime: start.getTime(),
    endTime: end.getTime(),
    status: "scheduled",
    manualTokensUsed: 0,
    agentTokensUsed: 0,
    rewardEarned: 0,
    complianceMultiplier: 0,
    streakCountAtCompletion: 0,
  };
  db().restWindows.push(w);
  save();
  return w;
}

export function activeWindow(userId: string): RestWindow | null {
  return (
    db().restWindows.find((w) => w.userId === userId && w.status === "active") ?? null
  );
}

export function isInsideRestWindow(userId: string, when = Date.now()): boolean {
  const active = activeWindow(userId);
  if (active && when >= active.startTime && when < active.endTime) return true;
  const settings = getSettings(userId);
  return within(new Date(when), settings.restWindowStart, settings.restWindowEnd);
}

export function startWindow(userId: string, durationMs?: number): RestWindow {
  const settings = getSettings(userId);
  const target = ensureUpcomingWindow(userId);
  target.status = "active";
  target.startTime = Date.now();
  if (durationMs) target.endTime = target.startTime + durationMs;
  save();
  // touch settings to avoid unused warning
  void settings;
  return target;
}

export function settleWindow(userId: string, windowId?: string): RestWindow | null {
  const win = windowId
    ? db().restWindows.find((w) => w.id === windowId && w.userId === userId)
    : activeWindow(userId);
  if (!win) return null;
  const events = db().tokenEvents.filter(
    (e) => e.userId === userId && e.timestamp >= win.startTime && e.timestamp <= Date.now(),
  );
  const manualUsage = events
    .filter((e) => e.usageType === "manual")
    .reduce((a, b) => a + b.creditsUsed, 0);
  const agentUsage = events
    .filter((e) => e.usageType === "agent")
    .reduce((a, b) => a + b.creditsUsed, 0);

  const complianceMultiplier =
    manualUsage <= 500 ? 1 : manualUsage <= 3000 ? 0.5 : 0;
  const restHours = (win.endTime - win.startTime) / 3_600_000;
  const base = Math.min(restHours * 1000, LIMITS.curfewBonusMax);
  const streakMult = getStreakMultiplier(userId);
  const reward = Math.floor(base * complianceMultiplier * streakMult);

  const finalStatus: RestWindowStatus = complianceMultiplier > 0 ? "completed" : "broken";
  win.status = finalStatus;
  win.endTime = Date.now();
  win.manualTokensUsed = manualUsage;
  win.agentTokensUsed = agentUsage;
  win.rewardEarned = reward;
  win.complianceMultiplier = complianceMultiplier;
  save();

  if (reward > 0) {
    addCredits({
      userId,
      amount: reward,
      type: "curfew_bonus",
      reason: `Compute Curfew completed (×${streakMult.toFixed(2)} streak)`,
      relatedEntityType: "rest_window",
      relatedEntityId: win.id,
    });
    bumpStreak(userId, new Date(win.endTime).toISOString().slice(0, 10));
    win.streakCountAtCompletion = (db().meta.streak.find((s) => s.userId === userId)?.count) ?? 0;
    save();
  }

  // Stake settlement.
  settleStakeForWindow(userId, win.id, complianceMultiplier);

  return win;
}

export function cancelWindow(userId: string, windowId: string) {
  const win = db().restWindows.find((w) => w.id === windowId && w.userId === userId);
  if (!win) return;
  win.status = "cancelled";
  save();
}
