"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { DashboardSnapshot } from "@/lib/types";

interface AppContextValue {
  snapshot: DashboardSnapshot | null;
  refresh: () => Promise<void>;
  loading: boolean;
  toasts: { id: string; title: string; body?: string; tone?: "success" | "danger" | "info" }[];
  toast: (t: { title: string; body?: string; tone?: "success" | "danger" | "info" }) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<AppContextValue["toasts"]>([]);

  async function refresh() {
    try {
      setLoading(true);
      const r = await fetch("/api/me", { cache: "no-store" });
      if (r.ok) {
        const json = (await r.json()) as { snapshot: DashboardSnapshot };
        setSnapshot(json.snapshot);
      }
    } finally {
      setLoading(false);
    }
  }

  function toast(t: { title: string; body?: string; tone?: "success" | "danger" | "info" }) {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, ...t }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4500);
  }

  useEffect(() => {
    refresh();
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({ snapshot, refresh, loading, toasts, toast }),
    [snapshot, loading, toasts],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <ToastTray />
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <Providers>");
  return ctx;
}

function ToastTray() {
  const ctx = useContext(AppContext);
  if (!ctx) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {ctx.toasts.map((t) => (
        <div
          key={t.id}
          className={
            "pointer-events-auto min-w-[260px] max-w-[420px] rounded-xl border px-4 py-3 shadow-xl backdrop-blur " +
            (t.tone === "danger"
              ? "border-aurora-rose/40 bg-aurora-rose/10 text-aurora-rose"
              : t.tone === "success"
              ? "border-aurora-teal/40 bg-aurora-teal/10 text-aurora-teal"
              : "border-white/20 bg-ink-900/80 text-moon-50")
          }
        >
          <div className="text-sm font-semibold">{t.title}</div>
          {t.body && <div className="mt-1 text-xs opacity-80">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}
