// AI gateway — single server-side surface for all model calls.
// Falls back to deterministic output when no key is set, so the product
// walkthrough always produces visible artefacts.

import OpenAI from "openai";
import { shortHash } from "./utils";

const apiKey = process.env.MODEL_GATEWAY_API_KEY ?? "";
const baseURL =
  process.env.MODEL_GATEWAY_BASE_URL_SECRET ||
  process.env.MODEL_GATEWAY_BASE_URL ||
  undefined;

export const hasRealAI = Boolean(apiKey);

export const MODELS = {
  default: process.env.MODEL_GATEWAY_MODEL || "step-3.6",
  reasoning: process.env.MODEL_GATEWAY_MODEL || "step-3.6",
} as const;

export const ai = hasRealAI ? new OpenAI({ apiKey, baseURL }) : null;

interface CompleteArgs {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CompleteResult {
  output: string;
  tokensUsed: number;
  model: string;
  source: "live" | "offline";
}

const DEMO_OUTPUT: Record<string, string> = {
  generate_readme: `# {{title}}

> {{tagline}}

## Why this exists
{{rationale}}

## Quick start
\`\`\`bash
git clone https://github.com/<owner>/<repo>
cd <repo>
cp .env.example .env.local
pnpm install
pnpm dev
\`\`\`

## How it works
1. Set your rest window in Settings.
2. Sync (or simulate) sleep, movement, break data.
3. Stake unused credits before bed.
4. Schedule an agent to run while you sleep.
5. Wake up with bonus credits — spend them in the Playground.

## Built with
Next.js 15 · Tailwind v4 · Framer Motion · Playwright · HyperFrames

## License
MIT
`,
  generate_pitch: `# {{title}} — Product Launch Pitch

**Headline:** Sleep better. Earn more AI credits.

**Subheadline:** Good Night Credits rewards builders for sleeping, moving, and not doom-prompting at 2AM. Stake unused credits, schedule agents while you sleep, wake up richer.

## The problem
AI builders burn out and burn tokens. Always-on shipping culture celebrates the 4 AM coffee. Every "one more prompt" trades long-term creativity for short-term output.

## The unlock
A Compute Wallet whose currency is **earned by recovery**, not just billed by the hour. Stake credits at bedtime; agents run on a tight budget while you sleep; you wake up with a +20% yield if you held the curfew.

## Product path
1. Dashboard at 23:25 — Recovery Score 82.
2. Stake 20,000 credits, schedule README agent at 01:00.
3. Rest Preview: 8h compressed to 45s.
4. Wake up: +12,000 curfew bonus, +4,000 stake yield.
5. Spend 5,200 credits in Playground to generate this pitch.

## Why now
LLM API costs are the new electricity bill of software. Builders need a kinder default loop than "more, faster, later".
`,
  review_code: `## Code review summary

**Verdict:** ship it after the two fixes below.

### What's strong
- Clear separation between credits ledger and rest-window settlement.
- The recovery score formula is explicit and easy to defend.
- Guided mode hooks are isolated from the production path.

### What to fix before shipping
1. **Add a "Run anyway" confirmation toast** when manual usage is attempted during the rest window, so users understand the wallet impact before spending.
2. **Cap Playground prompts at 4,000 chars** server-side; right now a copy/paste runaway could overshoot the credit estimate.

### Optional polish
- The Wallet ledger could group adjacent same-day events visually.
- Consider rendering the streak badge in the dashboard greeting.
`,
  plan_agent_tasks: `## Agent task plan — 8-hour rest window

1. **01:00 · Generate README** — budget 2,400 credits. Output → dashboard.
2. **02:30 · Draft launch brief** — budget 5,200 credits. Output → agent workspace.
3. **04:00 · Review changelog of last 12 commits** — budget 3,400 credits. Output → notes.md.
4. **06:30 · Pre-warm cache for tomorrow's hero prompt** — budget 1,000 credits. Output → cache.

Total reserved: 12,000 credits (within 10k+2k headroom). All four jobs run on the same Edge worker; failures retry once, then mark the job 'failed' for morning review.
`,
};

export async function complete(taskType: string, args: CompleteArgs): Promise<CompleteResult> {
  if (!hasRealAI) {
    const tmpl = DEMO_OUTPUT[taskType] ?? `## ${taskType}\n\n${args.user.slice(0, 600)}`;
    const filled = tmpl
      .replaceAll("{{title}}", "Good Night Credits")
      .replaceAll("{{tagline}}", "Sleep better. Earn more AI credits.")
      .replaceAll("{{rationale}}", args.user.slice(0, 240) || "Built for AI-native builders.");
    const tokens = Math.round(filled.length / 4);
    return { output: filled, tokensUsed: tokens, model: "offline:" + shortHash(taskType), source: "offline" };
  }

  const completion = await ai!.chat.completions.create({
    model: MODELS.default,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    max_tokens: args.maxTokens ?? 900,
    temperature: args.temperature ?? 0.6,
  });
  const msg = completion.choices[0]?.message as
    | { content?: string | null; reasoning?: string | null }
    | undefined;
  // Some reasoning-tier models place their final answer in `reasoning` and
  // leave `content` empty.
  // Prefer `content`, fall back to `reasoning`, then to "".
  const text = (msg?.content && msg.content.trim().length > 0
    ? msg.content
    : msg?.reasoning) ?? "";
  const tokens = completion.usage?.total_tokens ?? Math.ceil(text.length / 4);
  return { output: text, tokensUsed: tokens, model: MODELS.default, source: "live" };
}

export function systemPromptFor(taskType: string): string {
  switch (taskType) {
    case "generate_readme":
      return "You write product README files in English. Output Markdown only, < 500 lines. Use the structure: hero, why, quick start, how it works, built with, license. Be concrete, not generic.";
    case "generate_pitch":
      return "You write concise product launch pitches in English. 5 sections max, max 30 words per section body. Use the structure: hero, trade-off, product walkthrough, how-it-works, proof + ask. Be sharp and quotable.";
    case "review_code":
      return "You are a senior reviewer. Identify the 2 most important fixes, 1 strength, and 2 optional polish items. Markdown bullets. < 200 words.";
    case "plan_agent_tasks":
      return "You plan overnight agent tasks for an AI builder. Output a 3–5 step ordered plan. Each step: time, action, credit budget, output destination. Stay within 12,000 credits total.";
    default:
      return "You are Good Night Credits' helpful AI co-pilot. Be concise.";
  }
}
