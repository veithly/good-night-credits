import Link from "next/link";
import { AuroraBg } from "@/components/AuroraBg";
import {
  Moon,
  ArrowRight,
  Sparkles,
  Coins,
  HeartPulse,
  BotMessageSquare,
  Sun,
  Activity,
  Brain,
} from "lucide-react";

export default function HomePage() {
  const featuredModel = process.env.MODEL_GATEWAY_MODEL || "your configured model";
  return (
    <main className="relative min-h-screen overflow-hidden">
      <AuroraBg />

      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-aurora-teal to-aurora-violet shadow-lg shadow-aurora-violet/30">
            <Moon className="h-5 w-5 text-ink-950" strokeWidth={2.4} />
          </div>
          <div>
            <div className="font-display text-sm font-semibold leading-tight">Good Night</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-moon-200/70">Credits</div>
          </div>
        </Link>
        <nav className="hidden items-center gap-1 text-sm text-moon-200/80 md:flex">
          <a href="#how" className="rounded-full px-3 py-1.5 hover:bg-white/5">How it works</a>
          <a href="#mechanics" className="rounded-full px-3 py-1.5 hover:bg-white/5">Mechanics</a>
          <a href="#playground" className="rounded-full px-3 py-1.5 hover:bg-white/5">Playground</a>
          <a href="#faq" className="rounded-full px-3 py-1.5 hover:bg-white/5">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/app" className="btn-primary" data-testid="cta-try">
            Open wallet
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-12 pt-10 md:pb-20 md:pt-20">
        <div className="flex flex-col items-center text-center">
          <div className="pill mb-6 border-aurora-teal/30 bg-aurora-teal/10 text-aurora-teal" data-testid="hero-badge">
            <Sparkles className="h-3.5 w-3.5" />
            Built for VibeCoders · The wallet behind your AI prompts
          </div>
          <h1 className="text-balance font-display text-4xl font-semibold leading-tight tracking-tight md:text-6xl" data-testid="hero-headline">
            Sleep tonight.
            <br />
            <span className="gradient-text">VibeCode harder tomorrow.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-base text-moon-100/80 md:text-lg">
            You already live inside Claude, Cursor, Codex — and the API bill is real. Good Night Credits
            pays you in <span className="text-aurora-teal">AI credits</span> for actually going to bed,
            so tomorrow you wake up with <span className="text-aurora-violet">a full wallet and a full tank</span>
            and you can VibeCode all day instead of doom-prompting all night.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/app" className="btn-primary" data-testid="cta-primary">
              Claim tonight&apos;s credits <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/app/playground" className="btn-ghost">
              <Sparkles className="h-4 w-4" /> Open Playground
            </Link>
          </div>

          {/* Wallet balance */}
          <div className="mt-14 w-full max-w-3xl">
            <div className="glass-card ring-aurora relative overflow-hidden p-6 text-left">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-aurora-teal via-aurora-violet to-aurora-rose" />
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-moon-200/70">Wallet balance</div>
                  <div className="mt-1 font-display text-4xl font-semibold tracking-tight">
                    42,000 <span className="text-base text-moon-200/70">credits</span>
                  </div>
                </div>
                <div className="hidden gap-2 md:flex">
                  <span className="pill text-aurora-teal">+18,000 today</span>
                  <span className="pill text-aurora-rose">−9,400 spent</span>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-moon-200/60">Sleep Bonus</div>
                  <div className="mt-1 font-display text-lg">+8,000</div>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-moon-200/60">Curfew Bonus</div>
                  <div className="mt-1 font-display text-lg">+12,000</div>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-moon-200/60">Stake Yield</div>
                  <div className="mt-1 font-display text-lg">+4,000</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10 text-center">
          <div className="pill mb-3 text-moon-200/80">How it works</div>
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Four signals. One <span className="gradient-text">sustainable VibeCoding loop.</span>
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { icon: Sun, title: "Sleep", body: "7–9 hours of real sleep pays the biggest credit drop — bring receipts (wearable)." },
            { icon: Activity, title: "Move", body: "8k steps + 30 active minutes. So your brain still works when the prompts get hard." },
            { icon: Brain, title: "Break", body: "Three breaks, 45 minutes total. The best refactor you've ever shipped was after lunch." },
            { icon: Moon, title: "AI Rhythm", body: "Save the late-night prompting urge for tomorrow — earn the curfew bonus instead." },
          ].map((card) => (
            <div key={card.title} className="glass-card p-5">
              <card.icon className="mb-3 h-5 w-5 text-aurora-teal" strokeWidth={2.2} />
              <div className="font-display text-lg font-semibold">{card.title}</div>
              <p className="mt-2 text-sm text-moon-100/80">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mechanics */}
      <section id="mechanics" className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-4 md:grid-cols-2">
          <MechanicCard
            icon={Coins}
            accent="from-aurora-amber to-amber-500"
            title="Rest Staking"
            body="Put 20,000 credits on the line before bed. Don't doom-prompt before sunrise → wake up with 24,000. Cave at 2 AM → you eat the loss. Principal always returns."
            example={`Stake     20,000\nYield     +4,000\nPrincipal returned`}
          />
          <MechanicCard
            icon={Moon}
            accent="from-aurora-violet to-fuchsia-500"
            title="Compute Curfew"
            body="Pick your rest window — 23:30 → 07:30 by default. Keep manual prompts under 500 credits in the window and the full curfew bonus lands, scaled by your streak."
            example={`Rest 23:30 – 07:30\nManual cap   500 cr\nReward     +12,000`}
          />
          <MechanicCard
            icon={BotMessageSquare}
            accent="from-aurora-teal to-cyan-500"
            title="Agent While You Sleep"
            body="Hand the boring overnight VibeCoding to an agent — README, code review, plan tomorrow's tickets. Fixed budget, won't break your curfew."
            example={`README agent  01:00\nBudget       8,000\nOutput → Dashboard`}
          />
          <MechanicCard
            icon={HeartPulse}
            accent="from-aurora-rose to-pink-500"
            title="Recovery Score"
            body="Sleep · Movement · Break · AI Rhythm — weighted 35/20/20/25. Each component shows up as a labelled bonus row in your wallet ledger so you know exactly why the credits arrived."
            example={`Total           82\nSleep 88 · Move 72\nBreak 76 · AI 91`}
          />
        </div>
      </section>

      {/* Playground CTA */}
      <section id="playground" className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="glass-card moon-grad relative overflow-hidden p-8 md:p-12">
          <div className="relative z-10 flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="max-w-xl">
              <div className="pill mb-3 text-moon-200/80">Playground</div>
              <h3 className="font-display text-3xl font-semibold tracking-tight">
                Burn your <span className="gradient-text">earned credits</span> on real models.
              </h3>
              <p className="mt-3 text-moon-100/80">
                Fixed-cost VibeCoding combos for the boring stuff — README, pitch deck, code review,
                agent planner — or jump to <em>Model</em> and call <code>{featuredModel}</code> directly.
                Either way you always know what tonight&apos;s rest just bought you.
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-3 md:w-auto">
              {[
                { label: "Generate README", cost: "2,400 cr" },
                { label: "Generate Pitch", cost: "5,200 cr" },
                { label: "Review My Code", cost: "3,400 cr" },
                { label: "Plan Agent Tasks", cost: "4,800 cr" },
              ].map((it) => (
                <div key={it.label} className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm">
                  <div className="font-medium">{it.label}</div>
                  <div className="text-xs text-moon-200/70">{it.cost}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative z-10 mx-auto max-w-3xl px-6 py-16">
        <h2 className="mb-8 text-center font-display text-3xl font-semibold tracking-tight">FAQ</h2>
        <div className="space-y-3">
          {[
            {
              q: "I literally code with Claude/Cursor/Codex all night. Is this telling me to stop?",
              a: "Opposite. You burn at most one good night this week — and even that one funds the next five days of harder VibeCoding. You sleep so you can prompt better, longer, with more credits, the next 14 waking hours.",
            },
            {
              q: "What if I cave and prompt at 3 AM?",
              a: "You lose tonight's stake yield and the curfew bonus. Your base credits are never clawed back, and the wallet only restores full spending power after you log a real night.",
            },
            {
              q: "Is this just another health-tracker reskinned?",
              a: "No. Credits work inside the Playground, the /v1 gateway, and your own apps via gnc_live_* API keys. Sleep is the means; AI compute is the unit you spend.",
            },
            {
              q: "Will my Claude Code / OpenClaw / Hermes setup just work?",
              a: "Yes. Import the Good Night Credits API as a Claude-compatible endpoint, set your gnc_live_* key, and choose the model name you want. Chat Completions clients can use the same key through /v1.",
            },
            {
              q: "Do I need to know where a model is served from?",
              a: `No. Your tools only see the public model name ${featuredModel}. Routing stays private behind the wallet gateway.`,
            },
            {
              q: "Why a wallet metaphor?",
              a: "Because token spend is the new electricity bill of VibeCoding. A wallet is the cleanest mental model for 'I earn this, I spend this, here's the receipt'.",
            },
          ].map((it) => (
            <details key={it.q} className="glass-card group p-5">
              <summary className="cursor-pointer list-none text-base font-medium text-moon-50 marker:hidden">
                <span className="mr-2 text-aurora-teal">›</span>
                {it.q}
              </summary>
              <p className="mt-3 text-sm text-moon-100/80">{it.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="relative z-10 mx-auto max-w-6xl px-6 pb-10 pt-6 text-center text-xs text-moon-200/50">
        <div>Good Night Credits · MIT · The wallet for VibeCoders.</div>
        <div className="mt-1 text-moon-200/40">No medical advice. Credits cannot be withdrawn or traded — they unlock <em>your</em> AI usage, not someone else&apos;s.</div>
      </footer>
    </main>
  );
}

function MechanicCard({
  icon: Icon,
  accent,
  title,
  body,
  example,
}: {
  icon: typeof Coins;
  accent: string;
  title: string;
  body: string;
  example: string;
}) {
  return (
    <div className="glass-card relative overflow-hidden p-6">
      <div className={`absolute left-0 top-0 h-1 w-full bg-gradient-to-r ${accent}`} />
      <div className="flex items-start gap-4">
        <div className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${accent} text-ink-950 shadow`}>
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="flex-1">
          <div className="font-display text-lg font-semibold">{title}</div>
          <p className="mt-2 text-sm text-moon-100/80">{body}</p>
          <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-white/5 bg-black/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-moon-100">
            {example}
          </pre>
        </div>
      </div>
    </div>
  );
}
