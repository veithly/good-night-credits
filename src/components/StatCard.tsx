import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  accent = "moon",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: "moon" | "teal" | "violet" | "rose" | "amber" | "mint";
  className?: string;
}) {
  const accentBar: Record<string, string> = {
    moon: "from-moon-300 to-moon-500",
    teal: "from-aurora-teal to-cyan-400",
    violet: "from-aurora-violet to-fuchsia-400",
    rose: "from-aurora-rose to-pink-400",
    amber: "from-aurora-amber to-orange-400",
    mint: "from-aurora-mint to-emerald-400",
  };
  return (
    <div className={cn("glass-card relative overflow-hidden p-5", className)}>
      <div className={cn("absolute left-0 top-0 h-1 w-full bg-gradient-to-r", accentBar[accent])} />
      <div className="stat-label">{label}</div>
      <div className="mt-2 stat-num">{value}</div>
      {hint && <div className="mt-2 text-xs text-moon-200/70">{hint}</div>}
    </div>
  );
}
