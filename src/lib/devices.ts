// Device data importers. Accepts CSV or JSON exports from popular wearables
// and projects them into the HealthEntry shape. MVP-grade: we don't try to
// reconstruct minute-level data, just derive yesterday's daily summary.

import { db, save, todayKey, uid } from "./store";
import { issueHealthBonuses, recalculateRecovery } from "./recovery";
import type { HealthEntry } from "./types";

export type DeviceSource = "apple_health" | "fitbit" | "oura" | "google_fit" | "csv";

export interface ParseResult {
  source: DeviceSource;
  date: string;
  entry: Omit<HealthEntry, "id" | "userId" | "createdAt" | "source"> & { source: HealthEntry["source"] };
  rowsRead: number;
  filename: string;
  bytes: number;
}

interface AppleRecord {
  type?: string;
  startDate?: string;
  endDate?: string;
  value?: number | string;
  unit?: string;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (c === "," && !inQuote) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function detect(filename: string, text: string): DeviceSource {
  const f = filename.toLowerCase();
  if (f.includes("apple") || f.includes("export.xml") || text.includes("HKQuantityTypeIdentifier")) return "apple_health";
  if (f.includes("fitbit") || text.toLowerCase().includes("fitbit")) return "fitbit";
  if (f.includes("oura")) return "oura";
  if (f.includes("google_fit") || text.includes("com.google.")) return "google_fit";
  return "csv";
}

function detectFromJson(json: unknown, filename: string): DeviceSource {
  const f = filename.toLowerCase();
  if (f.includes("oura") || (typeof json === "object" && json && "sleep" in (json as object) && Array.isArray((json as { sleep?: unknown[] }).sleep))) return "oura";
  if (f.includes("apple")) return "apple_health";
  if (f.includes("fitbit")) return "fitbit";
  if (f.includes("google_fit")) return "google_fit";
  return "csv";
}

interface OuraSleepRow {
  bedtime_start?: string;
  bedtime_end?: string;
  duration?: number;
  total?: number;
  score?: number;
  efficiency?: number;
  summary_date?: string;
}

interface OuraActivityRow {
  summary_date?: string;
  steps?: number;
  active?: number;
  high?: number;
  medium?: number;
  daily_movement?: number;
}

interface OuraExport {
  sleep?: OuraSleepRow[];
  activity?: OuraActivityRow[];
}

function parseOuraJson(j: OuraExport): Pick<HealthEntry, "sleepDurationHours" | "sleepQualityScore" | "steps" | "activeMinutes" | "breakCount" | "totalBreakMinutes"> & { date: string } {
  const sleep = (j.sleep ?? [])[0] ?? {};
  const activity = (j.activity ?? [])[0] ?? {};
  const durationSec = num(sleep.total ?? sleep.duration);
  return {
    date: sleep.summary_date ?? activity.summary_date ?? todayKey(),
    sleepDurationHours: durationSec ? durationSec / 3600 : 7.5,
    sleepQualityScore: num(sleep.score ?? sleep.efficiency, 80),
    steps: num(activity.steps, 5000),
    activeMinutes: num(activity.medium) + num(activity.high) || 25,
    breakCount: 3,
    totalBreakMinutes: 45,
  };
}

interface AppleHealthExport {
  records?: AppleRecord[];
  data?: AppleRecord[];
}

function parseAppleJson(j: AppleHealthExport): Pick<HealthEntry, "sleepDurationHours" | "sleepQualityScore" | "steps" | "activeMinutes" | "breakCount" | "totalBreakMinutes"> & { date: string } {
  const records = j.records ?? j.data ?? [];
  const dateKey = todayKey();
  const todays = records.filter((r) => (r.startDate ?? "").startsWith(dateKey));
  const sleepRows = todays.filter((r) => /sleep/i.test(r.type ?? ""));
  const stepRows = todays.filter((r) => /step/i.test(r.type ?? ""));
  const activeRows = todays.filter((r) => /activeenergy|appleexercisetime|workout/i.test(r.type ?? ""));

  const sleepMs = sleepRows.reduce((acc, r) => {
    if (!r.startDate || !r.endDate) return acc;
    return acc + (new Date(r.endDate).getTime() - new Date(r.startDate).getTime());
  }, 0);
  const steps = stepRows.reduce((acc, r) => acc + num(r.value), 0);
  const active = activeRows.reduce((acc, r) => acc + num(r.value), 0);

  return {
    date: dateKey,
    sleepDurationHours: sleepMs ? sleepMs / 3_600_000 : 7,
    sleepQualityScore: 78,
    steps: Math.max(steps, 0) || 5000,
    activeMinutes: Math.max(active, 0) || 20,
    breakCount: 3,
    totalBreakMinutes: 45,
  };
}

function parseFitbitCsv(rows: Record<string, string>[]) {
  // Fitbit Activities export columns: Date, Calories Burned, Steps, Distance, Floors,
  // Minutes Sedentary, Minutes Lightly Active, Minutes Fairly Active, Minutes Very Active.
  const r = rows[0] ?? {};
  const date = r.date || todayKey();
  const fairly = num(r.minutes_fairly_active);
  const very = num(r.minutes_very_active);
  return {
    date,
    sleepDurationHours: num(r.minutes_asleep) / 60 || 7.4,
    sleepQualityScore: num(r.sleep_score, 80),
    steps: num(r.steps, 5000),
    activeMinutes: fairly + very || 22,
    breakCount: 3,
    totalBreakMinutes: 45,
  };
}

function parseGoogleFitCsv(rows: Record<string, string>[]) {
  const r = rows[0] ?? {};
  return {
    date: r.start_time?.slice(0, 10) || todayKey(),
    sleepDurationHours: num(r.sleep_segment_duration_min) / 60 || 7.2,
    sleepQualityScore: 75,
    steps: num(r.step_count_total ?? r.step_count, 5000),
    activeMinutes: num(r.move_minutes_count ?? r.calories_expended, 25),
    breakCount: 3,
    totalBreakMinutes: 45,
  };
}

function parseGenericCsv(rows: Record<string, string>[]) {
  const r = rows[0] ?? {};
  return {
    date: r.date || todayKey(),
    sleepDurationHours: num(r.sleep_hours ?? r.sleep_duration_hours, 7),
    sleepQualityScore: num(r.sleep_quality ?? r.sleep_quality_score, 80),
    steps: num(r.steps, 5000),
    activeMinutes: num(r.active_minutes, 25),
    breakCount: num(r.break_count, 3),
    totalBreakMinutes: num(r.total_break_minutes, 45),
  };
}

export function parseDeviceImport(filename: string, text: string): ParseResult {
  const bytes = Buffer.byteLength(text, "utf-8");
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const j = JSON.parse(trimmed);
      const src = detectFromJson(j, filename);
      const base =
        src === "oura"
          ? parseOuraJson(j as OuraExport)
          : src === "apple_health"
            ? parseAppleJson(j as AppleHealthExport)
            : parseOuraJson(j as OuraExport);
      return {
        source: src,
        date: base.date,
        rowsRead: Array.isArray(j) ? j.length : Object.keys(j).length,
        filename,
        bytes,
        entry: { ...base, source: "device_import" },
      };
    } catch {
      /* fall through to csv */
    }
  }
  const rows = parseCSV(trimmed);
  const src = detect(filename, trimmed);
  const base =
    src === "fitbit"
      ? parseFitbitCsv(rows)
      : src === "google_fit"
        ? parseGoogleFitCsv(rows)
        : parseGenericCsv(rows);
  return {
    source: src,
    date: base.date,
    rowsRead: rows.length,
    filename,
    bytes,
    entry: { ...base, source: "device_import" },
  };
}

export function applyDeviceImport(userId: string, parsed: ParseResult): HealthEntry {
  const entry: HealthEntry = {
    id: uid("h"),
    userId,
    date: parsed.date,
    sleepDurationHours: parsed.entry.sleepDurationHours,
    sleepQualityScore: parsed.entry.sleepQualityScore,
    steps: parsed.entry.steps,
    activeMinutes: parsed.entry.activeMinutes,
    breakCount: parsed.entry.breakCount,
    totalBreakMinutes: parsed.entry.totalBreakMinutes,
    source: "device_import",
    createdAt: Date.now(),
  };
  const list = db().health;
  const idx = list.findIndex((h) => h.userId === userId && h.date === entry.date);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  db().deviceImports.push({
    id: uid("dimp"),
    userId,
    source: parsed.source,
    filename: parsed.filename,
    rows: parsed.rowsRead,
    bytes: parsed.bytes,
    createdAt: Date.now(),
  });
  save();
  recalculateRecovery(userId, entry.date);
  issueHealthBonuses(userId, entry.date);
  return entry;
}
