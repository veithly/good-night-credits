// Aggregator for the dashboard / dashboard-related API routes.

import { LIMITS, walletSnapshot } from "./credits";
import { db, getSettings, getStreak, todayKey } from "./store";
import { ensureUpcomingWindow } from "./rest-window";
import { getActiveStake } from "./staking";
import { hoursBetween } from "./utils";
import { DEMO_USER_ID, seedDemoIfNeeded } from "./demo";
import type { DashboardSnapshot, User } from "./types";

export function currentUser(): User {
  return seedDemoIfNeeded();
}

export function snapshotFor(userId = DEMO_USER_ID): DashboardSnapshot {
  const user = db().users.find((u) => u.id === userId) ?? currentUser();
  const settings = getSettings(userId);
  const wallet = walletSnapshot(userId);
  const today = todayKey();
  const recovery = db().recovery.find((r) => r.userId === userId && r.date === today) ?? null;
  const todayHealth = db().health.find((h) => h.userId === userId && h.date === today) ?? null;
  const upcoming = ensureUpcomingWindow(userId);
  const restHours = hoursBetween(settings.restWindowStart, settings.restWindowEnd);
  const estimatedReward = Math.min(restHours * 1000, LIMITS.curfewBonusMax);
  const activeStake = getActiveStake(userId);
  const agentJobs = db()
    .agentJobs.filter((j) => j.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);
  const streak = getStreak(userId);
  return {
    user,
    settings,
    wallet,
    recovery,
    todayHealth,
    activeStake,
    upcomingWindow: { start: upcoming.startTime, end: upcoming.endTime, estimatedReward },
    streakDays: streak.count,
    agentJobs,
  };
}
