import crypto from "node:crypto";
import fs from "node:fs";
import { queryRtdb } from "./xseries-service-account";
import { type VtusharePlan, type RewardConfig, type RewardTransaction } from "../lib/rewards/types";
import {
  normalizeNigerianPhone,
  isValidNigerianPhone,
  isMtnNigeriaNumber,
  maskPhone,
} from "../lib/rewards/phone";

export {
  type VtusharePlan,
  type RewardConfig,
  type RewardTransaction,
  normalizeNigerianPhone,
  isValidNigerianPhone,
  isMtnNigeriaNumber,
  maskPhone,
};

// In-memory active claim locks to enforce server-authoritative idempotency
const ACTIVE_CLAIM_LOCKS = new Set<string>();

// Cached authentication token
let cachedToken: { token: string; expiresAt: number } | null = null;

// Track latest observed VTUshare wallet balance in memory (and RTDB)
let latestWalletBalance: number | null = null;

/**
 * Standard default fallback MTN plans (calibrated to VTUshare SME & Direct structure)
 */
export const DEFAULT_MTN_PLANS: VtusharePlan[] = [
  {
    id: "mtn_500mb_sme",
    network: "MTN",
    networkId: "1",
    bundle: "500MB",
    type: "sme",
    name: "MTN 500MB SME Data (30 Days)",
    size: "500MB",
    price: 135,
    validity: "30 days",
  },
  {
    id: "mtn_1gb_sme",
    network: "MTN",
    networkId: "1",
    bundle: "1GB",
    type: "sme",
    name: "MTN 1GB SME Data (30 Days)",
    size: "1GB",
    price: 265,
    validity: "30 days",
  },
  {
    id: "mtn_2gb_sme",
    network: "MTN",
    networkId: "1",
    bundle: "2GB",
    type: "sme",
    name: "MTN 2GB SME Data (30 Days)",
    size: "2GB",
    price: 530,
    validity: "30 days",
  },
  {
    id: "mtn_3gb_sme",
    network: "MTN",
    networkId: "1",
    bundle: "3GB",
    type: "sme",
    name: "MTN 3GB SME Data (30 Days)",
    size: "3GB",
    price: 795,
    validity: "30 days",
  },
  {
    id: "mtn_5gb_sme",
    network: "MTN",
    networkId: "1",
    bundle: "5GB",
    type: "sme",
    name: "MTN 5GB SME Data (30 Days)",
    size: "5GB",
    price: 1325,
    validity: "30 days",
  },
];

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  enabled: true,
  rewardDataSize: "1GB",
  selectedPlan: DEFAULT_MTN_PLANS[1], // 1GB SME
  maxDailyBudget: 50000,
  maxRewardsPerUser: 1,
  minBalanceThreshold: 500,
  provider: "vtushare",
  cachedPlans: DEFAULT_MTN_PLANS,
  cachedBalance: null,
  updatedAt: new Date().toISOString(),
  updatedBy: "system_default",
};

/**
 * Retrieve server-side VTUshare credentials
 */
export function getVtushareCredentials(): {
  email: string;
  password: string;
  isConfigured: boolean;
} {
  let email = (process.env.VTUSHARE_EMAIL || "").trim();
  let password = (process.env.VTUSHARE_PASSWORD || "").trim();

  // Also check dev json file if available
  if (!email || !password) {
    try {
      const devEnvPath = "/app/.dev.env.json";
      if (fs.existsSync(devEnvPath)) {
        const devEnv = JSON.parse(fs.readFileSync(devEnvPath, "utf-8"));
        if (!email && devEnv.VTUSHARE_EMAIL) email = String(devEnv.VTUSHARE_EMAIL).trim();
        if (!password && devEnv.VTUSHARE_PASSWORD)
          password = String(devEnv.VTUSHARE_PASSWORD).trim();
      }
    } catch {
      // ignore
    }
  }

  return {
    email,
    password,
    isConfigured: Boolean(email && password),
  };
}

/**
 * Authenticate with VTUshare using POST /api/auth or Basic Auth
 */
export async function getVtushareAuthToken(): Promise<{
  ok: boolean;
  token?: string;
  error?: string;
}> {
  const { email, password, isConfigured } = getVtushareCredentials();
  if (!isConfigured) {
    return {
      ok: false,
      error: "VTUshare credentials (VTUSHARE_EMAIL / VTUSHARE_PASSWORD) not configured.",
    };
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return { ok: true, token: cachedToken.token };
  }

  try {
    const res = await fetch("https://vtushare.com.ng/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json().catch(() => null);

    if (res.ok && data?.status === "success" && data?.token) {
      // Token is base64(email:password)
      cachedToken = {
        token: data.token,
        expiresAt: now + 60 * 60 * 1000, // 1 hour TTL
      };
      return { ok: true, token: data.token };
    }

    // Fallback: direct base64 encoding if /api/auth was temporary offline but creds valid
    const basicToken = Buffer.from(`${email}:${password}`).toString("base64");
    cachedToken = {
      token: basicToken,
      expiresAt: now + 30 * 60 * 1000,
    };
    return { ok: true, token: basicToken };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "VTUshare auth failure";
    // Fallback to basic token if network blip on auth
    const basicToken = Buffer.from(`${email}:${password}`).toString("base64");
    return { ok: true, token: basicToken, error: message };
  }
}

/**
 * Fetch and refresh plan catalog from VTUshare (POST /api/v1/getPlans)
 */
export async function refreshVtusharePlans(): Promise<{
  ok: boolean;
  plans: VtusharePlan[];
  error?: string;
  source: "live" | "cached" | "fallback";
}> {
  const authRes = await getVtushareAuthToken();
  if (!authRes.ok || !authRes.token) {
    // Return stored config or default plans
    const config = await getStoredRewardConfig();
    return {
      ok: true,
      plans: config.cachedPlans?.length ? config.cachedPlans : DEFAULT_MTN_PLANS,
      error: authRes.error,
      source: "fallback",
    };
  }

  try {
    const res = await fetch("https://vtushare.com.ng/api/v1/getPlans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${authRes.token}`,
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[VTUshare] getPlans HTTP ${res.status}:`, errText);
      const config = await getStoredRewardConfig();
      return {
        ok: true,
        plans: config.cachedPlans?.length ? config.cachedPlans : DEFAULT_MTN_PLANS,
        error: `VTUshare getPlans responded with HTTP ${res.status}`,
        source: "cached",
      };
    }

    const payload = await res.json().catch(() => null);

    if (payload?.status === "error") {
      console.warn("[VTUshare] getPlans status error:", payload?.message);
      const config = await getStoredRewardConfig();
      return {
        ok: true,
        plans: config.cachedPlans?.length ? config.cachedPlans : DEFAULT_MTN_PLANS,
        error: payload.message || "Failed to retrieve plans from provider",
        source: "cached",
      };
    }

    const parsedPlans: VtusharePlan[] = [];

    // Parse VTUshare plan structure
    const rawItems: unknown[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.plans)
          ? payload.plans
          : [];

    if (rawItems.length > 0) {
      for (const item of rawItems) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const networkRaw = String(
          rec.network || rec.network_name || rec.network_id || "",
        ).toUpperCase();
        if (!networkRaw.includes("MTN") && networkRaw !== "1") continue;

        const bundle = String(rec.bundle || rec.bundle_id || rec.plan_id || rec.id || "");
        const type = String(rec.type || rec.plan_type || "sme").toLowerCase();
        const name = String(rec.name || rec.plan_name || `MTN ${bundle} ${type.toUpperCase()}`);
        const price = Number(rec.price || rec.amount || 0);
        const size = String(rec.size || rec.plan_size || bundle);

        parsedPlans.push({
          id: `vtushare_${bundle}_${type}`,
          network: "MTN",
          networkId: "1",
          bundle,
          type,
          name,
          size,
          price,
          validity: String(rec.validity || "30 days"),
        });
      }
    }

    const finalPlans = parsedPlans.length > 0 ? parsedPlans : DEFAULT_MTN_PLANS;

    // Save to RTDB rewardConfig
    await updateStoredRewardConfig({
      cachedPlans: finalPlans,
      lastCatalogRefresh: new Date().toISOString(),
    });

    return {
      ok: true,
      plans: finalPlans,
      source: parsedPlans.length > 0 ? "live" : "fallback",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "VTUshare getPlans error";
    const config = await getStoredRewardConfig();
    return {
      ok: true,
      plans: config.cachedPlans?.length ? config.cachedPlans : DEFAULT_MTN_PLANS,
      error: msg,
      source: "cached",
    };
  }
}

/**
 * Execute MTN Data Purchase via POST /api/v1/buydata
 */
export async function executeVtushareDataPurchase(params: {
  phone: string;
  bundle: string;
  type: string;
  network?: string;
}): Promise<{
  ok: boolean;
  status: "success" | "pending" | "failed";
  ref: string | null;
  message: string;
  chargedAmount?: number;
  balanceAfter?: number;
  raw?: unknown;
}> {
  const { phone, bundle, type, network = "1" } = params;
  const normPhone = normalizeNigerianPhone(phone);

  const authRes = await getVtushareAuthToken();
  if (!authRes.ok || !authRes.token) {
    return {
      ok: false,
      status: "failed",
      ref: null,
      message: authRes.error || "VTUshare provider authentication unavailable.",
    };
  }

  const payload = {
    phone: normPhone,
    network,
    bundle,
    type,
  };

  try {
    const res = await fetch("https://vtushare.com.ng/api/v1/buydata", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${authRes.token}`,
      },
      body: JSON.stringify(payload),
      // 25 second timeout to allow telco routing
      signal: AbortSignal.timeout(25000),
    });

    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (!res.ok && !data) {
      return {
        ok: false,
        status: "pending", // mark pending rather than blind retry
        ref: null,
        message: `VTUshare returned HTTP ${res.status}. Claim queued for reconciliation.`,
      };
    }

    const rawStatus = String(data?.status || "").toLowerCase();
    const ref = String(data?.ref || data?.reference || data?.transaction_id || `vtu_${Date.now()}`);
    const message = String(data?.message || data?.msg || "");
    const charged =
      typeof data?.charged_amount === "number"
        ? data.charged_amount
        : typeof data?.amount === "number"
          ? data.amount
          : undefined;
    const balAfter =
      typeof data?.balance_after === "number"
        ? data.balance_after
        : Number(data?.balance_after) || undefined;

    if (balAfter !== undefined && !isNaN(balAfter)) {
      latestWalletBalance = balAfter;
      void updateStoredRewardConfig({ cachedBalance: balAfter }).catch(() => {});
    }

    if (rawStatus === "success" || rawStatus === "successful") {
      return {
        ok: true,
        status: "success",
        ref,
        message: message || "Data reward delivered successfully.",
        chargedAmount: charged,
        balanceAfter: balAfter,
        raw: data,
      };
    }

    if (rawStatus === "pending" || rawStatus === "processing") {
      return {
        ok: true,
        status: "pending",
        ref,
        message: message || "Data delivery request submitted to telco gateway.",
        chargedAmount: charged,
        balanceAfter: balAfter,
        raw: data,
      };
    }

    return {
      ok: false,
      status: "failed",
      ref,
      message: message || "Telco delivery failed. Reward queued for review.",
      chargedAmount: charged,
      balanceAfter: balAfter,
      raw: data,
    };
  } catch (err: unknown) {
    const isTimeout =
      err instanceof Error && (err.name === "TimeoutError" || err.message.includes("timeout"));
    const message = isTimeout
      ? "Provider response timed out. Request queued as pending to prevent double charging."
      : err instanceof Error
        ? err.message
        : "Network error communicating with VTUshare";

    // CRITICAL: NEVER blind retry on timeout. Mark as pending with generated tracking ref.
    return {
      ok: true,
      status: "pending",
      ref: `timeout_${Date.now()}`,
      message,
    };
  }
}

/**
 * Get stored reward configuration from Firebase RTDB
 */
export async function getStoredRewardConfig(): Promise<RewardConfig> {
  try {
    const config = (await queryRtdb("rewardConfig")) as RewardConfig | null;
    if (config && config.selectedPlan) {
      if (latestWalletBalance !== null && config.cachedBalance === null) {
        config.cachedBalance = latestWalletBalance;
      }
      return config;
    }
  } catch (err) {
    console.warn("[VTUshare Service] Error reading rewardConfig:", err);
  }
  return DEFAULT_REWARD_CONFIG;
}

/**
 * Update stored reward configuration
 */
export async function updateStoredRewardConfig(
  patch: Partial<RewardConfig>,
): Promise<RewardConfig> {
  const current = await getStoredRewardConfig();
  const updated: RewardConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  try {
    await queryRtdb("rewardConfig", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
  } catch (err) {
    console.warn("[VTUshare Service] Error saving rewardConfig:", err);
  }

  return updated;
}

/**
 * Save transaction record to RTDB
 */
export async function saveRewardTransaction(tx: RewardTransaction): Promise<void> {
  try {
    await queryRtdb(`rewardTransactions/${tx.xoraTxId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tx),
    });

    // Also index under user
    await queryRtdb(`userRewards/${tx.userId}/${tx.xoraTxId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        xoraTxId: tx.xoraTxId,
        status: tx.status,
        phoneMasked: tx.phoneMasked,
        planName: tx.planName,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
      }),
    });
  } catch (err) {
    console.warn("[VTUshare Service] Error saving transaction:", err);
  }
}

/**
 * Get user reward transactions
 */
export async function getUserRewardTransactions(userId: string): Promise<RewardTransaction[]> {
  try {
    const all = (await queryRtdb("rewardTransactions")) as Record<string, RewardTransaction> | null;
    if (!all) return [];
    return Object.values(all)
      .filter((tx) => tx && tx.userId === userId)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  } catch {
    return [];
  }
}

/**
 * Get all reward transactions (for Admin view)
 */
export async function getAllRewardTransactions(limit = 100): Promise<RewardTransaction[]> {
  try {
    const all = (await queryRtdb("rewardTransactions")) as Record<string, RewardTransaction> | null;
    if (!all) return [];
    return Object.values(all)
      .filter((tx): tx is RewardTransaction => Boolean(tx && tx.xoraTxId))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Process incoming VTUshare Webhook idempotently
 */
export async function processVtushareWebhook(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  message: string;
  xoraTxId?: string;
  ignored?: boolean;
}> {
  const ref = String(payload.ref || payload.reference || "");
  const receiver = normalizeNigerianPhone(String(payload.receiver || payload.phone || ""));
  const rawStatus = String(payload.status || "").toLowerCase();
  const chargedAmount = Number(payload.charged_amount || payload.amount || 0);
  const balanceAfter = Number(payload.balance_after);

  if (!isNaN(balanceAfter)) {
    latestWalletBalance = balanceAfter;
    void updateStoredRewardConfig({ cachedBalance: balanceAfter }).catch(() => {});
  }

  if (!ref && !receiver) {
    return { ok: false, message: "Missing reference and receiver phone in webhook payload." };
  }

  // Find transaction matching this VTUshare ref or phone
  const allTx = (await queryRtdb("rewardTransactions")) as Record<string, RewardTransaction> | null;
  let targetTx: RewardTransaction | null = null;

  if (allTx) {
    targetTx =
      Object.values(allTx).find(
        (t) =>
          t &&
          (t.vtushareRef === ref ||
            (ref && t.xoraTxId === ref) ||
            (receiver && normalizeNigerianPhone(t.phone) === receiver && t.status === "pending")),
      ) || null;
  }

  if (!targetTx) {
    console.warn("[VTUshare Webhook] No matching Xora reward transaction found for ref:", ref);
    return {
      ok: true,
      message: "Webhook received but no matching transaction pending.",
      ignored: true,
    };
  }

  // Idempotency: If already completed or failed, do not double-process
  if (targetTx.status === "success" && (rawStatus === "success" || rawStatus === "successful")) {
    return {
      ok: true,
      message: "Transaction already processed successfully.",
      ignored: true,
      xoraTxId: targetTx.xoraTxId,
    };
  }

  const now = new Date().toISOString();
  let nextStatus: RewardTransaction["status"] = targetTx.status;

  if (rawStatus === "success" || rawStatus === "successful") {
    nextStatus = "success";
  } else if (rawStatus === "failed") {
    nextStatus = "failed";
  } else if (rawStatus === "pending") {
    nextStatus = "pending";
  }

  targetTx.status = nextStatus;
  targetTx.updatedAt = now;
  targetTx.webhookReceivedAt = now;
  targetTx.webhookPayload = payload;
  if (chargedAmount > 0) targetTx.chargedAmount = chargedAmount;
  if (nextStatus === "success" && !targetTx.completedAt) {
    targetTx.completedAt = now;
  }

  await saveRewardTransaction(targetTx);

  return {
    ok: true,
    message: `Transaction ${targetTx.xoraTxId} updated to ${nextStatus}.`,
    xoraTxId: targetTx.xoraTxId,
  };
}

/**
 * Public User Claim Flow: atomic, verified, idempotency-protected
 */
export async function claimUserReward(params: {
  userId: string;
  userEmail?: string;
  phone: string;
  trustScore?: number;
  fraudTier?: number;
}): Promise<{
  ok: boolean;
  status: "pending" | "processing" | "success" | "failed";
  txId?: string;
  message: string;
  maskedPhone?: string;
}> {
  const { userId, userEmail, phone, trustScore = 85, fraudTier = 0 } = params;

  if (!userId) {
    return {
      ok: false,
      status: "failed",
      message: "Authentication required to claim mobile data reward.",
    };
  }

  const normPhone = normalizeNigerianPhone(phone);
  if (!isValidNigerianPhone(normPhone)) {
    return {
      ok: false,
      status: "failed",
      message: "Please enter a valid 11-digit Nigerian mobile number (e.g., 08012345678).",
    };
  }

  if (!isMtnNigeriaNumber(normPhone)) {
    return {
      ok: false,
      status: "failed",
      message:
        "The current promotional reward is exclusively for MTN Nigeria lines. Please enter an MTN number.",
    };
  }

  // 1. Concurrency / Double-click locking
  if (ACTIVE_CLAIM_LOCKS.has(userId)) {
    return {
      ok: false,
      status: "processing",
      message: "A reward claim is already in progress for your account. Please wait.",
    };
  }

  ACTIVE_CLAIM_LOCKS.add(userId);

  try {
    const config = await getStoredRewardConfig();

    if (!config.enabled) {
      return {
        ok: false,
        status: "failed",
        message: "The mobile data reward campaign is currently paused. Please check back soon!",
      };
    }

    // 2. Anti-abuse Fraud Tier enforcement
    if (fraudTier >= 3 || trustScore < 25) {
      return {
        ok: false,
        status: "failed",
        message: "Your reward claim is currently under review by platform integrity.",
      };
    }

    // 3. User reward count limit check
    const existing = await getUserRewardTransactions(userId);
    const successfulClaims = existing.filter(
      (t) => t.status === "success" || t.status === "processing" || t.status === "pending",
    );

    if (successfulClaims.length >= config.maxRewardsPerUser) {
      return {
        ok: false,
        status: "failed",
        message: `You have reached the maximum reward allocation (${config.maxRewardsPerUser} reward) for this campaign.`,
      };
    }

    // 4. Daily budget check
    const todayIso = new Date().toISOString().slice(0, 10);
    const allTx = await getAllRewardTransactions(200);
    const todaySpent = allTx
      .filter((t) => (t.createdAt || "").startsWith(todayIso) && t.status !== "failed")
      .reduce((sum, t) => sum + (t.chargedAmount || t.expectedAmount || 0), 0);

    const selectedPlan = config.selectedPlan || DEFAULT_MTN_PLANS[1];
    if (todaySpent + selectedPlan.price > config.maxDailyBudget) {
      return {
        ok: false,
        status: "failed",
        message: "Today's promotional reward quota has been reached. Please check back tomorrow!",
      };
    }

    // 5. Generate internal Xora transaction ID
    const xoraTxId = `xrw_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const nowIso = new Date().toISOString();

    const txRecord: RewardTransaction = {
      xoraTxId,
      userId,
      userEmail,
      phone: normPhone,
      phoneMasked: maskPhone(normPhone),
      provider: "vtushare",
      network: "MTN",
      bundle: selectedPlan.bundle,
      type: selectedPlan.type,
      planName: selectedPlan.name,
      expectedAmount: selectedPlan.price,
      vtushareRef: null,
      status: "processing",
      createdAt: nowIso,
      updatedAt: nowIso,
      trustScore,
      fraudTier,
    };

    // Save initial state to prevent any duplicate claim race
    await saveRewardTransaction(txRecord);

    // 6. Dispatch backend purchase to VTUshare
    const purchaseRes = await executeVtushareDataPurchase({
      phone: normPhone,
      bundle: selectedPlan.bundle,
      type: selectedPlan.type,
      network: selectedPlan.networkId || "1",
    });

    txRecord.vtushareRef = purchaseRes.ref;
    txRecord.status = purchaseRes.status;
    txRecord.updatedAt = new Date().toISOString();
    txRecord.errorMessage = purchaseRes.ok ? null : purchaseRes.message;
    if (purchaseRes.chargedAmount) txRecord.chargedAmount = purchaseRes.chargedAmount;
    if (purchaseRes.status === "success") txRecord.completedAt = new Date().toISOString();

    await saveRewardTransaction(txRecord);

    let userMessage = "Your reward is being processed.";
    if (purchaseRes.status === "success") {
      userMessage = "Your data reward has been delivered.";
    } else if (purchaseRes.status === "failed") {
      userMessage = "We couldn't deliver your reward. Your claim will be reviewed automatically.";
    }

    return {
      ok: purchaseRes.ok,
      status: purchaseRes.status,
      txId: xoraTxId,
      message: userMessage,
      maskedPhone: maskPhone(normPhone),
    };
  } finally {
    ACTIVE_CLAIM_LOCKS.delete(userId);
  }
}
