// Domain types — kept tight to PRD §13.

export type UsageType = "manual" | "agent" | "system";
export type UsageSource = "playground" | "api_gateway" | "scheduled_agent" | "system";

export type CreditTxType =
  | "base_grant"
  | "sleep_bonus"
  | "movement_bonus"
  | "break_bonus"
  | "curfew_bonus"
  | "staking_lock"
  | "staking_return"
  | "staking_yield"
  | "weekend_yield"
  | "manual_usage"
  | "agent_usage"
  | "system_adjustment";

export interface User {
  id: string;
  email: string;
  username: string;
  timezone: string;
  createdAt: number;
}

export interface UserSettings {
  userId: string;
  restWindowStart: string;
  restWindowEnd: string;
  manualUsageAllowance: number;
  agentBudget: number;
  weekendRestEnabled: boolean;
  demoModeEnabled: boolean;
}

export interface HealthEntry {
  id: string;
  userId: string;
  date: string; // ISO YYYY-MM-DD
  sleepDurationHours: number;
  sleepQualityScore: number; // 0–100
  steps: number;
  activeMinutes: number;
  breakCount: number;
  totalBreakMinutes: number;
  source: "manual" | "mock" | "demo" | "device_import";
  createdAt: number;
}

export interface RecoveryScore {
  id: string;
  userId: string;
  date: string;
  sleepScore: number;
  movementScore: number;
  breakScore: number;
  aiRhythmScore: number;
  totalScore: number;
  bonuses: {
    sleepBonus: number;
    movementBonus: number;
    breakBonus: number;
    curfewBonus: number;
  };
  createdAt: number;
}

export interface CreditTx {
  id: string;
  userId: string;
  amount: number;
  type: CreditTxType;
  reason: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  balanceAfter: number;
  createdAt: number;
}

export interface TokenEvent {
  id: string;
  userId: string;
  timestamp: number;
  usageType: UsageType;
  source: UsageSource;
  tokensUsed: number;
  creditsUsed: number;
  modelName: string;
  promptHash: string;
  taskId?: string;
  isDuringRestWindow: boolean;
}

export type RestWindowStatus = "scheduled" | "active" | "completed" | "broken" | "cancelled";

export interface RestWindow {
  id: string;
  userId: string;
  startTime: number;
  endTime: number;
  status: RestWindowStatus;
  manualTokensUsed: number;
  agentTokensUsed: number;
  rewardEarned: number;
  complianceMultiplier: number;
  streakCountAtCompletion: number;
}

export type RestStakeStatus = "active" | "completed" | "broken" | "unlocked" | "cancelled";

export interface RestStake {
  id: string;
  userId: string;
  restWindowId: string;
  stakeAmount: number;
  yieldRate: number;
  expectedYield: number;
  actualYield: number;
  status: RestStakeStatus;
  emergencyUnlocked: boolean;
  createdAt: number;
  completedAt?: number;
}

export type AgentJobStatus = "scheduled" | "running" | "completed" | "failed" | "cancelled";
export type AgentTaskType = "generate_readme" | "generate_pitch" | "review_code" | "plan_agent_tasks";

export interface AgentJob {
  id: string;
  userId: string;
  taskType: AgentTaskType;
  prompt: string;
  scheduledTime: number;
  maxBudget: number;
  creditsUsed: number;
  status: AgentJobStatus;
  output?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WalletSnapshot {
  availableCredits: number;
  stakedCredits: number;
  todayEarned: number;
  todaySpent: number;
  weeklyCapRemaining: number;
}

export interface DashboardSnapshot {
  user: User;
  settings: UserSettings;
  wallet: WalletSnapshot;
  recovery: RecoveryScore | null;
  todayHealth: HealthEntry | null;
  activeStake: RestStake | null;
  upcomingWindow: { start: number; end: number; estimatedReward: number };
  streakDays: number;
  agentJobs: AgentJob[];
}
