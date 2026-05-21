"use client";

import { motion } from "framer-motion";

export function ScoreRing({
  score,
  size = 160,
  stroke = 12,
  label = "Recovery",
}: {
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = c * (1 - pct);
  const tone =
    score >= 80 ? "from-aurora-teal to-aurora-mint"
    : score >= 60 ? "from-aurora-violet to-moon-300"
    : "from-aurora-rose to-aurora-amber";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="transparent"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="transparent"
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`font-display text-4xl font-bold bg-gradient-to-br ${tone} bg-clip-text text-transparent`}>
          {Math.round(score)}
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-moon-200/70">{label}</div>
      </div>
    </div>
  );
}
