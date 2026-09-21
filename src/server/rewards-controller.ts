import { verifyAdminSession } from "./admin-auth";
import {
  claimUserReward,
  executeVtushareDataPurchase,
  fetchLiveVtushareBalance,
  getAllRewardTransactions,
  getStoredRewardConfig,
  getUserRewardTransactions,
  getVtushareCredentials,
  maskPhone,
  normalizeNigerianPhone,
  processVtushareWebhook,
  refreshVtusharePlans,
  saveRewardTransaction,
  updateStoredRewardConfig,
  type RewardTransaction,
} from "./vtushare-service";
import { queryRtdb } from "./xseries-service-account";

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

const jsonReply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });

export async function handleRewardsRoute(request: Request, url: URL): Promise<Response | null> {
  const pathname = url.pathname;

  // Handle CORS preflight
  if (
    request.method === "OPTIONS" &&
    (pathname.startsWith("/api/rewards") || pathname.startsWith("/api/admin/rewards"))
  ) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // ==============================================================
  // 1. PUBLIC / USER FACING REWARD ENDPOINTS
  // ==============================================================

  // GET /api/rewards/config
  if (pathname === "/api/rewards/config" && request.method === "GET") {
    try {
      const config = await getStoredRewardConfig();
      // Only expose safe public properties
      return jsonReply({
        ok: true,
        enabled: config.enabled,
        rewardDataSize: config.rewardDataSize,
        network: config.selectedPlan?.network || "MTN",
        planName: config.selectedPlan?.name || "MTN 1GB SME",
        maxRewardsPerUser: config.maxRewardsPerUser,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error reading reward config";
      return jsonReply({ ok: false, error: msg }, 500);
    }
  }

  // GET /api/rewards/user-status?userId=...
  if (pathname === "/api/rewards/user-status" && request.method === "GET") {
    try {
      const userId = url.searchParams.get("userId");
      if (!userId) {
        return jsonReply({ ok: false, error: "Missing userId parameter" }, 400);
      }

      const config = await getStoredRewardConfig();
      const transactions = await getUserRewardTransactions(userId);
      const successfulOrPending = transactions.filter(
        (t) => t.status === "success" || t.status === "processing" || t.status === "pending",
      );

      const hasReachedLimit = successfulOrPending.length >= config.maxRewardsPerUser;
      const latestClaim = transactions[0] || null;

      return jsonReply({
        ok: true,
        canClaim: config.enabled && !hasReachedLimit,
        hasReachedLimit,
        rewardDataSize: config.rewardDataSize,
        planName: config.selectedPlan?.name || "MTN 1GB Data",
        maxRewardsPerUser: config.maxRewardsPerUser,
        claimCount: successfulOrPending.length,
        transactions: transactions.map((t) => ({
          xoraTxId: t.xoraTxId,
          planName: t.planName,
          phoneMasked: t.phoneMasked,
          status: t.status,
          createdAt: t.createdAt,
          completedAt: t.completedAt,
        })),
        latestClaim: latestClaim
          ? {
              xoraTxId: latestClaim.xoraTxId,
              status: latestClaim.status,
              phoneMasked: latestClaim.phoneMasked,
              createdAt: latestClaim.createdAt,
              completedAt: latestClaim.completedAt,
            }
          : null,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "User reward status error";
      return jsonReply({ ok: false, error: msg }, 500);
    }
  }

  // POST /api/rewards/claim
  if (pathname === "/api/rewards/claim" && request.method === "POST") {
    try {
      const body = (await request.json().catch(() => null)) as {
        userId?: string;
        userEmail?: string;
        phone?: string;
        trustScore?: number;
        fraudTier?: number;
      } | null;

      if (!body?.userId || !body?.phone) {
        return jsonReply(
          {
            ok: false,
            status: "failed",
            message: "Missing user identifier or mobile phone number.",
          },
          400,
        );
      }

      const result = await claimUserReward({
        userId: body.userId,
        userEmail: body.userEmail,
        phone: body.phone,
        trustScore: typeof body.trustScore === "number" ? body.trustScore : 85,
        fraudTier: typeof body.fraudTier === "number" ? body.fraudTier : 0,
      });

      return jsonReply(result, result.ok ? 200 : 400);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Claim execution error";
      return jsonReply({ ok: false, status: "failed", message: msg }, 500);
    }
  }

  // GET /api/rewards/tx-status?txId=...
  if (pathname === "/api/rewards/tx-status" && request.method === "GET") {
    try {
      const txId = url.searchParams.get("txId");
      if (!txId) {
        return jsonReply({ ok: false, error: "Missing txId" }, 400);
      }

      const tx = (await queryRtdb(`rewardTransactions/${txId}`)) as RewardTransaction | null;
      if (!tx) {
        return jsonReply({ ok: false, error: "Transaction not found" }, 404);
      }

      let userFacingMessage = "Your reward is being processed.";
      if (tx.status === "success") {
        userFacingMessage = "Your data reward has been delivered.";
      } else if (tx.status === "failed") {
        userFacingMessage =
          "We couldn't deliver your reward. Your claim will be reviewed automatically.";
      }

      return jsonReply({
        ok: true,
        status: tx.status,
        message: userFacingMessage,
        tx: {
          xoraTxId: tx.xoraTxId,
          status: tx.status,
          planName: tx.planName,
          phoneMasked: tx.phoneMasked,
          createdAt: tx.createdAt,
          completedAt: tx.completedAt,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction status lookup error";
      return jsonReply({ ok: false, error: msg }, 500);
    }
  }

  // ==============================================================
  // 2. VTUSHARE WEBHOOK ENDPOINT
  // ==============================================================

  // POST /api/rewards/webhook/vtushare
  if (pathname === "/api/rewards/webhook/vtushare" && request.method === "POST") {
    try {
      const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!payload) {
        return jsonReply({ ok: false, message: "Invalid webhook JSON payload" }, 400);
      }

      console.log(
        "[VTUshare Webhook] Incoming callback:",
        JSON.stringify({
          ref: payload.ref,
          network: payload.network,
          status: payload.status,
          amount: payload.amount,
          receiver: payload.receiver ? maskPhone(String(payload.receiver)) : undefined,
        }),
      );

      const webhookRes = await processVtushareWebhook(payload);
      return jsonReply(webhookRes, 200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Webhook processing error";
      console.error("[VTUshare Webhook Error]:", err);
      return jsonReply({ ok: false, message: msg }, 500);
    }
  }

  // ==============================================================
  // 3. ADMIN-ONLY REWARDS MANAGEMENT ENDPOINTS
  // ==============================================================

  if (pathname.startsWith("/api/admin/rewards")) {
    const adminSession = verifyAdminSession(request);
    if (!adminSession) {
      return jsonReply(
        { ok: false, error: "Unauthorized: Sovereign admin session required." },
        401,
      );
    }

    // GET /api/admin/rewards/overview
    if (pathname === "/api/admin/rewards/overview" && request.method === "GET") {
      try {
        let config = await getStoredRewardConfig();
        const credentials = getVtushareCredentials();
        const transactions = await getAllRewardTransactions(100);

        // If balance has never been fetched, fetch live balance
        if (config.cachedBalance === null && credentials.isConfigured) {
          const balRes = await fetchLiveVtushareBalance();
          if (balRes.ok && balRes.balance !== null) {
            config = { ...config, cachedBalance: balRes.balance };
          }
        }

        const totalDelivered = transactions.filter((t) => t.status === "success").length;
        const totalPending = transactions.filter(
          (t) => t.status === "pending" || t.status === "processing",
        ).length;
        const totalFailed = transactions.filter((t) => t.status === "failed").length;
        const totalSpent = transactions
          .filter((t) => t.status === "success")
          .reduce((sum, t) => sum + (t.chargedAmount || t.expectedAmount || 0), 0);

        const isLowBalance =
          config.cachedBalance !== null && config.cachedBalance < config.minBalanceThreshold;

        return jsonReply({
          ok: true,
          config,
          provider: {
            name: "VTUshare",
            isConfigured: credentials.isConfigured,
            emailMasked: credentials.email
              ? credentials.email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
              : "Not set",
            cachedBalance: config.cachedBalance,
            isLowBalance,
            minBalanceThreshold: config.minBalanceThreshold,
          },
          metrics: {
            totalDelivered,
            totalPending,
            totalFailed,
            totalSpentNgn: totalSpent,
            transactionCount: transactions.length,
          },
          transactions: transactions.map((t) => ({
            ...t,
            // Mask actual phone in list for data privacy
            phoneDisplay: t.phoneMasked || maskPhone(t.phone),
          })),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Admin rewards overview error";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // POST /api/admin/rewards/check-balance
    if (pathname === "/api/admin/rewards/check-balance" && request.method === "POST") {
      try {
        const balRes = await fetchLiveVtushareBalance();
        return jsonReply(balRes);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Balance check error";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // POST /api/admin/rewards/config
    if (pathname === "/api/admin/rewards/config" && request.method === "POST") {
      try {
        const patch = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const updated = await updateStoredRewardConfig(patch);
        return jsonReply({ ok: true, config: updated });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Config update error";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // POST /api/admin/rewards/refresh-plans
    if (pathname === "/api/admin/rewards/refresh-plans" && request.method === "POST") {
      try {
        const plansRes = await refreshVtusharePlans();
        return jsonReply(plansRes);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Plan refresh error";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // POST /api/admin/rewards/test-transaction
    if (pathname === "/api/admin/rewards/test-transaction" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => null)) as {
          phone?: string;
          bundle?: string;
          type?: string;
        } | null;

        if (!body?.phone) {
          return jsonReply({ ok: false, message: "Phone number required for test purchase" }, 400);
        }

        const norm = normalizeNigerianPhone(body.phone);
        const config = await getStoredRewardConfig();
        const bundle = body.bundle || config.selectedPlan?.bundle || "990";
        const type = body.type || config.selectedPlan?.type || "25";

        const testRes = await executeVtushareDataPurchase({
          phone: norm,
          bundle,
          type,
          network: config.selectedPlan?.networkId || "2",
        });

        // Record test transaction
        const xoraTxId = `test_${Date.now()}`;
        const txRecord: RewardTransaction = {
          xoraTxId,
          userId: "admin_test",
          phone: norm,
          phoneMasked: maskPhone(norm),
          provider: "vtushare",
          network: "MTN",
          bundle,
          type,
          planName: `MTN ${bundle} (Admin Test)`,
          expectedAmount: 135,
          chargedAmount: testRes.chargedAmount,
          vtushareRef: testRes.ref,
          status: testRes.status,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: testRes.status === "success" ? new Date().toISOString() : null,
          errorMessage: testRes.ok ? null : testRes.message,
        };

        await saveRewardTransaction(txRecord);

        return jsonReply({
          ok: testRes.ok,
          status: testRes.status,
          ref: testRes.ref,
          message: testRes.message,
          balanceAfter: testRes.balanceAfter,
          xoraTxId,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Test transaction failed";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }
  }

  return null;
}
