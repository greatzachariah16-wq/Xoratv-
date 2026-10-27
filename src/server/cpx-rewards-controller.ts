import crypto from "node:crypto";
import { getAuthenticatedUserId } from "./session-auth";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ygifyoaraxtwixbyranq.supabase.co").replace(/\/$/, "");
const SUPABASE_KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const CASH_THRESHOLD_USD = 0.05;
const CASH_REWARD_NGN = 10;
const POINTS_PER_USD = Math.max(0, Number(process.env.XORA_CPA_POINTS_PER_USD || 100));
const LIVE_REWARDS_ENABLED = process.env.CPX_LIVE_REWARDS_ENABLED === "true";

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

async function supabaseRequest(table: string, query: string, method = "GET", body?: unknown, prefer?: string): Promise<any> {
  if (!SUPABASE_KEY) throw new Error("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${table} ${method} failed (HTTP ${response.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}
async function applyExistingWalletReward(params: {
  transId: string; userId: string; status: string; type: string; offerId: string | null;
  amountUsd: number; amountLocal: number;
}) {
  const { transId, userId, status, type, offerId, amountUsd, amountLocal } = params;
  const ledgerPath = `commerce/cpxResearchTransactions/${encodeURIComponent(transId)}`;
  const prior = await queryRtdb(ledgerPath) as any;
  if (prior && String(prior.status) === status) return { duplicate: true, status, wallet: "existing" };
  const completed = status === "1" && type === "complete";
  const cash = completed && amountUsd >= CASH_THRESHOLD_USD ? CASH_REWARD_NGN : 0;
  const points = completed ? Math.max(0, Math.round(amountUsd * POINTS_PER_USD)) : 0;
  const reversing = Boolean(prior && String(prior.status) === "1" && status === "2");
  const reverseCash = reversing ? Number(prior.cashRewardNgn || 0) : 0;
  const reversePoints = reversing ? Number(prior.pointsReward || 0) : 0;
  const now = new Date().toISOString();

  if (cash || reverseCash) {
    const walletPath = `commerce/surveyWallets/${encodeURIComponent(userId)}`;
    const wallet = await queryRtdb(walletPath) as any || {};
    const transactions = wallet.transactions && typeof wallet.transactions === "object" ? wallet.transactions : {};
    const txId = `cpx_${crypto.createHash("sha256").update(transId).digest("hex").slice(0, 24)}`;
    const delta = cash - reverseCash;
    const nextBalance = Math.round((Number(wallet.balance || 0) + delta) * 100) / 100;
    if (nextBalance < 0) throw new Error("Existing survey wallet balance is insufficient for CPX reversal.");
    await queryRtdb(walletPath, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      ...wallet, userId, currency: "NGN", balance: nextBalance,
      lifetimeEarned: Number(wallet.lifetimeEarned || 0) + (cash > 0 ? cash : 0),
      transactions: { ...transactions, [txId]: {
        id: txId, type: reversing ? "survey_reward_reversal" : "survey_reward",
        amount: delta, currency: "NGN", status: reversing ? "reversed" : "successful",
        reference: `cpx-${transId}`, description: reversing ? "CPX Research reward reversal" : "CPX Research survey reward",
        createdAt: now, providerReference: transId,
      } }, updatedAt: now,
    }) });
  }

  if (points || reversePoints) {
    const pointsPath = `commerce/cpaUsers/${encodeURIComponent(userId)}`;
    const account = await queryRtdb(pointsPath) as any || { userId, trackingId: "", points: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 };
    const nextPoints = Math.max(0, Number(account.points || 0) + points - reversePoints);
    await queryRtdb(pointsPath, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      ...account, userId, points: nextPoints,
      lifetimeEarned: Number(account.lifetimeEarned || 0) + points,
      updatedAt: now,
    }) });
  }

  await queryRtdb(ledgerPath, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    transactionId: transId, userId, status, type, offerId, publisherRevenueUsd: amountUsd,
    localAmount: amountLocal, cashRewardNgn: cash, pointsReward: points,
    reversed: reversing, createdAt: prior?.createdAt || now, updatedAt: now,
  }) });
  return { duplicate: false, wallet: "existing", cashRewardNgn: cash, pointsReward: points, reversed: reversing };
}

async function readTransaction(transId: string): Promise<any | null> {
  const rows = await supabaseRequest("cpx_test_transactions", new URLSearchParams({ select: "*", transaction_id: `eq.${transId}`, limit: "1" }).toString());
  const row = rows?.[0];
  if (!row) return null;
  return {
    transactionId: row.transaction_id, transactionKey: row.transaction_key, userId: row.user_id,
    status: row.status, type: row.type, offerId: row.offer_id, subId: row.sub_id, subId2: row.sub_id2,
    publisherRevenueUsd: Number(row.publisher_revenue_usd), localAmount: Number(row.local_amount),
    simulatedCashRewardNgn: Number(row.simulated_cash_reward_ngn), simulatedPoints: Number(row.simulated_points),
    previousStatus: row.previous_status, reversalDetected: row.reversal_detected,
    testWalletBalanceAfter: row.test_wallet_balance_after, liveWalletCredited: row.live_wallet_credited,
    mode: row.mode, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
async function readWallet(userId: string): Promise<any | null> {
  const rows = await supabaseRequest("cpx_test_wallets", new URLSearchParams({ select: "*", user_id: `eq.${userId}`, limit: "1" }).toString());
  const row = rows?.[0];
  return row ? { userId: row.user_id, simulatedCashBalanceNgn: Number(row.simulated_cash_balance_ngn), simulatedPointsBalance: Number(row.simulated_points_balance), updatedAt: row.updated_at, mode: row.mode } : null;
}
async function writeEvent(record: Record<string, any>) {
  await supabaseRequest("cpx_test_events", "", "POST", {
    event_id: record.eventId, transaction_id: record.transactionId, user_id: record.userId,
    status: record.status, mode: "test-only", event_payload: record,
  }, "return=minimal");
}
async function writeTransaction(record: Record<string, any>) {
  await supabaseRequest("cpx_test_transactions", "on_conflict=transaction_id", "POST", {
    transaction_id: record.transactionId, transaction_key: record.transactionKey, user_id: record.userId,
    status: record.status, type: record.type, offer_id: record.offerId, sub_id: record.subId, sub_id2: record.subId2,
    publisher_revenue_usd: record.publisherRevenueUsd, local_amount: record.localAmount,
    simulated_cash_reward_ngn: record.simulatedCashRewardNgn, simulated_points: record.simulatedPoints,
    previous_status: record.previousStatus, reversal_detected: record.reversalDetected,
    test_wallet_balance_after: record.testWalletBalanceAfter, live_wallet_credited: false,
    mode: "test-only", created_at: record.createdAt, updated_at: record.updatedAt,
  }, "resolution=merge-duplicates,return=minimal");
}
async function writeWallet(wallet: Record<string, any>) {
  await supabaseRequest("cpx_test_wallets", "on_conflict=user_id", "POST", {
    user_id: wallet.userId, simulated_cash_balance_ngn: wallet.simulatedCashBalanceNgn,
    simulated_points_balance: wallet.simulatedPointsBalance, mode: "test-only", updated_at: wallet.updatedAt,
  }, "resolution=merge-duplicates,return=minimal");
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

  if (url.pathname === "/api/cpx/rewards/balance" && request.method === "GET") {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) return json({ ok: false, error: "Sign in to view your CPX rewards." }, 401);
    try {
      const [surveyWallet, pointsAccount] = await Promise.all([
        queryRtdb(`commerce/surveyWallets/${encodeURIComponent(userId)}`) as Promise<any>,
        queryRtdb(`commerce/cpaUsers/${encodeURIComponent(userId)}`) as Promise<any>,
      ]);
      return json({
        ok: true,
        source: "existing-xora-wallets",
        wallet: {
          cashBalanceNgn: Number(surveyWallet?.balance || 0),
          pointsBalance: Number(pointsAccount?.points || 0),
          lifetimePointsEarned: Number(pointsAccount?.lifetimeEarned || 0),
          updatedAt: surveyWallet?.updatedAt || pointsAccount?.updatedAt || null,
        },
      }, 200);
    } catch (error) {
      console.error("[CPX Rewards] Existing wallet lookup failed", error instanceof Error ? error.message : error);
      return json({ ok: false, error: "Could not load your Xora rewards balance." }, 502);
    }
  }

  if (url.pathname === "/api/cpx/rewards/status" && request.method === "GET") {
    return json({
      ok: true,
      mode: LIVE_REWARDS_ENABLED ? "live-enabled" : "test-existing-wallet",
      liveWalletCreditsEnabled: LIVE_REWARDS_ENABLED,
      testUsesExistingWallet: true,
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
  {
    try {
      const result = await applyExistingWalletReward({
        transId, userId, status, type, offerId: offerId || null, amountUsd, amountLocal,
      });
      return json({ ok: true, mode: LIVE_REWARDS_ENABLED ? "live" : "test-existing-wallet", trans_id: transId, existingWalletCredited: true, result });
    } catch (error) {
      console.error("[CPX Rewards] Existing wallet callback failed", { transId, error: error instanceof Error ? error.message : String(error) });
      return json({ ok: false, error: "CPX reward could not be applied to the existing Xora wallet; callback may be retried." }, 500);
    }
  }

  const existing = await readTransaction(transId);
  const now = new Date().toISOString();

  // Repeated callbacks are expected. An identical status is acknowledged without
  // adding another reward; a later status=2 is retained as a reversal event.
  if (existing && String(existing.status) === status) {
    console.info("[CPX Rewards] Duplicate callback acknowledged", {
      transId,
      status,
      mode: "test-only",
      alreadyRecorded: true,
    });
    return json({ ok: true, duplicate: true, mode: "test-only", liveWalletCredited: false, trans_id: transId });
  }

  const isFullCompletion = type === "complete" && status === "1";
  const cashRewardNgn = isFullCompletion && amountUsd >= CASH_THRESHOLD_USD ? CASH_REWARD_NGN : 0;
  const points = isFullCompletion ? Math.max(0, Math.round(amountUsd * POINTS_PER_USD)) : 0;
  // Test credits live only in this isolated ledger. They never touch the user's
  // production wallet or production Xora Points balance.
  const walletPath = "Supabase: cpx_test_wallets";
  const testWallet = await readWallet(userId) || {
    userId,
    simulatedCashBalanceNgn: 0,
    simulatedPointsBalance: 0,
  };
  const previousCash = Number(testWallet.simulatedCashBalanceNgn) || 0;
  const previousPoints = Number(testWallet.simulatedPointsBalance) || 0;
  const reversalCash = existing && String(existing.status) === "1" && status === "2"
    ? Number(existing.simulatedCashRewardNgn) || 0
    : 0;
  const reversalPoints = existing && String(existing.status) === "1" && status === "2"
    ? Number(existing.simulatedPoints) || 0
    : 0;
  const nextTestWallet = {
    userId,
    simulatedCashBalanceNgn: Math.max(0, previousCash + cashRewardNgn - reversalCash),
    simulatedPointsBalance: Math.max(0, previousPoints + points - reversalPoints),
    updatedAt: new Date().toISOString(),
    mode: "test-only",
  };
  const record: Record<string, any> = {
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
    testWalletPath: walletPath,
    testWalletBalanceAfter: {
      simulatedCashBalanceNgn: nextTestWallet.simulatedCashBalanceNgn,
      simulatedPointsBalance: nextTestWallet.simulatedPointsBalance,
    },
    liveWalletCredited: false,
    mode: "test-only",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  // Keep an append-only callback audit and a latest-state transaction index.
  const eventId = `${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
  try {
    await writeEvent({ ...record, eventId });
    await writeTransaction(record);
    await writeWallet(nextTestWallet);
  } catch (error) {
    console.error("[CPX Rewards] Test callback ledger write failed", {
      transId,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ ok: false, error: "CPX test callback could not be recorded." }, 500);
  }
  console.info("[CPX Rewards] Test callback recorded and simulated credit applied", {
    transId,
    userId,
    status,
    type,
    publisherRevenueUsd: record.publisherRevenueUsd,
    simulatedCashRewardNgn: cashRewardNgn,
    simulatedPoints: points,
    testWalletBalanceAfter: record.testWalletBalanceAfter,
    reversalDetected: record.reversalDetected,
    liveWalletCredited: false,
    mode: "test-only",
  });
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
      testWalletBalanceAfter: record.testWalletBalanceAfter,
      reversalDetected: record.reversalDetected,
      liveWalletCredited: false,
    },
  });
}
