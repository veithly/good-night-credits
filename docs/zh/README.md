# Good Night Credits

> 给开发者的恢复型 AI 钱包。睡得更好，赚到 credits，再通过一个私有网关把 credits 花出去。

[在线地址](https://good-night-credits.veithly.workers.dev)

## 这是什么

Good Night Credits 把睡眠、运动、休息和 curfew 纪律折算成一个可消费的钱包。应用会签发 `gnc_live_*` key，统一记账，并且对外只暴露一个配置里的公开模型名；真实上游来源留在服务端。

模型展示是配置驱动的。设置 `MODEL_GATEWAY_MODEL` 之后，首页文案、`/api/providers`、`/api/v1/models`、`/api/v1/chat/completions`、`/api/v1/messages` 都会跟着这个配置走，而不是写死某个模型。

## 已包含的内容

- Rest window 钱包和 credits 账本
- OpenAI Chat Completions 兼容接口
- Anthropic Messages 兼容接口
- Cloudflare Workers + D1 部署链路
- 本地文件存储回退和生产 D1 存储

## 本地启动

```bash
git clone <repo>
cd GNToken
cp .env.example .env.local
npm install
npm run dev
```

## 关键环境变量

`MODEL_GATEWAY_API_KEY`：服务端上游 key

`MODEL_GATEWAY_BASE_URL`：服务端私有网关地址

`MODEL_GATEWAY_MODEL`：公开给用户的唯一模型名

`NEXT_PUBLIC_DEMO_MODE`：本地快速结算开关

`NEXT_PUBLIC_APP_NAME`：产品名

## Cloudflare 部署

完整步骤见 [docs/DEPLOYMENT.md](/C:/Users/Ricky/Documents/Project/GNToken/docs/DEPLOYMENT.md)。

最短路径：

```bash
npx wrangler d1 create good-night-credits-db
npx wrangler secret put MODEL_GATEWAY_API_KEY
npm run cf:deploy
```

## API 兼容方式

把 `gnc_live_*` key 作为 API key 导入 Claude Code、OpenClaw、Hermes，或任何 OpenAI / Anthropic 兼容客户端。用户侧只配置 Good Night Credits 的地址和模型名；真实上游路由留在服务端。

OpenAI 风格：

```ts
import OpenAI from "openai";

const ai = new OpenAI({
  apiKey: "gnc_live_<your-key>",
  baseURL: "https://good-night-credits.veithly.workers.dev/api/v1",
});
```

Anthropic 风格：

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: "gnc_live_<your-key>",
  baseURL: "https://good-night-credits.veithly.workers.dev/api",
});
```

## 开源边界

这个仓库包含产品代码、钱包逻辑、API 表面、Cloudflare 配置和 D1 存储接入。不会包含本地密钥、运行时数据和私有提交资产。
