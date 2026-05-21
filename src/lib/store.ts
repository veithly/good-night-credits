// Runtime store with a D1-backed production path and a file-backed local path.
// Cloudflare Workers hydrate the in-memory copy from D1 at request start; local
// development keeps the original JSON file workflow for fast demos.
import type {
  AgentJob,
  CreditTx,
  HealthEntry,
  RecoveryScore,
  RestStake,
  RestWindow,
  TokenEvent,
  User,
  UserSettings,
} from "./types";
import type { ApiKeyRecord } from "./api-keys";

export interface DBShape {
  users: User[];
  settings: UserSettings[];
  health: HealthEntry[];
  recovery: RecoveryScore[];
  ledger: CreditTx[];
  tokenEvents: TokenEvent[];
  restWindows: RestWindow[];
  restStakes: RestStake[];
  agentJobs: AgentJob[];
  apiKeys: ApiKeyRecord[];
  deviceImports: {
    id: string;
    userId: string;
    source: string;            // apple_health | fitbit | oura | google_fit | csv
    filename: string;
    rows: number;
    bytes: number;
    createdAt: number;
  }[];
  deviceConnections: {
    id: string;
    userId: string;
    provider: "fitbit" | "oura" | "google_fit";
    providerUserId?: string;
    accessToken: string;        // demo mode: opaque placeholder; real mode: hashed/encrypted
    refreshToken?: string;
    scope?: string;
    expiresAt?: number;
    connectedAt: number;
    lastSyncAt?: number;
    mode: "live" | "demo";      // demo mode skips the real upstream + uses sample data
  }[];
  oauthSessions: {
    state: string;              // CSRF token
    userId: string;
    provider: "fitbit" | "oura" | "google_fit";
    redirectAfter?: string;     // path to land on after callback
    createdAt: number;          // expires after 10 min
  }[];
  meta: {
    seeded: boolean;
    streak: { userId: string; count: number; lastDate: string }[];
  };
}

type D1Result = { success: boolean };

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

interface D1Database {
  exec(query: string): Promise<unknown>;
  prepare(query: string): D1PreparedStatement;
}

interface CloudflareStoreContext {
  env?: { DB?: D1Database };
  ctx?: { waitUntil?: (promise: Promise<unknown>) => void };
}

const D1_ROW_ID = "main";

let cache: DBShape | null = null;
let hydrated = false;
let hydrating: Promise<void> | null = null;

function emptyDB(): DBShape {
  return {
    users: [],
    settings: [],
    health: [],
    recovery: [],
    ledger: [],
    tokenEvents: [],
    restWindows: [],
    restStakes: [],
    agentJobs: [],
    apiKeys: [],
    deviceImports: [],
    deviceConnections: [],
    oauthSessions: [],
    meta: { seeded: false, streak: [] },
  };
}

function normalizeDB(raw: Partial<DBShape> | null | undefined): DBShape {
  const base = emptyDB();
  const merged = { ...base, ...(raw ?? {}) } as DBShape;
  merged.meta = { ...base.meta, ...(raw?.meta ?? {}) };
  for (const key of [
    "users",
    "settings",
    "health",
    "recovery",
    "ledger",
    "tokenEvents",
    "restWindows",
    "restStakes",
    "agentJobs",
    "apiKeys",
    "deviceImports",
    "deviceConnections",
    "oauthSessions",
  ] as const) {
    if (!Array.isArray(merged[key])) merged[key] = [] as never;
  }
  if (!Array.isArray(merged.meta.streak)) merged.meta.streak = [];
  return merged;
}

function nodeRuntime(): { fs: typeof import("node:fs"); path: typeof import("node:path") } | null {
  if (typeof process === "undefined" || !process.versions?.node) return null;
  try {
    const req = eval("require") as (id: string) => unknown;
    return {
      fs: req("node:fs") as typeof import("node:fs"),
      path: req("node:path") as typeof import("node:path"),
    };
  } catch {
    return null;
  }
}

function localPaths() {
  const node = nodeRuntime();
  if (!node) return null;
  const dataDir = node.path.join(process.cwd(), "data", "runtime");
  return { node, dataDir, dbPath: node.path.join(dataDir, "store.json") };
}

function loadFromFile(): DBShape | null {
  const paths = localPaths();
  if (!paths) return null;
  const { node, dataDir, dbPath } = paths;
  if (!node.fs.existsSync(dataDir)) node.fs.mkdirSync(dataDir, { recursive: true });
  if (!node.fs.existsSync(dbPath)) return null;
  try {
    return normalizeDB(JSON.parse(node.fs.readFileSync(dbPath, "utf-8")) as DBShape);
  } catch {
    return null;
  }
}

function persistFile() {
  if (!cache) return;
  const paths = localPaths();
  if (!paths) return;
  const { node, dataDir, dbPath } = paths;
  if (!node.fs.existsSync(dataDir)) node.fs.mkdirSync(dataDir, { recursive: true });
  node.fs.writeFileSync(dbPath, JSON.stringify(cache, null, 2), "utf-8");
}

async function getCloudflareStoreContext(): Promise<CloudflareStoreContext | null> {
  try {
    const mod = await import("@opennextjs/cloudflare");
    const getCloudflareContext = (mod as {
      getCloudflareContext?: (opts?: { async?: boolean }) => Promise<CloudflareStoreContext> | CloudflareStoreContext;
    }).getCloudflareContext;
    if (!getCloudflareContext) return null;
    return (await getCloudflareContext({ async: true })) ?? null;
  } catch {
    return null;
  }
}

async function ensureD1(db: D1Database) {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS gnc_store (id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL)",
  );
}

async function loadFromD1(): Promise<DBShape | null> {
  const cf = await getCloudflareStoreContext();
  const d1 = cf?.env?.DB;
  if (!d1) return null;
  await ensureD1(d1);
  const row = await d1.prepare("SELECT json FROM gnc_store WHERE id = ?").bind(D1_ROW_ID).first<{ json: string }>();
  if (!row?.json) return null;
  try {
    return normalizeDB(JSON.parse(row.json) as DBShape);
  } catch {
    return null;
  }
}

async function persistD1() {
  if (!cache) return;
  const cf = await getCloudflareStoreContext();
  const d1 = cf?.env?.DB;
  if (!d1) return;
  const write = (async () => {
    await ensureD1(d1);
    await d1
      .prepare("INSERT OR REPLACE INTO gnc_store (id, json, updated_at) VALUES (?, ?, ?)")
      .bind(D1_ROW_ID, JSON.stringify(cache), Date.now())
      .run();
  })();
  if (cf?.ctx?.waitUntil) cf.ctx.waitUntil(write);
  else await write;
}

export async function hydrateStore(): Promise<void> {
  if (hydrated && cache) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    const fromD1 = await loadFromD1();
    cache = fromD1 ?? loadFromFile() ?? emptyDB();
    hydrated = true;
  })().finally(() => {
    hydrating = null;
  });
  return hydrating;
}

function load(): DBShape {
  if (cache) return cache;
  cache = loadFromFile() ?? emptyDB();
  hydrated = true;
  return cache;
}

export function db(): DBShape {
  return load();
}

export function save() {
  persistFile();
  void persistD1().catch(() => null);
}

export function resetDB() {
  cache = emptyDB();
  hydrated = true;
  save();
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

// ─── Helpers scoped per user ───────────────────────────────────────────────

export function getUser(userId: string): User | null {
  return db().users.find((u) => u.id === userId) ?? null;
}

export function getSettings(userId: string): UserSettings {
  const found = db().settings.find((s) => s.userId === userId);
  if (found) return found;
  const fresh: UserSettings = {
    userId,
    restWindowStart: "23:30",
    restWindowEnd: "07:30",
    manualUsageAllowance: 500,
    agentBudget: 10000,
    weekendRestEnabled: true,
    demoModeEnabled: true,
  };
  db().settings.push(fresh);
  save();
  return fresh;
}

export function setSettings(s: UserSettings) {
  const list = db().settings;
  const idx = list.findIndex((x) => x.userId === s.userId);
  if (idx >= 0) list[idx] = s;
  else list.push(s);
  save();
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getRecoveryForDate(userId: string, date: string): RecoveryScore | null {
  return db().recovery.find((r) => r.userId === userId && r.date === date) ?? null;
}

export function getHealthForDate(userId: string, date: string): HealthEntry | null {
  return db().health.find((h) => h.userId === userId && h.date === date) ?? null;
}

export function getStreak(userId: string): { count: number; lastDate: string } {
  return (
    db().meta.streak.find((s) => s.userId === userId) ?? { userId, count: 0, lastDate: "" }
  );
}

export function bumpStreak(userId: string, date: string) {
  const list = db().meta.streak;
  const cur = list.find((s) => s.userId === userId);
  if (!cur) {
    list.push({ userId, count: 1, lastDate: date });
    save();
    return;
  }
  const last = new Date(cur.lastDate);
  const next = new Date(date);
  const diffDays = Math.round((next.getTime() - last.getTime()) / 86_400_000);
  cur.count = diffDays === 1 ? cur.count + 1 : 1;
  cur.lastDate = date;
  save();
}

export function getStreakMultiplier(userId: string): number {
  const { count } = getStreak(userId);
  if (count >= 14) return 1.35;
  if (count >= 7) return 1.25;
  if (count >= 3) return 1.1;
  return 1.0;
}
