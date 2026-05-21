# Deployment

## Local Next.js dev

```bash
cp .env.example .env.local
npm install
npm run dev
```

This path uses the file-backed local store at `data/runtime/store.json`.

## Local Cloudflare preview

```bash
cp .dev.vars.example .dev.vars
npm run cf:build
npm run cf:dev
```

Use `.dev.vars` for local Wrangler preview values. Keep secrets out of git.

## Production Cloudflare

1. Create D1 once:

```bash
npx wrangler d1 create good-night-credits-db
```

2. Put the private gateway credentials into Workers secrets:

```bash
npx wrangler secret put MODEL_GATEWAY_API_KEY
npx wrangler secret put MODEL_GATEWAY_BASE_URL_SECRET
```

3. Adjust public vars in `wrangler.jsonc` if needed:

```jsonc
"vars": {
  "MODEL_GATEWAY_MODEL": "<configured-model-id>",
  "NEXT_PUBLIC_DEMO_MODE": "1",
  "NEXT_PUBLIC_APP_NAME": "Good Night Credits"
}
```

`MODEL_GATEWAY_MODEL` is the only model identifier users should see. Keep the upstream URL and key server-side. Local `.env.local` / `.dev.vars` may still use `MODEL_GATEWAY_BASE_URL`; Cloudflare production should use `MODEL_GATEWAY_BASE_URL_SECRET` so the URL is not stored in `wrangler.jsonc`.

4. Build and deploy:

```bash
npm run cf:deploy
```

## Verification

Health check:

```bash
curl https://<your-worker>.workers.dev/api/providers
```

Expected shape:

```json
{
  "models": [
    {
      "id": "<configured-model-id>"
    }
  ]
}
```

Issue a wallet key from `/app/api-keys`, then verify both compatible APIs:

```bash
curl https://<your-worker>.workers.dev/api/v1/models \
  -H "Authorization: Bearer gnc_live_<your-key>"
```

```bash
curl https://<your-worker>.workers.dev/api/v1/chat/completions \
  -H "Authorization: Bearer gnc_live_<your-key>" \
  -H "Content-Type: application/json" \
  -d '{ "model": "<configured-model-id>", "messages": [{ "role": "user", "content": "hello" }] }'
```

```bash
curl https://<your-worker>.workers.dev/api/v1/messages \
  -H "x-api-key: gnc_live_<your-key>" \
  -H "Content-Type: application/json" \
  -d '{ "model": "<configured-model-id>", "max_tokens": 256, "messages": [{ "role": "user", "content": "hello" }] }'
```
