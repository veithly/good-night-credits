"use client";

import { useEffect, useState } from "react";
import { formatCredits } from "@/lib/utils";
import { Trophy } from "lucide-react";

interface Row {
  rank: number;
  user: string;
  isMe: boolean;
  recoveryScore: number;
  aiRhythmScore: number;
  creditsEarned: number;
  restStreak: number;
  shippingScore: number;
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    fetch("/api/leaderboard").then((r) => r.json()).then((j) => setRows(j.board));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-[0.18em] text-moon-200/70">Leaderboard</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Well-rested builders.</h1>
        <p className="mt-1 max-w-2xl text-sm text-moon-200/70">
          Ranking is based on the <span className="text-aurora-teal">Healthy Shipping Score</span> — not who burned the most tokens at 3 AM.
        </p>
      </header>

      <div className="glass-card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-[0.14em] text-moon-200/70">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Builder</th>
              <th className="px-4 py-3 text-right">Recovery</th>
              <th className="px-4 py-3 text-right">AI Rhythm</th>
              <th className="px-4 py-3 text-right">Credits earned</th>
              <th className="px-4 py-3 text-right">Streak</th>
              <th className="px-4 py-3 text-right">Shipping</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.rank}
                data-testid={`row-${r.rank}`}
                className={
                  "border-t border-white/5 " +
                  (r.isMe ? "bg-aurora-teal/5 text-white" : "text-moon-100/90 hover:bg-white/[0.03]")
                }
              >
                <td className="px-4 py-3 font-mono">
                  {r.rank <= 3 ? <Trophy className="mr-1 inline h-3.5 w-3.5 text-aurora-amber" /> : null}
                  {r.rank}
                </td>
                <td className="px-4 py-3">
                  {r.user}
                  {r.isMe && (
                    <span className="ml-2 rounded-full bg-aurora-teal/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-aurora-teal">
                      you
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono">{r.recoveryScore}</td>
                <td className="px-4 py-3 text-right font-mono">{r.aiRhythmScore}</td>
                <td className="px-4 py-3 text-right font-mono">{formatCredits(r.creditsEarned)}</td>
                <td className="px-4 py-3 text-right font-mono">{r.restStreak} d</td>
                <td className="px-4 py-3 text-right font-mono text-aurora-teal">{r.shippingScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="glass-card p-5 text-xs text-moon-200/70">
        Shipping Score = Recovery × 0.5 + Credits earned × 0.0005 + Rest streak × 5. No bonus for staying up late.
      </div>
    </div>
  );
}
