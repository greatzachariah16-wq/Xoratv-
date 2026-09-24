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
 * Standard default fallback MTN plans (calibrated directly to live active VTUshare records)
 */
export const DEFAULT_MTN_PLANS: VtusharePlan[] = [
  {
    id: "vtushare_990_25",
    network: "MTN",
    networkId: "2",
    bundle: "990",
    type: "25",
    name: "MTN 1GB AWOOF (30 Days)",
    size: "1GB",
    price: 280,
    validity: "30 days",
  },
  {
    id: "vtushare_988_56",
    network: "MTN",
    networkId: "2",
    bundle: "988",
    type: "56",
    name: "MTN 1GB SME (1 Day)",
    size: "1GB",
    price: 300,
    validity: "1 day",
  },
  {
    id: "vtushare_878_11",
    network: "MTN",
    networkId: "2",
    bundle: "878",
    type: "11",
    name: "MTN 500MB DataShare",
    size: "500MB",
    price: 400,
    validity: "30 days",
  },
  {
    id: "vtushare_991_25",
    network: "MTN",
    networkId: "2",
    bundle: "991",
    type: "25",
    name: "MTN 2GB AWOOF (30 Days)",
    size: "2GB",
    price: 560,
    validity: "30 days",
  },
  {
    id: "vtushare_992_25",
    network: "MTN",
    networkId: "2",
    bundle: "992",
    type: "25",
    name: "MTN 3GB AWOOF (30 Days)",
    size: "3GB",
    price: 840,
    validity: "30 days",
  },
  {
    id: "vtushare_993_25",
    network: "MTN",
    networkId: "2",
    bundle: "993",
    type: "25",
    name: "MTN 5GB AWOOF (30 Days)",
    size: "5GB",
    price: 1400,
    validity: "30 days",
  },
];

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  enabled: true,
  rewardDataSize: "1GB",
  selectedPlan: DEFAULT_MTN_PLANS[0], // MTN 1GB AWOOF (bundle: 990, type: 25, ₦280)
  maxDailyBudget: 50000,
  maxRewardsPerUser: 1,
  minBalanceThreshold: 200,
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
  username: string;
  isConfigured: boolean;
} {
  let email = (process.env.VTUSHARE_EMAIL || "").trim();
  let password = (process.env.VTUSHARE_PASSWORD || "").trim();
  let username = (process.env.VTUSHARE_USERNAME || "").trim();

  // Also check dev json file if available
  if (!email || !password || !username) {
    try {
      const devEnvPath = "/app/.dev.env.json";
      if (fs.existsSync(devEnvPath)) {
        const devEnv = JSON.parse(fs.readFileSync(devEnvPath, "utf-8"));
        if (!email && devEnv.VTUSHARE_EMAIL) email = String(devEnv.VTUSHARE_EMAIL).trim();
        if (!password && devEnv.VTUSHARE_PASSWORD)
          password = String(devEnv.VTUSHARE_PASSWORD).trim();
        if (!username && devEnv.VTUSHARE_USERNAME)
          username = String(devEnv.VTUSHARE_USERNAME).trim();
      }
    } catch {
      // ignore
    }
  }

  // Known fallback configured for this project
  if (!email) email = "ericgreat668@gmail.com";
  if (!password) password = "Princess@081";
  if (!username) username = "zachariah";

  return {
    email,
    password,
    username,
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
 * Query live wallet balance directly from VTUshare portal
 */
export async function fetchLiveVtushareBalance(): Promise<{
  ok: boolean;
  balance: number | null;
  error?: string;
}> {
  const { email, password, username } = getVtushareCredentials();
  if (!password) {
    return { ok: false, balance: null, error: "Credentials not configured" };
  }

  try {
    // 1. Get login page for CSRF token & cookies
    const getRes = await fetch("https://vtushare.com.ng/login", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(10000),
    });
    const getHtml = await getRes.text();
    const cookies = getRes.headers.getSetCookie
      ? getRes.headers.getSetCookie()
      : [getRes.headers.get("set-cookie") || ""];

    const csrf = getHtml.match(/name="_token"\s+value="([^"]+)"/)?.[1];
    if (!csrf) {
      return { ok: false, balance: latestWalletBalance, error: "Could not extract login CSRF" };
    }

    const cookieMap: Record<string, string> = {};
    for (const c of cookies) {
      if (!c) continue;
      const [kv] = c.split(";");
      const [k, v] = kv.split("=");
      if (k && v) cookieMap[k.trim()] = v;
    }
    const cookieHeader = () =>
      Object.entries(cookieMap)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");

    // 2. Perform login post with username (zachariah)
    const postRes = await fetch("https://vtushare.com.ng/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader(),
        Referer: "https://vtushare.com.ng/login",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      body: new URLSearchParams({
        _token: csrf,
        name: username || "zachariah",
        password,
      }).toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    });

    const postCookies = postRes.headers.getSetCookie
      ? postRes.headers.getSetCookie()
      : [postRes.headers.get("set-cookie") || ""];
    for (const c of postCookies) {
      if (!c) continue;
      const [kv] = c.split(";");
      const [k, v] = kv.split("=");
      if (k && v) cookieMap[k.trim()] = v;
    }

    // 3. Fetch dashboard home
    const homeRes = await fetch("https://vtushare.com.ng/home", {
      headers: {
        Cookie: cookieHeader(),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      signal: AbortSignal.timeout(10000),
    });

    const homeHtml = await homeRes.text();
    const match = homeHtml.match(/(?:Wallet\s*balance|balance):\s*(?:&#8358;|₦)?\s*([0-9,.]+)/i);

    if (match) {
      const balance = parseFloat(match[1].replace(/,/g, ""));
      latestWalletBalance = balance;
      void updateStoredRewardConfig({ cachedBalance: balance }).catch(() => {});
      return { ok: true, balance };
    }

    return {
      ok: false,
      balance: latestWalletBalance,
      error: "Balance pattern not matched in dashboard",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Balance check network error";
    return { ok: false, balance: latestWalletBalance, error: message };
  }
}

/**
 * Fetch and refresh plan catalog from VTUshare directly from active portal tables with API failover
 */
export async function refreshVtusharePlans(): Promise<{
  ok: boolean;
  plans: VtusharePlan[];
  error?: string;
  source: "live" | "cached" | "fallback";
}> {
  const { username, password } = getVtushareCredentials();

  // Primary Method: Ingest live active bundle options directly from VTUshare portal
  try {
    const getRes = await fetch("https://vtushare.com.ng/login", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(10000),
    });
    const getHtml = await getRes.text();
    const cookies = getRes.headers.getSetCookie
      ? getRes.headers.getSetCookie()
      : [getRes.headers.get("set-cookie") || ""];
    const csrf = getHtml.match(/name="_token"\s+value="([^"]+)"/)?.[1];

    if (csrf) {
      const cookieMap: Record<string, string> = {};
      for (const c of cookies) {
        if (!c) continue;
        const [kv] = c.split(";");
        const [k, v] = kv.split("=");
        if (k && v) cookieMap[k.trim()] = v;
      }
      const cookieHeader = () =>
        Object.entries(cookieMap)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");

      const postRes = await fetch("https://vtushare.com.ng/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieHeader(),
          Referer: "https://vtushare.com.ng/login",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
        body: new URLSearchParams({
          _token: csrf,
          name: username || "zachariah",
          password,
        }).toString(),
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });

      const postCookies = postRes.headers.getSetCookie
        ? postRes.headers.getSetCookie()
        : [postRes.headers.get("set-cookie") || ""];
      for (const c of postCookies) {
        if (!c) continue;
        const [kv] = c.split(";");
        const [k, v] = kv.split("=");
        if (k && v) cookieMap[k.trim()] = v;
      }

      const activeCategories = [
        { type: "25", label: "AWOOF" },
        { type: "56", label: "SME" },
        { type: "11", label: "DATASHARE" },
        { type: "50", label: "GIFTING" },
      ];

      const livePlans: VtusharePlan[] = [];

      for (const cat of activeCategories) {
        try {
          const bRes = await fetch(
            `https://vtushare.com.ng/data/bundle?provider=2&type=${cat.type}`,
            {
              headers: { Cookie: cookieHeader(), "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(8000),
            },
          );
          const bHtml = await bRes.text();
          const regex = /<option[^>]*value=['"](\d+)['"][^>]*>(.*?)<\/option>/gi;
          let m: RegExpExecArray | null;
          while ((m = regex.exec(bHtml)) !== null) {
            const bundle = m[1];
            const text = m[2].trim();
            if (!bundle || text.includes("Select")) continue;

            const priceMatch =
              text.match(/(?:=|₦|NGN|N)?\s*([0-9,]+)$/i) || text.match(/([0-9,]+)\s*$/);
            const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ""), 10) : 0;
            const sizeMatch = text.match(/(\d+(?:\.\d+)?\s*(?:MB|GB))/i);
            const size = sizeMatch ? sizeMatch[1].replace(/\s+/g, "").toUpperCase() : "1GB";

            livePlans.push({
              id: `vtushare_${bundle}_${cat.type}`,
              network: "MTN",
              networkId: "2",
              bundle,
              type: cat.type,
              name: `MTN ${text}`,
              size,
              price: price || 280,
              validity: text.includes("30") ? "30 days" : text.includes("7") ? "7 days" : "1 day",
            });
          }
        } catch {
          // Continue to next category
        }
      }

      if (livePlans.length > 0) {
        livePlans.sort((a, b) => a.price - b.price);

        // Find best 1GB plan
        const best1gb =
          livePlans.find((p) => p.bundle === "990") ||
          livePlans.find((p) => p.size === "1GB" && p.type === "25") ||
          livePlans.find((p) => p.size === "1GB") ||
          livePlans[0];

        await updateStoredRewardConfig({
          cachedPlans: livePlans,
          selectedPlan: best1gb,
          lastCatalogRefresh: new Date().toISOString(),
        });

        return {
          ok: true,
          plans: livePlans,
          source: "live",
        };
      }
    }
  } catch (webErr) {
    console.warn("[VTUshare] Live portal bundle fetch warning:", webErr);
  }

  // Fallback Method: Official API v1 endpoint
  const authRes = await getVtushareAuthToken();
  if (!authRes.ok || !authRes.token) {
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
          rec.network || rec.network_id || rec.network_name || "",
        ).toUpperCase();
        const nameRaw = String(rec.name || rec.plan_name || "");
        const nameUpper = nameRaw.toUpperCase();

        const isMtn =
          networkRaw === "2" ||
          networkRaw === "1" ||
          networkRaw.includes("MTN") ||
          nameUpper.includes("MTN") ||
          nameUpper.includes("AWOOF") ||
          nameUpper.includes("DATASHARE");

        if (!isMtn) continue;

        const bundle = String(rec.bundle_id || rec.bundle || rec.plan_id || rec.id || "");
        if (!bundle || bundle === "undefined") continue;

        const type = String(rec.type || rec.plan_type || "25");
        const price = Number(rec.amount || rec.price || 0);
        if (price <= 0) continue;

        let size = "1GB";
        const sizeMatch = nameRaw.match(/(\d+(?:\.\d+)?\s*(?:MB|GB))/i);
        if (sizeMatch) {
          size = sizeMatch[1].replace(/\s+/g, "").toUpperCase();
        } else if (nameUpper.includes("500MB")) {
          size = "500MB";
        } else if (nameUpper.includes("2GB")) {
          size = "2GB";
        } else if (nameUpper.includes("3GB")) {
          size = "3GB";
        } else if (nameUpper.includes("5GB")) {
          size = "5GB";
        } else if (nameUpper.includes("10GB")) {
          size = "10GB";
        }

        parsedPlans.push({
          id: `vtushare_${bundle}_${type}`,
          network: "MTN",
          networkId: "2",
          bundle,
          type,
          name: nameRaw || `MTN ${size} Data`,
          size,
          price,
          validity: "30 days",
        });
      }
    }

    parsedPlans.sort((a, b) => a.price - b.price);
    const finalPlans = parsedPlans.length > 0 ? parsedPlans : DEFAULT_MTN_PLANS;

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
 * Execute MTN Data Purchase via POST /api/v1/buydata with automatic web-portal fallback
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
  const { phone, bundle, type, network = "2" } = params;
  const normPhone = normalizeNigerianPhone(phone);
  const { email, password, username, isConfigured } = getVtushareCredentials();

  let cleanBundle = String(bundle || "990");
  let cleanType = String(type || "25");
  let cleanNetwork = String(network || "2");

  // In VTUshare, MTN network ID is strictly "2"
  if (cleanNetwork === "1" || cleanNetwork.toLowerCase() === "mtn") {
    cleanNetwork = "2";
  }

  // Use the exact bundle and type configured for the selected plan dynamically
  if (!cleanBundle || !cleanType) {
    try {
      const cfg = await getStoredRewardConfig();
      const active = cfg.selectedPlan || DEFAULT_MTN_PLANS[0];
      if (!cleanBundle) cleanBundle = active.bundle;
      if (!cleanType) cleanType = active.type;
    } catch {
      if (!cleanBundle) cleanBundle = DEFAULT_MTN_PLANS[0].bundle;
      if (!cleanType) cleanType = DEFAULT_MTN_PLANS[0].type;
    }
  }

  if (!isConfigured) {
    return {
      ok: false,
      status: "failed",
      ref: null,
      message: "VTUshare provider authentication not configured.",
    };
  }

  const authRes = await getVtushareAuthToken();
  const basicToken = authRes.token || Buffer.from(`${email}:${password}`).toString("base64");

  // Attempt 1: Official API v1 endpoint
  try {
    const res = await fetch("https://vtushare.com.ng/api/v1/buydata", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${basicToken}`,
      },
      body: JSON.stringify({
        phone: normPhone,
        network: cleanNetwork,
        bundle: isNaN(Number(cleanBundle)) ? cleanBundle : Number(cleanBundle),
        type: isNaN(Number(cleanType)) ? cleanType : Number(cleanType),
      }),
      signal: AbortSignal.timeout(20000),
    });

    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (res.ok && data) {
      const rawStatus = String(data?.status || "").toLowerCase();
      const ref = String(data?.ref || data?.reference || `vtu_${Date.now()}`);
      const message = String(data?.message || data?.msg || "");
      const charged = Number(data?.charged_amount || data?.amount || 0) || undefined;
      const balAfter = Number(data?.balance_after);

      if (!isNaN(balAfter)) {
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
          balanceAfter: isNaN(balAfter) ? undefined : balAfter,
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
          balanceAfter: isNaN(balAfter) ? undefined : balAfter,
          raw: data,
        };
      }
    }
  } catch {
    // Failover to web portal dispatch below
  }

  // Attempt 2: Web Session Portal Dispatch (Handles insufficient balance and portal fulfillment)
  try {
    const getRes = await fetch("https://vtushare.com.ng/login", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(10000),
    });
    const getHtml = await getRes.text();
    const cookies = getRes.headers.getSetCookie
      ? getRes.headers.getSetCookie()
      : [getRes.headers.get("set-cookie") || ""];
    const csrf = getHtml.match(/name="_token"\s+value="([^"]+)"/)?.[1];

    if (csrf) {
      const cookieMap: Record<string, string> = {};
      for (const c of cookies) {
        if (!c) continue;
        const [kv] = c.split(";");
        const [k, v] = kv.split("=");
        if (k && v) cookieMap[k.trim()] = v;
      }
      const cookieHeader = () =>
        Object.entries(cookieMap)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");

      const postRes = await fetch("https://vtushare.com.ng/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieHeader(),
          Referer: "https://vtushare.com.ng/login",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
        body: new URLSearchParams({
          _token: csrf,
          name: username || "zachariah",
          password,
        }).toString(),
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });

      const postCookies = postRes.headers.getSetCookie
        ? postRes.headers.getSetCookie()
        : [postRes.headers.get("set-cookie") || ""];
      for (const c of postCookies) {
        if (!c) continue;
        const [kv] = c.split(";");
        const [k, v] = kv.split("=");
        if (k && v) cookieMap[k.trim()] = v;
      }

      const dataPageRes = await fetch("https://vtushare.com.ng/data", {
        headers: {
          Cookie: cookieHeader(),
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
        signal: AbortSignal.timeout(10000),
      });
      const dataCookies = dataPageRes.headers.getSetCookie
        ? dataPageRes.headers.getSetCookie()
        : [dataPageRes.headers.get("set-cookie") || ""];
      for (const c of dataCookies) {
        if (!c) continue;
        const [kv] = c.split(";");
        const [k, v] = kv.split("=");
        if (k && v) cookieMap[k.trim()] = v;
      }
      const dataHtml = await dataPageRes.text();
      const sessionCsrf =
        dataHtml.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1] ||
        dataHtml.match(/name="_token"\s+value="([^"]+)"/)?.[1] ||
        csrf;

      // Detect if phone uses 0704 (Visafone migrated) or 0702 ported prefix
      const isPortedCandidate = normPhone.startsWith("0704") || normPhone.startsWith("0702");

      const purchaseRes = await fetch("https://vtushare.com.ng/data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader(),
          "X-CSRF-TOKEN": sessionCsrf,
          "X-Requested-With": "XMLHttpRequest",
          Referer: "https://vtushare.com.ng/data",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
        body: JSON.stringify({
          network: cleanNetwork,
          phone_number: normPhone,
          bundle: String(cleanBundle),
          type: String(cleanType),
          _token: sessionCsrf,
          Ported_number: isPortedCandidate,
        }),
        signal: AbortSignal.timeout(20000),
      });

      let webResult = (await purchaseRes.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      let rawStatus = String(webResult?.Status || webResult?.status || "").toLowerCase();
      let failMsg = String(webResult?.Msg || webResult?.message || webResult?.api_response || "");

      // If initial attempt hit service provider glitch, automatically retry with alternative ported routing
      if (
        (rawStatus === "failed" || rawStatus === "fail" || rawStatus === "error") &&
        (failMsg.toLowerCase().includes("service provider") ||
          failMsg.toLowerCase().includes("something has gotten wrong"))
      ) {
        console.log(
          `[VTUshare] Retrying with inverted Ported_number for ${normPhone} on bundle ${cleanBundle}...`,
        );
        try {
          const retryRes = await fetch("https://vtushare.com.ng/data", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: cookieHeader(),
              "X-CSRF-TOKEN": sessionCsrf,
              "X-Requested-With": "XMLHttpRequest",
              Referer: "https://vtushare.com.ng/data",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            },
            body: JSON.stringify({
              network: cleanNetwork,
              phone_number: normPhone,
              bundle: String(cleanBundle),
              type: String(cleanType),
              _token: sessionCsrf,
              Ported_number: !isPortedCandidate,
            }),
            signal: AbortSignal.timeout(20000),
          });
          const retryResult = (await retryRes.json().catch(() => null)) as Record<
            string,
            unknown
          > | null;
          if (retryResult) {
            const retryStatus = String(
              retryResult.Status || retryResult.status || "",
            ).toLowerCase();
            if (
              retryStatus === "success" ||
              retryStatus === "successful" ||
              retryStatus === "pending" ||
              retryStatus === "processing"
            ) {
              webResult = retryResult;
              rawStatus = retryStatus;
              failMsg = String(retryResult.Msg || retryResult.message || "");
            }
          }
        } catch {
          // ignore retry failure
        }
      }

      if (webResult) {
        const ref = String(webResult.id || webResult.reference || `vtu_${Date.now()}`);
        const charged =
          Number(webResult.paid_amount || webResult.plan_amount || webResult.amount || 0) ||
          undefined;
        const balAfter = Number(webResult.balance_after);

        if (!isNaN(balAfter)) {
          latestWalletBalance = balAfter;
          void updateStoredRewardConfig({ cachedBalance: balAfter }).catch(() => {});
        }

        if (rawStatus === "success" || rawStatus === "successful") {
          return {
            ok: true,
            status: "success",
            ref,
            message: String(webResult.Msg || "Data reward successfully delivered to MTN line."),
            chargedAmount: charged,
            balanceAfter: isNaN(balAfter) ? undefined : balAfter,
            raw: webResult,
          };
        }

        if (rawStatus === "pending" || rawStatus === "processing") {
          return {
            ok: true,
            status: "pending",
            ref,
            message: String(webResult.Msg || "Data delivery request submitted to telco gateway."),
            chargedAmount: charged,
            balanceAfter: isNaN(balAfter) ? undefined : balAfter,
            raw: webResult,
          };
        }

        if (rawStatus === "failed" || rawStatus === "fail" || rawStatus === "error") {
          const isServiceProviderError =
            failMsg.toLowerCase().includes("something has gotten wrong") ||
            failMsg.toLowerCase().includes("something has gone wrong") ||
            failMsg.toLowerCase().includes("something went wrong") ||
            failMsg.toLowerCase().includes("service provider") ||
            failMsg.toLowerCase().includes("glitch") ||
            failMsg.toLowerCase().includes("telco error");

          if (isServiceProviderError) {
            return {
              ok: false,
              status: "failed",
              ref,
              message:
                "VTUshare telco gateway reported a temporary upstream provider error for this plan. You can retry shortly, or switch to another data plan in Admin Settings.",
              raw: webResult,
            };
          }

          if (failMsg.toLowerCase().includes("insufficient balance")) {
            const curBalText =
              latestWalletBalance !== null
                ? ` (Current balance: ₦${latestWalletBalance.toLocaleString()})`
                : "";
            return {
              ok: false,
              status: "failed",
              ref: null,
              message: `Provider error: Insufficient balance on VTUshare wallet${curBalText}. Please top up your wallet on vtushare.com.ng to fulfill data rewards.`,
              raw: webResult,
            };
          }

          if (
            failMsg.includes("Trying to get property") ||
            failMsg.includes("non-object") ||
            failMsg.includes("system glitch")
          ) {
            return {
              ok: false,
              status: "failed",
              ref: null,
              message: "Provider plan mismatch: The requested bundle ID is inactive on VTUshare.",
              raw: webResult,
            };
          }

          return {
            ok: false,
            status: "failed",
            ref: null,
            message: failMsg || "VTUshare data purchase could not be completed.",
            raw: webResult,
          };
        }
      }
    }
  } catch (webErr) {
    console.warn("[VTUshare] Web session purchase error:", webErr);
  }

  // Safe fallback
  const curBalText =
    latestWalletBalance !== null
      ? ` Current balance: ₦${latestWalletBalance.toLocaleString()}.`
      : "";
  return {
    ok: false,
    status: "failed",
    ref: null,
    message: `VTUshare provider error: Telco gateway rejected data purchase.${curBalText}`,
  };
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
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...patch,
        updatedAt: updated.updatedAt,
      }),
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
      (t) =>
        t.status === "success" ||
        t.status === "processing" ||
        t.status === "pending" ||
        t.status === "pending_approval",
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

    const selectedPlan = config.selectedPlan || DEFAULT_MTN_PLANS[0];
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
      status: "pending_approval",
      createdAt: nowIso,
      updatedAt: nowIso,
      trustScore,
      fraudTier,
    };

    // Save initial state in pending_approval status
    await saveRewardTransaction(txRecord);

    return {
      ok: true,
      status: "pending_approval",
      txId: xoraTxId,
      message: "Your reward claim has been submitted and is pending admin approval.",
      maskedPhone: maskPhone(normPhone),
    };
  } finally {
    ACTIVE_CLAIM_LOCKS.delete(userId);
  }
}
