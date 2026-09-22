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
import {
  getEngagementRules,
  saveEngagementRules,
  startEngagementSession,
  processEngagementHeartbeat,
  getUserEngagementStatus,
  forceRotateUserPeriod,
  getEngagementAlerts,
  resolveEngagementAlert,
  getEngagementDashboardAnalytics,
  recordPeriodClaim,
  recordUserEngagementAction,
} from "./engagement-controller";
import type { WatchHeartbeatPayload } from "@/lib/fraud-guard/types";

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
    (pathname.startsWith("/api/rewards") ||
      pathname.startsWith("/api/admin/rewards") ||
      pathname.startsWith("/api/engagement") ||
      pathname.startsWith("/api/admin/engagement") ||
      pathname.startsWith("/api/admin/fraud"))
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
        (t) =>
          t.status === "success" ||
          t.status === "processing" ||
          t.status === "pending" ||
          t.status === "pending_approval",
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

      // Check if user is restricted
      const restrictionCheck = (await queryRtdb(`restrictedUsers/${body.userId}`)) as {
        restrictedAt: string;
        reason: string;
      } | null;
      if (restrictionCheck) {
        return jsonReply(
          {
            ok: false,
            status: "failed",
            message: `Your account is restricted. Reason: ${restrictionCheck.reason}`,
          },
          403,
        );
      }

      // Check real production engagement eligibility and trust score first!
      const engStatus = await getUserEngagementStatus(body.userId);
      if (!engStatus.eligibility.eligibleToClaim) {
        return jsonReply(
          {
            ok: false,
            status: "failed",
            message:
              engStatus.eligibility.ineligibilityReason ||
              "You have not met the engagement criteria to claim this reward.",
          },
          400,
        );
      }

      // Retrieve actual trust score and risk tier from engagement evaluation
      const trustScore = engStatus.eligibility.trustScore;
      const fraudTier =
        engStatus.eligibility.riskLevel === "critical"
          ? 3
          : engStatus.eligibility.riskLevel === "high"
            ? 2
            : 0;

      const result = await claimUserReward({
        userId: body.userId,
        userEmail: body.userEmail,
        phone: body.phone,
        trustScore,
        fraudTier,
      });

      // If successful, register claim inside current period
      if (result.ok && result.status === "success") {
        await recordPeriodClaim(body.userId);
      }

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
  // USER FACING ENGAGEMENT ENDPOINTS
  // ==============================================================

  // GET /api/engagement/rules
  if (pathname === "/api/engagement/rules" && request.method === "GET") {
    try {
      const rules = await getEngagementRules();
      return jsonReply({ ok: true, rules });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error fetching engagement rules";
      return jsonReply({ ok: false, error: msg }, 500);
    }
  }

  // GET /api/engagement/user-status?userId=...
  if (pathname === "/api/engagement/user-status" && request.method === "GET") {
    try {
      const userId = url.searchParams.get("userId");
      if (!userId) {
        return jsonReply({ ok: false, error: "Missing userId parameter" }, 400);
      }
      const status = await getUserEngagementStatus(userId);
      return jsonReply(status);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error fetching engagement status";
      return jsonReply({ ok: false, error: msg }, 500);
    }
  }

  // POST /api/engagement/start-session
  if (pathname === "/api/engagement/start-session" && request.method === "POST") {
    try {
      const body = (await request.json().catch(() => null)) as {
        userId?: string;
        videoId?: string;
        deviceFingerprintId?: string;
        clientIp?: string;
      } | null;

      if (!body?.userId || !body?.videoId || !body?.deviceFingerprintId) {
        return jsonReply(
          {
            ok: false,
            error: "Missing required parameters (userId, videoId, deviceFingerprintId)",
          },
          400,
        );
      }

      // Check if user is restricted
      const restrictionCheck = (await queryRtdb(`restrictedUsers/${body.userId}`)) as {
        restrictedAt: string;
        reason: string;
      } | null;
      if (restrictionCheck) {
        return jsonReply(
          {
            ok: false,
            error: `Your account is restricted. Reason: ${restrictionCheck.reason}`,
          },
          403,
        );
      }

      const clientIp = body.clientIp || request.headers.get("x-forwarded-for") || "127.0.0.1";
      const session = await startEngagementSession({
        userId: body.userId,
        videoId: body.videoId,
        deviceFingerprintId: body.deviceFingerprintId,
        clientIp,
      });

      return jsonReply({ ok: true, ...session });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error starting engagement session";
      return jsonReply({ ok: false, error: msg }, 500);
    }
  }

  // POST /api/engagement/heartbeat
  if (pathname === "/api/engagement/heartbeat" && request.method === "POST") {
    try {
      const body = (await request.json().catch(() => null)) as WatchHeartbeatPayload | null;

      if (!body?.sessionId || !body?.nonce || !body?.accountId || !body?.deviceFingerprintId) {
        return jsonReply(
          { ok: false, error: "Missing required heartbeat payload parameters" },
          400,
        );
      }

      // Check if user is restricted
      const restrictionCheck = (await queryRtdb(`restrictedUsers/${body.accountId}`)) as {
        restrictedAt: string;
        reason: string;
      } | null;
      if (restrictionCheck) {
        return jsonReply(
          {
            ok: false,
            error: `Your account is restricted. Reason: ${restrictionCheck.reason}`,
          },
          403,
        );
      }

      if (!body.clientIp) {
        body.clientIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
      }

      const result = await processEngagementHeartbeat(body);
      return jsonReply({ ok: true, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error processing heartbeat";
      return jsonReply({ ok: false, error: msg }, 500);
    }
  }

  // POST /api/engagement/action (like, follow, comment, share)
  if (pathname === "/api/engagement/action" && request.method === "POST") {
    try {
      const body = (await request.json().catch(() => null)) as {
        userId?: string;
        type?: "like" | "follow" | "comment" | "share";
        targetId?: string;
      } | null;

      if (!body?.userId || !body?.type) {
        return jsonReply({ ok: false, error: "Missing userId or action type" }, 400);
      }

      const result = await recordUserEngagementAction(body.userId, body.type, body.targetId);
      return jsonReply({ ok: true, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error recording engagement action";
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
    if (!adminSession.valid) {
      return jsonReply(
        {
          ok: false,
          error: adminSession.error || "Unauthorized: Sovereign admin session required.",
        },
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

    // POST /api/admin/rewards/approve
    if (pathname === "/api/admin/rewards/approve" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => null)) as { xoraTxId?: string } | null;
        if (!body?.xoraTxId) {
          return jsonReply({ ok: false, error: "Transaction ID (xoraTxId) is required." }, 400);
        }

        const txId = body.xoraTxId;
        const tx = (await queryRtdb(`rewardTransactions/${txId}`)) as RewardTransaction | null;
        if (!tx) {
          return jsonReply({ ok: false, error: "Transaction not found." }, 404);
        }

        if (tx.status !== "pending_approval") {
          return jsonReply(
            { ok: false, error: `Transaction cannot be approved from status: ${tx.status}` },
            400,
          );
        }

        // Run purchase
        const purchaseRes = await executeVtushareDataPurchase({
          phone: tx.phone,
          bundle: tx.bundle,
          type: tx.type,
          network: "2", // MTN
        });

        tx.vtushareRef = purchaseRes.ref;
        tx.status = purchaseRes.status;
        tx.updatedAt = new Date().toISOString();
        tx.errorMessage = purchaseRes.ok ? null : purchaseRes.message;
        if (purchaseRes.chargedAmount) tx.chargedAmount = purchaseRes.chargedAmount;
        if (purchaseRes.status === "success") {
          tx.completedAt = new Date().toISOString();
          // Record active claim count inside the current period since delivery is confirmed
          await recordPeriodClaim(tx.userId);
        }

        await saveRewardTransaction(tx);

        return jsonReply({
          ok: purchaseRes.ok,
          status: purchaseRes.status,
          message: purchaseRes.message || "Purchase completed.",
          txId: tx.xoraTxId,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Approval execution failed";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // POST /api/admin/rewards/reject
    if (pathname === "/api/admin/rewards/reject" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => null)) as {
          xoraTxId?: string;
          reason?: string;
        } | null;
        if (!body?.xoraTxId) {
          return jsonReply({ ok: false, error: "Transaction ID (xoraTxId) is required." }, 400);
        }

        const txId = body.xoraTxId;
        const tx = (await queryRtdb(`rewardTransactions/${txId}`)) as RewardTransaction | null;
        if (!tx) {
          return jsonReply({ ok: false, error: "Transaction not found." }, 404);
        }

        if (tx.status !== "pending_approval") {
          return jsonReply(
            { ok: false, error: `Transaction cannot be rejected from status: ${tx.status}` },
            400,
          );
        }

        tx.status = "failed";
        tx.errorMessage = body.reason || "Rejected by administrator.";
        tx.updatedAt = new Date().toISOString();

        await saveRewardTransaction(tx);

        return jsonReply({
          ok: true,
          status: "failed",
          message: "Transaction successfully rejected.",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Rejection failed";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }
  }

  // ==============================================================
  // ADMIN-ONLY FRAUD ENFORCEMENT ENDPOINTS
  // ==============================================================
  if (pathname.startsWith("/api/admin/fraud")) {
    const adminSession = verifyAdminSession(request);
    if (!adminSession.valid) {
      return jsonReply(
        {
          ok: false,
          error: adminSession.error || "Unauthorized: Sovereign admin session required.",
        },
        401,
      );
    }

    // GET /api/admin/fraud/account-devices
    if (pathname === "/api/admin/fraud/account-devices" && request.method === "GET") {
      try {
        const data = (await queryRtdb("accountDevices")) as Record<
          string,
          Record<string, Record<string, { lastSeenAt: string; email: string | null }>>
        > | null;
        const restrictions = (await queryRtdb("restrictedUsers")) as Record<
          string,
          { restrictedAt: string; reason: string }
        > | null;

        // Let's transform this into a list of accounts and their device sharing for today
        const list: Array<{
          userId: string;
          email: string | null;
          devices: Array<{ deviceId: string; lastSeenAt: string }>;
          deviceCount: number;
          isRestricted: boolean;
          restrictionReason?: string;
        }> = [];

        if (data) {
          const todayIso = new Date().toISOString().slice(0, 10);
          for (const [userId, dateMap] of Object.entries(data)) {
            const todayDevices = dateMap[todayIso];
            if (todayDevices) {
              const devices = Object.entries(todayDevices).map(([deviceId, details]) => ({
                deviceId,
                lastSeenAt: details.lastSeenAt,
              }));

              // Find email from details
              const firstWithEmail = Object.values(todayDevices).find((d) => d.email);
              const email = firstWithEmail ? firstWithEmail.email : null;

              const isRestricted = Boolean(restrictions?.[userId]);
              const restrictionReason = restrictions?.[userId]?.reason;

              list.push({
                userId,
                email,
                devices,
                deviceCount: devices.length,
                isRestricted,
                restrictionReason,
              });
            }
          }
        }

        // Sort so that accounts with more devices come first (most suspicious first)
        list.sort((a, b) => b.deviceCount - a.deviceCount);

        return jsonReply({ ok: true, records: list });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error fetching account devices";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // POST /api/admin/fraud/restrict-account
    if (pathname === "/api/admin/fraud/restrict-account" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => null)) as {
          userId?: string;
          reason?: string;
        } | null;
        if (!body?.userId) {
          return jsonReply({ ok: false, error: "Missing required parameter: userId" }, 400);
        }

        const reason = body.reason || "Admin closed due to multi-device access sharing.";
        const nowIso = new Date().toISOString();

        // Save to restrictedUsers
        const headers = { "Content-Type": "application/json" };
        await queryRtdb(`restrictedUsers/${body.userId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ restrictedAt: nowIso, reason }),
        });

        return jsonReply({ ok: true, message: `Account ${body.userId} successfully restricted.` });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error restricting account";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // POST /api/admin/fraud/unrestrict-account
    if (pathname === "/api/admin/fraud/unrestrict-account" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => null)) as { userId?: string } | null;
        if (!body?.userId) {
          return jsonReply({ ok: false, error: "Missing required parameter: userId" }, 400);
        }

        // Delete from restrictedUsers
        await queryRtdb(`restrictedUsers/${body.userId}`, {
          method: "DELETE",
        });

        return jsonReply({
          ok: true,
          message: `Account ${body.userId} successfully unrestricted.`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error unrestricting account";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // POST /api/admin/fraud/notify-user
    if (pathname === "/api/admin/fraud/notify-user" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => null)) as {
          userId?: string;
          message?: string;
        } | null;
        if (!body?.userId || !body?.message) {
          return jsonReply(
            { ok: false, error: "Missing required parameters: userId or message" },
            400,
          );
        }

        const notifId = `notif_warn_${Date.now()}`;
        const nowIso = new Date().toISOString();

        const notif = {
          id: notifId,
          title: "Sovereign Security Warning",
          body: body.message,
          type: "warning",
          read: false,
          createdAt: nowIso,
        };

        const headers = { "Content-Type": "application/json" };
        await queryRtdb(`notifications/${body.userId}/${notifId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(notif),
        });

        return jsonReply({
          ok: true,
          message: `Warning notification dispatched to user ${body.userId}.`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error dispatching warning notification";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }
  }

  // ==============================================================
  // ADMIN-ONLY ENGAGEMENT ENDPOINTS
  // ==============================================================
  if (pathname.startsWith("/api/admin/engagement")) {
    const adminSession = verifyAdminSession(request);
    if (!adminSession.valid) {
      return jsonReply(
        {
          ok: false,
          error: adminSession.error || "Unauthorized: Sovereign admin session required.",
        },
        401,
      );
    }

    // POST /api/admin/engagement/rules
    if (pathname === "/api/admin/engagement/rules" && request.method === "POST") {
      try {
        const patch = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const rules = await saveEngagementRules(patch);
        return jsonReply({ ok: true, rules });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error updating engagement rules";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // GET /api/admin/engagement/alerts
    if (pathname === "/api/admin/engagement/alerts" && request.method === "GET") {
      try {
        const alerts = await getEngagementAlerts();
        return jsonReply({ ok: true, alerts });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error fetching engagement alerts";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // POST /api/admin/engagement/alerts/resolve
    if (pathname === "/api/admin/engagement/alerts/resolve" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => null)) as {
          alertId?: string;
          status?: "resolved_safe" | "resolved_restricted";
          notes?: string;
        } | null;

        if (!body?.alertId || !body?.status) {
          return jsonReply(
            { ok: false, error: "Missing required parameters (alertId, status)" },
            400,
          );
        }

        const success = await resolveEngagementAlert(body.alertId, body.status, body.notes || "");
        return jsonReply({ ok: success });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error resolving alert";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // GET /api/admin/engagement/analytics
    if (pathname === "/api/admin/engagement/analytics" && request.method === "GET") {
      try {
        const analytics = await getEngagementDashboardAnalytics();
        return jsonReply({ ok: true, ...analytics });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error fetching dashboard analytics";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }

    // POST /api/admin/engagement/periods/reset
    if (pathname === "/api/admin/engagement/periods/reset" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => null)) as { userId?: string } | null;
        if (!body?.userId) {
          return jsonReply({ ok: false, error: "Missing required parameter: userId" }, 400);
        }
        const rotatedPeriod = await forceRotateUserPeriod(body.userId);
        return jsonReply({ ok: true, currentPeriod: rotatedPeriod });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error resetting user period";
        return jsonReply({ ok: false, error: msg }, 500);
      }
    }
  }

  return null;
}
