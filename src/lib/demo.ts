// Demo Mode helpers + seed data. The seed runs at process boot so the
// dashboard is never empty when a judge clicks Try the demo.

import { addCredits, availableBalance, LIMITS } from "./credits";
import { db, getSettings, save, todayKey, uid } from "./store";
import { issueHealthBonuses, recalculateRecovery } from "./recovery";
import { ensureUpcomingWindow } from "./rest-window";
import { createAgentJob } from "./playground";
import type { HealthEntry, User } from "./types";

export const DEMO_USER_ID = "user_demo_alex";
const SEEDED_FLAG = "demo_v1";

export function seedDemoIfNeeded(): User {
  const existing = db().users.find((u) => u.id === DEMO_USER_ID);
  if (existing && db().meta.seeded) return existing;

  const user: User = existing ?? {
    id: DEMO_USER_ID,
    email: "alex@goodnight.dev",
    username: "Alex",
    timezone: "Asia/Shanghai",
    createdAt: Date.now() - 3 * 86_400_000,
  };
  if (!existing) db().users.push(user);

  // Settings.
  const settings = getSettings(user.id);
  settings.demoModeEnabled = true;
  settings.restWindowStart = "23:30";
  settings.restWindowEnd = "07:30";
  save();

  // Base allowance + a couple of yesterday's bonuses for visual texture.
  if (availableBalance(user.id) === 0) {
    addCredits({
      userId: user.id,
      amount: LIMITS.baseDaily,
      type: "base_grant",
      reason: "Welcome — base daily allowance",
    });
    addCredits({
      userId: user.id,
      amount: 8000,
      type: "sleep_bonus",
      reason: "Sleep score 88 (last night)",
    });
    addCredits({
      userId: user.id,
      amount: 2880,
      type: "movement_bonus",
      reason: "Movement score 72 (yesterday)",
    });
    addCredits({
      userId: user.id,
      amount: 2280,
      type: "break_bonus",
      reason: "Break score 76 (yesterday)",
    });
    addCredits({
      userId: user.id,
      amount: 12000,
      type: "curfew_bonus",
      reason: "Compute Curfew completed (×1.10 streak)",
    });
    // A bit of usage to populate the wallet history.
    addCredits({
      userId: user.id,
      amount: -2400,
      type: "manual_usage",
      reason: "Playground · Generate README",
    });
    addCredits({
      userId: user.id,
      amount: -5200,
      type: "manual_usage",
      reason: "Playground · Generate Pitch",
    });
  }

  // Streak baseline.
  const streak = db().meta.streak.find((s) => s.userId === user.id);
  if (!streak) {
    db().meta.streak.push({
      userId: user.id,
      count: 3,
      lastDate: todayKey(),
    });
  }

  // Today's health snapshot — well-rested preset.
  if (!db().health.find((h) => h.userId === user.id && h.date === todayKey())) {
    const h: HealthEntry = {
      id: uid("h"),
      userId: user.id,
      date: todayKey(),
      sleepDurationHours: 7.8,
      sleepQualityScore: 86,
      steps: 8200,
      activeMinutes: 34,
      breakCount: 3,
      totalBreakMinutes: 48,
      source: "demo",
      createdAt: Date.now(),
    };
    db().health.push(h);
    save();
    recalculateRecovery(user.id);
    issueHealthBonuses(user.id);
  }

  // An upcoming window so the dashboard always has a target.
  ensureUpcomingWindow(user.id);

  // A scheduled agent job for tonight.
  const upcoming = db().restWindows.find(
    (w) => w.userId === user.id && (w.status === "scheduled" || w.status === "active"),
  );
  if (upcoming && !db().agentJobs.find((j) => j.userId === user.id && j.status === "scheduled")) {
    createAgentJob({
      userId: user.id,
      taskType: "generate_readme",
      prompt:
        "Generate a polished README for Good Night Credits, including a hero block, quickstart, architecture summary, and product credits.",
      scheduledTime: upcoming.startTime + 90 * 60_000,
      maxBudget: 8000,
    });
  }

  // Leave the staking card empty so the walkthrough can stake 20,000 on stage.
  // (Earlier prototypes pre-seeded an active stake, but that disabled the
  // "Activate Rest Stake" button during recording because no headroom was left.)

  db().meta.seeded = true;
  void SEEDED_FLAG;
  save();
  return user;
}

// Demo Mode time compression: 8 h rest window ≈ 45 s on stage.
export const DEMO_REST_COMPRESS_MS = 45_000;

export const DEMO_PRESETS = {
  well_rested: {
    sleepDurationHours: 7.8,
    sleepQualityScore: 86,
    steps: 9200,
    activeMinutes: 38,
    breakCount: 3,
    totalBreakMinutes: 52,
    label: "Well rested",
  },
  average: {
    sleepDurationHours: 6.5,
    sleepQualityScore: 70,
    steps: 5500,
    activeMinutes: 22,
    breakCount: 2,
    totalBreakMinutes: 28,
    label: "Average",
  },
  burned_out: {
    sleepDurationHours: 4.5,
    sleepQualityScore: 48,
    steps: 2400,
    activeMinutes: 9,
    breakCount: 1,
    totalBreakMinutes: 12,
    label: "Burned out",
  },
} as const;

export type DemoPresetKey = keyof typeof DEMO_PRESETS;
