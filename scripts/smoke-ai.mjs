#!/usr/bin/env node
// Smoke-test the configured private model gateway:
// list models, then send a tiny chat completion.
// Reads MODEL_GATEWAY_* from .env.local.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function loadEnv() {
  try {
    const raw = await fs.readFile(path.join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {/* ignore */}
}

async function main() {
  await loadEnv();
  const base = (process.env.MODEL_GATEWAY_BASE_URL || "").replace(/\/+$/, "");
  const key = process.env.MODEL_GATEWAY_API_KEY || "";
  const model = process.env.MODEL_GATEWAY_MODEL || "";

  if (!base || !key || !model) {
    console.error("MODEL_GATEWAY_BASE_URL, MODEL_GATEWAY_API_KEY, and MODEL_GATEWAY_MODEL are required in .env.local.");
    process.exit(1);
  }

  console.log("base   = configured");
  console.log(`key    = ${key.slice(0, 8)}…${key.slice(-4)}`);
  console.log(`model  = ${model}\n`);

  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  console.log("[1/2] GET /models …");
  const m = await fetch(`${base}/models`, { headers });
  const mtxt = await m.text();
  if (!m.ok) {
    console.error(`  ✗ HTTP ${m.status}: ${mtxt.slice(0, 240)}`);
    process.exit(2);
  }
  let mjson;
  try { mjson = JSON.parse(mtxt); } catch { console.error(`  ✗ not JSON: ${mtxt.slice(0,240)}`); process.exit(2); }
  const ids = (mjson.data || []).map((x) => x.id).slice(0, 10);
  console.log(`  ✓ ${(mjson.data || []).length} models (showing 10): ${ids.join(", ")}`);

  console.log("\n[2/2] POST /chat/completions (gateway roundtrip) …");
  const body = {
    model,
    messages: [
      { role: "system", content: "You are concise. Reply with no preamble." },
      { role: "user", content: "Reply with exactly: GNToken AI gateway is healthy." },
    ],
    temperature: 0.1,
    max_tokens: 32,
  };
  const c = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const ctxt = await c.text();
  if (!c.ok) {
    console.error(`  ✗ HTTP ${c.status}: ${ctxt.slice(0, 400)}`);
    process.exit(3);
  }
  try {
    const j = JSON.parse(ctxt);
    const out = j.choices?.[0]?.message?.content || "(no content)";
    console.log(`  ✓ ${out.trim().slice(0, 200)}`);
    console.log(`  ✓ usage: ${JSON.stringify(j.usage || {})}`);
  } catch {
    console.log(`  ✓ raw: ${ctxt.slice(0, 240)}`);
  }
  console.log("\nAll good. Gateway is healthy.");
}

main().catch((e) => { console.error(e); process.exit(1); });
