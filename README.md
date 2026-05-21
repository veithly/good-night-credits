# Good Night Credits

> Sleep-driven AI wallet for builders. Recover well, earn credits, spend them through one private gateway.

[![Live](https://img.shields.io/badge/Live-good--night--credits.veithly.workers.dev-0f766e?style=flat-square)](https://good-night-credits.veithly.workers.dev)
![Runtime](https://img.shields.io/badge/Runtime-Cloudflare_Workers-f97316?style=flat-square)
![Database](https://img.shields.io/badge/Database-D1-2563eb?style=flat-square)
![Framework](https://img.shields.io/badge/Framework-Next.js_15-111827?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-16a34a?style=flat-square)

Good Night Credits turns recovery into usable AI budget. Sleep, movement, breaks, and curfew compliance feed a wallet. The app issues `gnc_live_*` keys, meters usage, and exposes one public model id at a time while keeping the upstream provider private.

The public model catalogue is config-driven. Set `MODEL_GATEWAY_MODEL` and the UI, `/api/providers`, `/api/v1/models`, `/api/v1/chat/completions`, and `/api/v1/messages` all follow that configuration.

## What ships

- Rest-window wallet with sleep, movement, break, and curfew rewards.
- Private model gateway with OpenAI Chat Completions and Anthropic Messages compatibility.
- API key issuance, usage metering, and wallet debiting.
- Cloudflare deployment path using `OpenNext + Workers + D1`.
- Local dev fallback store plus production D1-backed persistence.

## Live surface

- App: `https://good-night-credits.veithly.workers.dev`
- Public model list: `GET /api/providers`
- OpenAI-compatible API: `POST /api/v1/chat/completions`
- Anthropic-compatible API: `POST /api/v1/messages`

## Quick start

```bash
git clone <repo>
cd GNToken
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`, create a wallet key in `/app/api-keys`, then use that key against either API surface.

## Environment

`MODEL_GATEWAY_API_KEY`: server-only upstream key

`MODEL_GATEWAY_BASE_URL`: server-only OpenAI-compatible gateway URL

`MODEL_GATEWAY_MODEL`: one public model id to expose

`NEXT_PUBLIC_DEMO_MODE`: accelerated rest-session toggle for local review

`NEXT_PUBLIC_APP_NAME`: product label

For local Cloudflare preview, create `.dev.vars` from `.dev.vars.example`. For production, keep gateway credentials and the gateway URL in Wrangler secrets or private environment bindings. Users only see `MODEL_GATEWAY_MODEL`.

## Cloudflare deploy

```bash
# first time only
npx wrangler d1 create good-night-credits-db
npx wrangler secret put MODEL_GATEWAY_API_KEY

# generate local types if you want them
npm run cf:typegen

# local preview
npm run cf:build
npm run cf:dev

# production deploy
npm run cf:deploy
```

The checked-in `wrangler.jsonc` binds:

- `DB` → D1
- `WORKER_SELF_REFERENCE` → the same Worker, for OpenNext internals
- `ASSETS` → static output

## API examples

Use the issued `gnc_live_*` key as the API key in Claude Code, OpenClaw, Hermes, or any OpenAI/Anthropic-compatible client. The user-facing base URL is this app; the upstream gateway stays server-side.

OpenAI client:

```ts
import OpenAI from "openai";

const ai = new OpenAI({
  apiKey: "gnc_live_<your-key>",
  baseURL: "https://good-night-credits.veithly.workers.dev/api/v1",
});

const res = await ai.chat.completions.create({
  model: "<configured-model-id>",
  messages: [{ role: "user", content: "Plan tomorrow morning." }],
});
```

Anthropic client:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: "gnc_live_<your-key>",
  baseURL: "https://good-night-credits.veithly.workers.dev/api",
});

const res = await client.messages.create({
  model: "<configured-model-id>",
  max_tokens: 512,
  messages: [{ role: "user", content: "Refactor my agent loop in five bullets." }],
});
```

## Storage model

Local development uses `data/runtime/store.json`.

Cloudflare production uses D1 through [store.ts](/C:/Users/Ricky/Documents/Project/GNToken/src/lib/store.ts:1). The app hydrates from D1 at request start and keeps the JSON file path as a local fallback only.

## Repo boundary

This open-source repo contains the product code, wallet logic, API surface, Cloudflare config, and D1 storage integration. It excludes local secrets, runtime data, and private submission assets.

## Docs

- Deployment: [docs/DEPLOYMENT.md](/C:/Users/Ricky/Documents/Project/GNToken/docs/DEPLOYMENT.md)
- Architecture: [docs/ARCHITECTURE.md](/C:/Users/Ricky/Documents/Project/GNToken/docs/ARCHITECTURE.md)
- 中文说明: [docs/zh/README.md](/C:/Users/Ricky/Documents/Project/GNToken/docs/zh/README.md)
