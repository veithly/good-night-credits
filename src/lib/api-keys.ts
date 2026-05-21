// API key management — issues `gnc_live_*` keys that gate access to the
// /v1 gateway. Keys are stored hashed (SHA-256); only the prefix + last4
// are kept in cleartext for display.

import { createHash, randomBytes } from "node:crypto";
import { db, save, uid } from "./store";

export type ApiKeyScope = "basic" | "all";

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  hash: string;
  prefix: string;
  last4: string;
  scope: ApiKeyScope;
  createdAt: number;
  lastUsedAt?: number;
  usageCount: number;
  totalCreditsUsed: number;
  revoked: boolean;
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function listKeys(userId: string): ApiKeyRecord[] {
  return db()
    .apiKeys.filter((k) => k.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function createKey(args: { userId: string; name: string; scope?: ApiKeyScope }): {
  record: ApiKeyRecord;
  token: string; // returned ONCE, never stored
} {
  const random = randomBytes(24).toString("base64url").replace(/[-_]/g, "x");
  const token = `gnc_live_${random}`;
  const record: ApiKeyRecord = {
    id: uid("key"),
    userId: args.userId,
    name: args.name.slice(0, 60) || "Unnamed key",
    hash: hash(token),
    prefix: token.slice(0, 12),
    last4: token.slice(-4),
    scope: args.scope ?? "basic",
    createdAt: Date.now(),
    usageCount: 0,
    totalCreditsUsed: 0,
    revoked: false,
  };
  db().apiKeys.push(record);
  save();
  return { record, token };
}

export function revokeKey(userId: string, keyId: string): boolean {
  const rec = db().apiKeys.find((k) => k.id === keyId && k.userId === userId);
  if (!rec) return false;
  rec.revoked = true;
  save();
  return true;
}

export function deleteKey(userId: string, keyId: string): boolean {
  const before = db().apiKeys.length;
  db().apiKeys = db().apiKeys.filter((k) => !(k.id === keyId && k.userId === userId));
  save();
  return db().apiKeys.length < before;
}

export function findByToken(token: string): ApiKeyRecord | null {
  if (!token) return null;
  const h = hash(token);
  const rec = db().apiKeys.find((k) => k.hash === h && !k.revoked);
  return rec ?? null;
}

export function recordUsage(keyId: string, creditsUsed: number) {
  const rec = db().apiKeys.find((k) => k.id === keyId);
  if (!rec) return;
  rec.lastUsedAt = Date.now();
  rec.usageCount += 1;
  rec.totalCreditsUsed += creditsUsed;
  save();
}
