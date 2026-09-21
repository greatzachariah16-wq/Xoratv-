export interface VtusharePlan {
  id: string;
  network: string;
  networkId: string;
  bundle: string;
  type: string; // e.g. 'sme', 'gifting', 'corporate'
  name: string;
  size: string; // e.g. '500MB', '1GB', '2GB'
  price: number;
  validity?: string;
}

export interface RewardConfig {
  enabled: boolean;
  rewardDataSize: string; // e.g. '1GB'
  selectedPlan: VtusharePlan;
  maxDailyBudget: number; // NGN
  maxRewardsPerUser: number;
  minBalanceThreshold: number; // NGN
  provider: "vtushare";
  lastCatalogRefresh?: string;
  cachedPlans: VtusharePlan[];
  cachedBalance: number | null;
  updatedAt: string;
  updatedBy: string;
}

export interface RewardTransaction {
  xoraTxId: string;
  userId: string;
  userEmail?: string;
  phone: string;
  phoneMasked: string;
  provider: "vtushare";
  network: "MTN";
  bundle: string;
  type: string;
  planName: string;
  expectedAmount: number;
  chargedAmount?: number;
  vtushareRef: string | null;
  status: "pending" | "processing" | "success" | "failed" | "refunded" | "cancelled";
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  webhookReceivedAt?: string | null;
  webhookPayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
  trustScore?: number;
  fraudTier?: number;
}
