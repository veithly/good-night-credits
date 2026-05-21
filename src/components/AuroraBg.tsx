"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function AuroraBg({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <div className="absolute inset-0 grid-bg opacity-30" />
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 0.8, scale: 1 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="absolute -left-1/4 top-[-10%] h-[600px] w-[600px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(94,234,212,0.25), transparent 70%)" }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 0.75, scale: 1 }}
        transition={{ duration: 1.6, delay: 0.2, ease: "easeOut" }}
        className="absolute right-[-10%] top-[20%] h-[640px] w-[640px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(167,139,250,0.28), transparent 70%)" }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.55 }}
        transition={{ duration: 1.8, delay: 0.4, ease: "easeOut" }}
        className="absolute bottom-[-15%] left-[20%] h-[520px] w-[520px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(251,113,133,0.20), transparent 70%)" }}
      />
    </div>
  );
}
