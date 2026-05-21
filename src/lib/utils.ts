import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCredits(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function hoursBetween(startHHMM: string, endHHMM: string): number {
  const [sh, sm] = startHHMM.split(":").map(Number);
  const [eh, em] = endHHMM.split(":").map(Number);
  const start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end <= start) end += 24 * 60;
  return (end - start) / 60;
}

export function within(d: Date, startHHMM: string, endHHMM: string): boolean {
  const [sh, sm] = startHHMM.split(":").map(Number);
  const [eh, em] = endHHMM.split(":").map(Number);
  const now = d.getHours() * 60 + d.getMinutes();
  const start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end <= start) {
    return now >= start || now < end;
  }
  return now >= start && now < end;
}

export function nextWindowAt(now: Date, startHHMM: string, endHHMM: string): { start: Date; end: Date } {
  const [sh, sm] = startHHMM.split(":").map(Number);
  const [eh, em] = endHHMM.split(":").map(Number);
  const start = new Date(now);
  start.setHours(sh, sm, 0, 0);
  if (start.getTime() <= now.getTime()) {
    start.setDate(start.getDate() + 1);
  }
  const end = new Date(start);
  end.setHours(eh, em, 0, 0);
  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }
  return { start, end };
}

export function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
}
