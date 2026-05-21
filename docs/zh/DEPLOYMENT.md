# 部署

## 本地 Next.js 开发

```bash
cp .env.example .env.local
npm install
npm run dev
```

本地开发默认使用 `data/runtime/store.json` 这条文件存储路径。

## 本地 Cloudflare 预览

```bash
cp .dev.vars.example .dev.vars
npm run cf:build
npm run cf:dev
```

`Wrangler` 本地预览用 `.dev.vars`。不要把其中的密钥提交到仓库。

## 生产 Cloudflare

1. 先创建一次 D1：

```bash
npx wrangler d1 create good-night-credits-db
```

2. 把私有模型网关凭据写进 Worker secret：

```bash
npx wrangler secret put MODEL_GATEWAY_API_KEY
npx wrangler secret put MODEL_GATEWAY_BASE_URL_SECRET
```

3. 按需调整 `wrangler.jsonc` 里的公开变量：

```jsonc
"vars": {
  "MODEL_GATEWAY_MODEL": "<configured-model-id>",
  "NEXT_PUBLIC_DEMO_MODE": "1",
  "NEXT_PUBLIC_APP_NAME": "Good Night Credits"
}
```

`MODEL_GATEWAY_MODEL` 是用户唯一可见的模型标识。上游 URL 和 key 只放在服务端环境里。本地 `.env.local` / `.dev.vars` 可以继续用 `MODEL_GATEWAY_BASE_URL`；Cloudflare 生产环境使用 `MODEL_GATEWAY_BASE_URL_SECRET`，避免把上游地址写进 `wrangler.jsonc`。

4. 构建并部署：

```bash
npm run cf:deploy
```

## 验证

先看公开模型配置：

```bash
curl https://<your-worker>.workers.dev/api/providers
```

期望返回：

```json
{
  "models": [
    {
      "id": "<configured-model-id>"
    }
  ]
}
```

然后在 `/app/api-keys` 生成一把钱包 key，验证两种兼容接口：

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
