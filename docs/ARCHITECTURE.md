# Architecture

## Overview

Good Night Credits is a Next.js 15 App Router project with five layers:

1. **UI** — App Router routes under `src/app/` (the landing page + the authenticated app shell at `/app`, including `/app/devices` and `/app/api-keys`).
2. **Credits engine** — pure-TypeScript domain logic in `src/lib/` (no framework lock-in).
3. **Device ingest** — CSV/JSON parsers in `src/lib/devices.ts` for Apple Health, Fitbit, Oura, Google Fit; rewrites today's HealthEntry with `source: device_import` (highest trust tier).
4. **Private model gateway** — `src/lib/providers.ts` discovers routable models server-side, classifies them as `basic`/`advanced`, and exposes only plain public model IDs to users; `src/lib/eligibility.ts` enforces the tier gate.
5. **Compatible `/v1` surface** — `src/app/api/v1/models`, `src/app/api/v1/chat/completions`, and `src/app/api/v1/messages` validate `gnc_live_*` keys (`src/lib/api-keys.ts`), check tier eligibility, debit the wallet, and proxy the call.

```mermaid
flowchart LR
  user[User Browser]
  sdk[Claude Code / OpenClaw / Hermes / SDK]
  user -- "intent (sleep / move / rest, prompt, stake)" --> ui[Next.js UI]
  user -- "wearable export" --> devUI[/app/devices]
  devUI -- "POST /api/devices" --> devices[devices.ts]
  ui -- "REST" --> api[App Router API routes]
  api -- "ledger write" --> credits[credits.ts]
  api -- "score" --> rec[recovery.ts]
  api -- "stake / settle" --> rest[rest-window.ts + staking.ts]
  ui -- "/app/playground (Model)" --> pg[playground.runModel]
  sdk -- "Bearer gnc_live_* → /api/v1/*" --> gw[v1 gateway]
  gw -- "validate" --> keys[api-keys.ts]
  gw -- "tier gate" --> elig[eligibility.ts]
  pg --> elig
  pg --> providers[providers.discoverAll]
  gw --> providers
  providers -- "server-only route" --> private[Private model router]
  pg -- "offline-safe fallback" --> deterministic[lib/ai.ts deterministic output]
  devices --> store[(Cloudflare D1 in production\nJSON file fallback locally)]
  credits --> store
  rest --> store
  scheduler[Scheduled Agent runner\nlib/playground.ts] --> pg
```

The dotted line between the gateway and the deterministic fallback keeps the product walkthrough reviewable even if venue Wi-Fi drops. The tier gate is **purely server-side** so a client cannot bypass it by editing the request.

## Data model

Local development keeps the product state in `data/runtime/store.json` for fast iteration. Cloudflare production hydrates the same `DBShape` from the `gnc_store` row in D1 at request start and persists updates back through `src/lib/store.ts`. API modules still read and write plain TypeScript objects, so the storage boundary stays centralized.

| Table | Purpose | Owner module |
| ----- | ------- | ------------ |
| `users` | identity + timezone | `store.ts` |
| `settings` | rest window, allowance, agent budget, guided mode | `store.ts` |
| `health` | derived sleep/move/break inputs (raw logs never stored) | `recovery.ts` |
| `recovery` | per-day score breakdown + bonus amounts | `recovery.ts` |
| `ledger` | every credit mutation, idempotent and append-only | `credits.ts` |
| `tokenEvents` | every AI call (usage type, source, in-rest flag, prompt hash, model name) | `playground.ts`, `v1/chat/completions/route.ts` |
| `restWindows` | per-window status + manual/agent usage + reward | `rest-window.ts` |
| `restStakes` | active + completed stakes, with yield rate | `staking.ts` |
| `agentJobs` | scheduled / running / completed AI agent jobs | `playground.ts` |
| `apiKeys` | `gnc_live_*` records (SHA-256 hash, prefix, last 4, scope, usage stats) | `api-keys.ts` |
| `deviceImports` | audit trail of every wearable file processed (source, rows, bytes) | `devices.ts` |
| `meta.streak` | per-user streak counter for the multiplier | `store.ts` |

## Key flows

### 1. Health input → credits

1. User submits `/api/health` with a preset or manual values.
2. `recovery.recalculateRecovery` recomputes the score row.
3. `recovery.issueHealthBonuses` idempotently appends sleep / movement / break bonuses to the ledger — once per day per bonus type.
4. UI revalidates via the `useApp` snapshot.

### 2. Compute Curfew settlement

1. User presses **Start Rest Session**.
2. `rest-window.startWindow` flips the upcoming window to `active`; accelerated local review can compress the end time.
3. `/api/curfew action=settle` calls `rest-window.settleWindow`:
   - Sums `tokenEvents` inside the window.
   - Computes `complianceMultiplier` (1.0 / 0.5 / 0).
   - Applies streak multiplier and a **12,000 cr** cap.
   - Emits `curfew_bonus` to the ledger.
   - Calls `staking.settleStakeForWindow` to return principal + (maybe) yield.

### 3. Rest Staking

1. `/api/staking action=create` calls `staking.createStake`. Balance check, append a `staking_lock` (`-amount`) ledger entry, mark stake `active`.
2. `staking.settleStakeForWindow` runs inside the curfew settlement:
   - Always appends `staking_return` (`+amount`).
   - If compliance was full and no emergency unlock, appends `staking_yield` capped at 10,000 cr / day.
3. Emergency unlock returns principal only and marks the stake `unlocked`.

### 4. Playground run

1. `/api/playground` validates the tool + prompt with Zod (max 4,000 chars).
2. If inside the rest window and the client has not confirmed, returns a 409 with a clear rest-window warning.
3. Otherwise: calls `playground.runPlaygroundTool`:
   - `ai.complete` either runs the live model call or returns deterministic offline output.
   - Records a `token_events` row tagged with `usageType=manual` (and `isDuringRestWindow`).
   - Debits the ledger with the fixed-tier cost.

### 5. Agent While You Sleep

1. `/api/agent-jobs action=create` writes the job to `agentJobs`.
2. The schedule is checked client-side in guided mode (run-now action). Production scheduling is designed to run from the Cloudflare Worker surface.
3. `playground.runAgentJob` flips the job to `running`, calls the AI gateway with `usageType=agent`, and credits or debits accordingly. Jobs do not affect the curfew bonus.

### 6. Device import

1. User drops a CSV or JSON export at `/app/devices` (or clicks one of the four built-in sample payloads).
2. `POST /api/devices` calls `devices.parseDeviceImport`:
   - JSON heuristic: detects Apple Health / Oura by shape + filename.
   - CSV heuristic: detects Fitbit / Google Fit / generic by header columns.
3. `devices.applyDeviceImport` rewrites today&apos;s `HealthEntry` with `source=device_import` (trust 1.0×), recomputes recovery, and issues the (larger) bonus credits.
4. A `deviceImports` audit row records source / filename / row count for the user&apos;s privacy ledger.

### 7. Compatible /v1 gateway

1. Client sends `Authorization: Bearer gnc_live_<...>` to `/api/v1/chat/completions` or `x-api-key: gnc_live_<...>` to `/api/v1/messages`.
2. `api-keys.findByToken` SHA-256s the token and looks up the record (revoked → 401).
3. `providers.discoverAll` returns the in-memory model catalogue (cached 5 min), stripped to public model IDs.
4. If the requested model is `tier=advanced`, `eligibility.canUseTier(userId, "advanced")` checks **both**:
   - At least one rest stake created yesterday (any status that wasn&apos;t cancelled), AND
   - At least one health entry uploaded in the last 24 h (manual or device).
   Failures return HTTP 402 with structured `requires` reasons.
5. Pre-flight cost estimate vs. wallet balance — insufficient → 402 `insufficient_credits`.
6. `providers.chatCompletion` routes the call through the server-only model gateway key.
7. A `tokenEvents` row + `ledger` debit are written; `api-keys.recordUsage` updates per-key counters.
8. Response shape matches the caller: Chat Completions or Claude Messages. The extra `.gnc` field exposes `{ credits_used, remaining_credits, tier }` for SDKs that surface it.

## Security boundary

- **Gateway operator keys** are server-only — they are never imported in a client component. `lib/providers.ts` is the only module that constructs model clients.
- **User-issued keys** (`gnc_live_*`) are stored as SHA-256 hashes; only the prefix + last 4 chars are kept in cleartext. The full token is shown to the user **once** at issue time and never again.
- **Tier gating is server-side.** A client cannot bypass it by editing the body or spoofing eligibility — every advanced call re-runs `canUseTier(userId, "advanced")` against the live store.
- **No on-chain wallet.** Credits are an internal usage ledger, not a withdrawable asset.
- **Health data**: only derived daily summaries are persisted. Raw heart-rate, GPS, or per-minute telemetry from imported files is **discarded** during parsing. A consent notice is shown before the first manual submission.
- **Prompt privacy**: `token_events` stores a `promptHash` (DJB2 short-hash), never the prompt body. Prompt bodies live in browser memory while the user is on the page and are dropped on navigation.
- **DELETE endpoints**: `/api/health DELETE` purges health rows; `/api/api-keys?id=...` deletes a key permanently (`action=revoke` just disables it).
- **Rate-limiting**: the current public gateway validates wallet keys and balances. Cloudflare-native rate limiting can be layered on the `/v1` gateway before broader production use.

## Trade-offs

- **No real auth.** The whole app runs against a seeded local user. Wiring Clerk / Auth.js is the next production step.
- **D1 snapshot store.** Production uses a single D1 row containing the normalized app snapshot. It keeps the build small; a future high-volume version can split hot tables into dedicated D1 tables without changing route contracts.
- **Partial streaming.** `/v1/messages` can return Claude-style SSE events; the in-app Playground still uses a single-shot call.
- **No native HealthKit web OAuth.** Apple Health remains file-import based. Fitbit, Oura, and Google Fit share the OAuth-shaped connector path.
- **No Weekend Yield UI.** The reward path exists in `credits.ts` (transaction type `weekend_yield`), but no page surfaces it. Adding it is a single page + cron handler.

## Reward formulae

```
Sleep Score    = duration_score * 0.6 + quality_score * 0.4
Sleep Bonus    = (Sleep Score / 100) * 8,000

Movement Score = min(steps/8000, 1)*60 + min(active_minutes/30, 1)*40
Movement Bonus = (Movement Score / 100) * 4,000

Break Score    = min(break_count/3, 1)*50 + min(total_break_minutes/45, 1)*50
Break Bonus    = (Break Score / 100) * 3,000

Curfew Bonus   = min(rest_hours * 1000, 12,000)
               * compliance_multiplier  // 1.0 / 0.5 / 0
               * streak_multiplier      // 1.0 / 1.1 / 1.25 / 1.35

Stake Yield    = min(amount * yield_rate, 10,000)
Recovery Total = sleep*0.35 + movement*0.20 + break*0.20 + ai_rhythm*0.25
Shipping Score = recovery*0.5 + credits_earned*0.0005 + streak*5
```

Daily and weekly caps prevent credit inflation: 50,000 / day, 250,000 / week, enforced inside `credits.addCredits`.
