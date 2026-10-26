import crypto from "node:crypto";
import { queryRtdb } from "./xseries-service-account";
import { getAuthenticatedUserId } from "./session-auth";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const TEST_ROOT = "commerce/cpxRewardsTest";
const CASH_THRESHOLD_USD = 0.05;
const CASH_REWARD_NGN = 10;
const POINTS_PER_USD = 700;

function safeEqualHex(a: string, b: string) {
  if (!/^[a-f0-9]{32}$/i.test(a) || !/^[a-f0-9]{32}$/i.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a.toLowerCase(), "hex"), Buffer.from(b.toLowerCase(), "hex"));
}

function getSecureHash() {
  return (process.env.CPX_SECURE_HASH || "").trim();
}

function getExpectedHash(transId: string, secret: string) {
  return crypto.createHash("md5").update(`${transId}-${secret}`).digest("hex");
}

async function read(path: string): Promise<any> {
  return (await queryRtdb(path)) || null;
}
async function write(path: string, value: unknown) {
  await queryRtdb(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

/**
 * CPX Research rewards postback. This first rollout deliberately records only
 * to a test ledger: it must not change the live NGN survey wallet or Xora Points.
 */
export async function handleCpxRewardsRoute(request: Request, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/cpx/rewards")) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });

  if (url.pathname === "/api/cpx/rewards/surveys" && request.method === "GET") {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) return json({ ok: false, error: "Sign in to view CPX Research surveys." }, 401);
    const secret = getSecureHash();
    const appId = (process.env.CPX_APP_ID || "").trim();
    if (!secret || !appId) return json({ ok: false, error: "CPX Research server credentials are not configured." }, 503);

    try {
      const secureHash = crypto.createHash("md5").update(`${userId}-${secret}`).digest("hex");
      const apiUrl = new URL("https://live-api.cpx-research.com/api/get-surveys.php");
      apiUrl.searchParams.set("app_id", appId);
      apiUrl.searchParams.set("ext_user_id", userId);
      apiUrl.searchParams.set("output_method", "api");
      apiUrl.searchParams.set("secure_hash", secureHash);
      apiUrl.searchParams.set("limit", "12");
      const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      if (forwardedIp) apiUrl.searchParams.set("ip_user", forwardedIp);
      const userAgent = request.headers.get("user-agent");
      if (userAgent) apiUrl.searchParams.set("user_agent", userAgent);

      const response = await fetch(apiUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return json({ ok: false, error: "CPX Research survey service is temporarily unavailable." }, 502);
      const payload = await response.json() as any;
      const surveys = Array.isArray(payload) ? payload : Array.isArray(payload?.surveys) ? payload.surveys : [];
      return new Response(JSON.stringify({ ok: true, surveys, fetchedAt: new Date().toISOString() }), {
        status: 200,
        headers: { ...HEADERS, "Cache-Control": "private, max-age=120" },
      });
    } catch (error) {
      console.error("[CPX Rewards] Survey lookup failed:", error instanceof Error ? error.message : error);
      return json({ ok: false, error: "Could not load CPX Research surveys right now." }, 502);
    }
  }

  if (url.pathname === "/api/cpx/rewards/status" && request.method === "GET") {
    return json({
      ok: true,
      mode: "test-only",
      liveWalletCreditsEnabled: false,
      appIdConfigured: Boolean(process.env.CPX_APP_ID),
      secureHashConfigured: Boolean(getSecureHash()),
      cashThresholdUsd: CASH_THRESHOLD_USD,
      cashRewardNgn: CASH_REWARD_NGN,
      pointsPerUsd: POINTS_PER_USD,
    });
  }

  if (url.pathname !== "/api/cpx/rewards/postback" || request.method !== "GET") {
    return json({ ok: false, error: "Not found." }, 404);
  }

  const secret = getSecureHash();
  if (!secret || !process.env.CPX_APP_ID?.trim()) {
    return json({ ok: false, error: "CPX Research server credentials are not configured." }, 503);
  }

  const params = url.searchParams;
  const status = String(params.get("status") || "");
  const transId = String(params.get("trans_id") || "").trim();
  const userId = String(params.get("user_id") || "").trim();
  const hash = String(params.get("hash") || "").trim();
  const type = String(params.get("type") || "complete").trim().toLowerCase();
  const amountUsd = Number(params.get("amount_usd") || 0);
  const amountLocal = Number(params.get("amount_local") || 0);
  const offerId = String(params.get("offer_id") || "").trim();
  const subId = String(params.get("sub_id") || params.get("subid_1") || "").trim();
  const subId2 = String(params.get("sub_id_2") || params.get("subid_2") || "").trim();

  if (!transId || transId.length > 250 || !userId || userId.length > 160 || !hash) {
    return json({ ok: false, error: "Missing or invalid required postback fields." }, 400);
  }
  if (!safeEqualHex(hash, getExpectedHash(transId, secret))) {
    return json({ ok: false, error: "Invalid CPX postback signature." }, 401);
  }
  if (!["1", "2"].includes(status)) {
    return json({ ok: false, error: "Unsupported CPX status." }, 400);
  }
  if (!Number.isFinite(amountUsd) || amountUsd < 0 || !Number.isFinite(amountLocal) || amountLocal < 0) {
    return json({ ok: false, error: "Invalid CPX revenue amount." }, 400);
  }

  const transactionKey = crypto.createHash("sha256").update(transId).digest("hex");
  const transactionPath = `${TEST_ROOT}/transactions/${transactionKey}`;
  const existing = await read(transactionPath);
  const now = new Date().toISOString();

  // Repeated callbacks are expected. An identical status is acknowledged without
  // adding another reward; a later status=2 is retained as a reversal event.
  if (existing && String(existing.status) === status) {
    return json({ ok: true, duplicate: true, mode: LIVE_ENABLED() ? "live" : "disabled", trans_id: transId });
  }

  const isFullCompletion = type === "complete" && status === "1";
  const cashRewardNgn = isFullCompletion && amountUsd >= CASH_THRESHOLD_USD ? CASH_REWARD_NGN : 0;
  const points = isFullCompletion ? Math.max(0, Math.round(amountUsd * POINTS_PER_USD)) : 0;
  const record = {
    transactionId: transId,
    transactionKey,
    userId,
    status,
    type,
    offerId: offerId || null,
    subId: subId || null,
    subId2: subId2 || null,
    publisherRevenueUsd: Math.round(amountUsd * 10000) / 10000,
    localAmount: Math.round(amountLocal * 100) / 100,
    simulatedCashRewardNgn: cashRewardNgn,
    simulatedPoints: points,
    previousStatus: existing?.status ?? null,
    reversalDetected: Boolean(existing && existing.status === "1" && status === "2"),
    liveWalletCredited: false,
    mode: "test-only",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  // Keep an append-only callback audit and a latest-state transaction index.
  const eventId = `${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
  await write(`${TEST_ROOT}/events/${eventId}`, { ...record, eventId });
  await write(transactionPath, record);
  return json({
    ok: true,
    mode: "test-only",
    duplicate: false,
    transaction: {
      trans_id: transId,
      status,
      type,
      simulatedCashRewardNgn: cashRewardNgn,
      simulatedPoints: points,
      reversalDetected: record.reversalDetected,
      liveWalletCredited: false,
    },
  });
}
