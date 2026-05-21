import { NextResponse } from "next/server";
import { db, getStreak } from "@/lib/store";
import { walletSnapshot } from "@/lib/credits";
import { DEMO_USER_ID, seedDemoIfNeeded } from "@/lib/demo";
import { prepareRequestStore } from "@/lib/request-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BoardRow {
  rank: number;
  user: string;
  isMe: boolean;
  recoveryScore: number;
  aiRhythmScore: number;
  creditsEarned: number;
  restStreak: number;
  shippingScore: number;
}

// Seed a few competitive peers so the board never reads as "alone".
const PEERS = [
  { id: "user_neo", username: "neo", recovery: 88, rhythm: 92, earned: 36400, streak: 11 },
  { id: "user_amaya", username: "amaya", recovery: 85, rhythm: 95, earned: 32100, streak: 7 },
  { id: "user_kai", username: "kai", recovery: 79, rhythm: 88, earned: 29000, streak: 5 },
  { id: "user_sora", username: "sora", recovery: 74, rhythm: 81, earned: 26000, streak: 3 },
  { id: "user_jules", username: "jules", recovery: 72, rhythm: 76, earned: 21000, streak: 2 },
];

function shipping(row: { recovery: number; earned: number; streak: number }) {
  return Math.round(row.recovery * 0.5 + row.earned * 0.0005 + row.streak * 5);
}

export async function GET() {
  await prepareRequestStore();
  seedDemoIfNeeded();
  const me = db().users.find((u) => u.id === DEMO_USER_ID)!;
  const myWallet = walletSnapshot(DEMO_USER_ID);
  const myStreak = getStreak(DEMO_USER_ID).count;
  const myRecovery = db().recovery.find((r) => r.userId === DEMO_USER_ID) ?? null;

  const rows = [
    ...PEERS.map((p) => ({
      ...p,
    })),
    {
      id: DEMO_USER_ID,
      username: me.username.toLowerCase(),
      recovery: myRecovery?.totalScore ?? 82,
      rhythm: myRecovery?.aiRhythmScore ?? 91,
      earned: myWallet.todayEarned + 18000,
      streak: myStreak,
    },
  ]
    .map((r) => ({ ...r, ship: shipping({ recovery: r.recovery, earned: r.earned, streak: r.streak }) }))
    .sort((a, b) => b.ship - a.ship);

  const board: BoardRow[] = rows.map((r, i) => ({
    rank: i + 1,
    user: r.username,
    isMe: r.id === DEMO_USER_ID,
    recoveryScore: r.recovery,
    aiRhythmScore: r.rhythm,
    creditsEarned: r.earned,
    restStreak: r.streak,
    shippingScore: r.ship,
  }));

  return NextResponse.json({ board });
}
