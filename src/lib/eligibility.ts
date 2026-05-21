// Tier-gating logic — PRD §15 + new tier rules:
// Advanced models require yesterday's rest stake to be completed AND health
// data uploaded in the last 24 hours.

import { db, todayKey } from "./store";
import type { ModelTier } from "./providers";

export interface EligibilityCheck {
  allowed: boolean;
  reasons: string[];
  hints: { stakedYesterday: boolean; healthUploadedRecently: boolean; deviceImportedThisWeek: boolean };
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function eligibilityFor(userId: string): EligibilityCheck["hints"] {
  const now = Date.now();
  const yesterday = yesterdayKey();
  const yStart = new Date(yesterday).getTime();
  const yEnd = yStart + 86_400_000;

  const stakedYesterday = db().restStakes.some(
    (s) =>
      s.userId === userId &&
      (s.status === "completed" || s.status === "active") &&
      s.createdAt >= yStart && s.createdAt < yEnd + 86_400_000, // active stake from previous evening counts
  );

  const healthUploadedRecently = db().health.some(
    (h) =>
      h.userId === userId &&
      (h.date === todayKey() || h.date === yesterday) &&
      now - h.createdAt < 24 * 3_600_000,
  );

  const deviceImportedThisWeek = db().health.some(
    (h) =>
      h.userId === userId &&
      h.source === "device_import" &&
      now - h.createdAt < 7 * 86_400_000,
  );

  return { stakedYesterday, healthUploadedRecently, deviceImportedThisWeek };
}

export function canUseTier(userId: string, tier: ModelTier): EligibilityCheck {
  const hints = eligibilityFor(userId);
  if (tier === "basic") {
    return { allowed: true, reasons: [], hints };
  }
  const reasons: string[] = [];
  if (!hints.stakedYesterday) {
    reasons.push("Activate a Rest Stake last night to unlock advanced models.");
  }
  if (!hints.healthUploadedRecently) {
    reasons.push("Upload today's recovery data (manual input or device import).");
  }
  return { allowed: reasons.length === 0, reasons, hints };
}
