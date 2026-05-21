"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, formatCredits } from "@/lib/utils";
import { useApp } from "@/app/providers";
import {
  LayoutDashboard,
  Wallet,
  HeartPulse,
  Moon,
  Coins,
  Sparkles,
  BotMessageSquare,
  Trophy,
  Settings,
  Watch,
  KeyRound,
} from "lucide-react";

const ITEMS = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/wallet", label: "Wallet", icon: Wallet },
  { href: "/app/recovery", label: "Recovery", icon: HeartPulse },
  { href: "/app/devices", label: "Devices", icon: Watch },
  { href: "/app/curfew", label: "Curfew", icon: Moon },
  { href: "/app/staking", label: "Staking", icon: Coins },
  { href: "/app/playground", label: "Playground", icon: Sparkles },
  { href: "/app/agent", label: "Agent", icon: BotMessageSquare },
  { href: "/app/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/app/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function SideNav() {
  const pathname = usePathname();
  const { snapshot } = useApp();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/5 bg-black/30 px-3 py-5 backdrop-blur-xl md:flex">
      <Link href="/" className="mb-6 flex items-center gap-2 px-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-aurora-teal to-aurora-violet shadow-lg shadow-aurora-violet/30">
          <Moon className="h-5 w-5 text-ink-950" strokeWidth={2.4} />
        </div>
        <div>
          <div className="font-display text-sm font-semibold leading-tight">Good Night</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-moon-200/70">Credits</div>
        </div>
      </Link>

      <div className="glass-card mb-4 px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-moon-200/70">Available</div>
        <div className="mt-1 font-display text-2xl font-semibold gradient-text">
          {snapshot ? formatCredits(snapshot.wallet.availableCredits) : "—"}
        </div>
        <div className="mt-1 text-[10px] text-moon-200/60">credits</div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1" aria-label="Primary">
        {ITEMS.map((item) => {
          const active = pathname === item.href || (pathname && pathname.startsWith(item.href + "/"));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-${item.href.split("/").pop()}`}
              className={cn(
                "group flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-white/[0.08] text-white shadow-inner shadow-white/5"
                  : "text-moon-200/80 hover:bg-white/[0.04] hover:text-white",
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-aurora-teal" : "text-moon-200/70 group-hover:text-aurora-teal")}
                    strokeWidth={2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}

export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-ink-950/70 px-4 py-3 backdrop-blur-xl md:hidden">
      <Link href="/" className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-aurora-teal to-aurora-violet">
          <Moon className="h-4 w-4 text-ink-950" strokeWidth={2.4} />
        </div>
        <span className="font-display text-sm font-semibold">Good Night Credits</span>
      </Link>
      <div className="ml-auto text-xs text-moon-200/60">{pathname}</div>
    </header>
  );
}
