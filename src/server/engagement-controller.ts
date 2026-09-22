import crypto from "node:crypto";
import { queryRtdb } from "./xseries-service-account";
import { FraudGuard } from "@/lib/fraud-guard";
import type {
  WatchHeartbeatPayload,
  WatchHeartbeatValidationResult,
  EnforcementTier,
  RiskLevel,
  DecisionAction,
} from "@/lib/fraud-guard/types";

export interface EventRuleConfig {
  enabled: boolean;
  weight: number;
  minThreshold: number;
  maxContribution: number;
  fraudSensitivity: number; // 0 to 100
}

export interface EngagementRules {
  enabled: boolean;
  requiredWatchTimeMinutes: number; // e.g., 60 minutes
  rewardPeriodDays: number; // e.g., 7 days
  heartbeatIntervalSeconds: number; // e.g., 10 seconds
  minTrustScoreForReward: number; // e.g., 65
  events: {
    watch_complete: EventRuleConfig;
    like: EventRuleConfig;
    comment: EventRuleConfig;
    share: EventRuleConfig;
    follow: EventRuleConfig;
  };
}

export interface UserEngagementPeriod {
  periodId: string;
  userId: string;
  startedAt: string;
  expiresAt: string;
  verifiedWatchTimeSeconds: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  followCount: number;
  claimCount: number;
  status: "active" | "archived";
}

export interface EngagementAuditLog {
  logId: string;
  userId: string;
  sessionId?: string;
  eventType:
    | "session_start"
    | "heartbeat_success"
    | "heartbeat_rejected"
    | "period_rotated"
    | "manual_reset"
    | "security_flag";
  timestamp: string;
  details: string;
  meta?: Record<string, unknown>;
}

export interface EngagementAlert {
  alertId: string;
  userId: string;
  sessionId?: string;
  clientIp: string;
  deviceFingerprintId: string;
  trustScore: number;
  riskLevel: RiskLevel;
  type: string;
  reason: string;
  detectedAt: string;
  status: "pending" | "resolved_safe" | "resolved_restricted";
  resolutionNotes?: string;
  resolvedAt?: string;
}

// pristine default rules if none exists in database
export const DEFAULT_ENGAGEMENT_RULES: EngagementRules = {
  enabled: true,
  requiredWatchTimeMinutes: 60,
  rewardPeriodDays: 30, // 30-day default cycle matching data validity
  heartbeatIntervalSeconds: 15, // 15s heartbeats
  minTrustScoreForReward: 65,
  events: {
    watch_complete: {
      enabled: true,
      weight: 1.0,
      minThreshold: 1,
      maxContribution: 50,
      fraudSensitivity: 10,
    },
    like: {
      enabled: true,
      weight: 1.5,
      minThreshold: 1,
      maxContribution: 15,
      fraudSensitivity: 20,
    },
    comment: {
      enabled: true,
      weight: 2.0,
      minThreshold: 1,
      maxContribution: 20,
      fraudSensitivity: 30,
    },
    share: {
      enabled: true,
      weight: 2.5,
      minThreshold: 1,
      maxContribution: 25,
      fraudSensitivity: 40,
    },
    follow: {
      enabled: true,
      weight: 3.0,
      minThreshold: 1,
      maxContribution: 30,
      fraudSensitivity: 30,
    },
  },
};

/**
 * Returns current administrator configurable engagement rules from Firebase RTDB.
 */
export async function getEngagementRules(): Promise<EngagementRules> {
  try {
    const rules = (await queryRtdb("engagement/rules")) as EngagementRules | null;
    if (rules && typeof rules === "object" && rules.events) {
      return {
        ...DEFAULT_ENGAGEMENT_RULES,
        ...rules,
        events: {
          ...DEFAULT_ENGAGEMENT_RULES.events,
          ...rules.events,
        },
      };
    }
  } catch (err) {
    console.warn(
      "[Engagement Controller] Failed to read engagement rules from RTDB, falling back to defaults:",
      err,
    );
  }
  return DEFAULT_ENGAGEMENT_RULES;
}

/**
 * Persists administrator configurable engagement rules.
 */
export async function saveEngagementRules(
  rules: Partial<EngagementRules>,
): Promise<EngagementRules> {
  const current = await getEngagementRules();
  const updated: EngagementRules = {
    ...current,
    ...rules,
    events: {
      ...current.events,
      ...(rules.events || {}),
    },
  };
  await queryRtdb("engagement/rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  });
  return updated;
}

/**
 * Starts a new secure, verified watch session for engagement tracking.
 */
export async function startEngagementSession(params: {
  userId: string;
  videoId: string;
  deviceFingerprintId: string;
  clientIp: string;
}): Promise<{ sessionId: string; nonce: string; expiresAtEpoch: number }> {
  const { userId, videoId, deviceFingerprintId, clientIp } = params;
  const sessionId = `wsh_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  // Use FraudGuard's nonce generation system
  const { nonce, expiresAtEpoch } = await FraudGuard.createWatchSessionNonce(
    sessionId,
    userId,
    deviceFingerprintId,
    0,
  );

  const nowIso = new Date().toISOString();
  const sessionData = {
    sessionId,
    userId,
    videoId,
    deviceFingerprintId,
    clientIp,
    startedAt: nowIso,
    lastActiveAt: nowIso,
    verifiedDurationSeconds: 0,
    currentNonce: nonce,
  };

  // Log watch session startup to RTDB
  await queryRtdb(`engagement/sessions/${sessionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sessionData),
  });

  // Record active watch session on user profile for instant dashboard awareness
  await queryRtdb(`engagement/users/${userId}/activeWatchSession`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      videoId,
      deviceFingerprintId,
      startedAt: nowIso,
      lastActiveAt: nowIso,
      status: "streaming",
    }),
  });

  // Log audit trail
  await writeAuditLog({
    userId,
    sessionId,
    eventType: "session_start",
    details: `Started watch session for video ${videoId} from device ${deviceFingerprintId.slice(0, 8)}`,
    meta: { videoId, deviceFingerprintId, clientIp },
  });

  return { sessionId, nonce, expiresAtEpoch };
}

/**
 * Validates watch heartbeat and accumulates verified watch-time.
 */
export async function processEngagementHeartbeat(payload: WatchHeartbeatPayload): Promise<{
  ok: boolean;
  validationResult: WatchHeartbeatValidationResult;
  verifiedWatchTimeSeconds: number;
  periodRemainingSeconds: number;
}> {
  const { sessionId, accountId, deviceFingerprintId, clientIp, claimedDeltaSeconds } = payload;

  // 1. Verify via FraudGuard's robust anti-abuse check
  const result = await FraudGuard.verifyWatchHeartbeat(payload);

  // 2. Fetch session details
  const session = (await queryRtdb(`engagement/sessions/${sessionId}`)) as {
    sessionId: string;
    userId: string;
    videoId: string;
    verifiedDurationSeconds: number;
    lastActiveAt: string;
  } | null;

  if (!session) {
    return {
      ok: false,
      validationResult: result,
      verifiedWatchTimeSeconds: 0,
      periodRemainingSeconds: 0,
    };
  }

  const nowIso = new Date().toISOString();

  if (!result.isValid) {
    // Audit log rejection
    await writeAuditLog({
      userId: accountId,
      sessionId,
      eventType: "heartbeat_rejected",
      details: `Heartbeat rejected. Reason signals: ${result.signals.map((s) => s.type).join(", ") || "invalid credentials"}`,
      meta: { result },
    });

    // Create high-risk Fraud Alert if trustScore drops or critical signals are caught
    if (result.trustScore < 50 || result.signals.length > 0) {
      const alertId = `alt_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
      const alert: EngagementAlert = {
        alertId,
        userId: accountId,
        sessionId,
        clientIp,
        deviceFingerprintId,
        trustScore: result.trustScore,
        riskLevel: result.riskLevel,
        type: result.signals[0]?.type || "HEARTBEAT_ABUSE",
        reason:
          result.signals.map((s) => s.description).join(" | ") ||
          "Failed watch session cryptographic handshake.",
        detectedAt: nowIso,
        status: "pending",
      };
      await queryRtdb(`engagement/alerts/${alertId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(alert),
      });
    }

    // Still return standard signature but with ok: false to let client handler adjust
    return {
      ok: false,
      validationResult: result,
      verifiedWatchTimeSeconds: 0,
      periodRemainingSeconds: 0,
    };
  }

  // 3. Increment verified duration
  const playbackDelta = result.playbackDeltaSeconds || 0;
  const nextVerifiedDuration = session.verifiedDurationSeconds + playbackDelta;

  await queryRtdb(`engagement/sessions/${sessionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...session,
      verifiedDurationSeconds: nextVerifiedDuration,
      lastActiveAt: nowIso,
      currentNonce: result.nextNonce,
    }),
  });

  // 4. Update User's Current Period Stats
  const status = await getOrCreateActivePeriod(accountId);
  const updatedWatchTime = status.currentPeriod.verifiedWatchTimeSeconds + playbackDelta;

  const updatedPeriod: UserEngagementPeriod = {
    ...status.currentPeriod,
    verifiedWatchTimeSeconds: updatedWatchTime,
  };

  await queryRtdb(`engagement/users/${accountId}/currentPeriod`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedPeriod),
  });

  // Update active watch session status on user record
  const currentSessionStatus = payload.isPause ? "paused" : payload.isStop ? "idle" : "streaming";
  await queryRtdb(`engagement/users/${accountId}/activeWatchSession`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      videoId: session.videoId,
      deviceFingerprintId,
      lastActiveAt: nowIso,
      status: currentSessionStatus,
    }),
  });

  // Calculate period remaining time
  const expiresAtMs = new Date(status.currentPeriod.expiresAt).getTime();
  const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));

  // Write audit trail
  await writeAuditLog({
    userId: accountId,
    sessionId,
    eventType: payload.isPause ? "playback_paused" : "heartbeat_success",
    details: payload.isPause
      ? `Playback paused. Marked ${playbackDelta}s verified watch time. Current total: ${updatedWatchTime}s`
      : `Accumulated ${playbackDelta} seconds of verified watch time. Current total: ${updatedWatchTime}s`,
    meta: {
      playbackDelta,
      updatedWatchTime,
      trustScore: result.trustScore,
      isPause: Boolean(payload.isPause),
    },
  });

  return {
    ok: true,
    validationResult: result,
    verifiedWatchTimeSeconds: updatedWatchTime,
    periodRemainingSeconds: remainingSeconds,
  };
}

/**
 * Returns user's active period stats, rotation history, and eligibility to claim rewards.
 */
export async function getUserEngagementStatus(userId: string): Promise<{
  ok: boolean;
  currentPeriod: UserEngagementPeriod & {
    progressPercent: number;
    formattedTimeRemaining: string;
    requiredMinutes: number;
    requiredSeconds: number;
  };
  interactives: {
    likes: number;
    comments: number;
    shares: number;
    follows: number;
  };
  eligibility: {
    eligibleToClaim: boolean;
    ineligibilityReason: string | null;
    trustScore: number;
    riskLevel: RiskLevel;
  };
}> {
  const rules = await getEngagementRules();
  const { currentPeriod, justRotated } = await getOrCreateActivePeriod(userId);

  // Fetch interactive events from user raw event trail `userEvents/${userId}` since period started
  const interactiveTally = { likes: 0, comments: 0, shares: 0, follows: 0 };
  try {
    const rawEvents = (await queryRtdb(`userEvents/${userId}`)) as Record<
      string,
      { type: string; ts: string }
    > | null;
    if (rawEvents) {
      const periodStartMs = new Date(currentPeriod.startedAt).getTime();
      Object.values(rawEvents).forEach((evt) => {
        const evtTime = new Date(evt.ts).getTime();
        if (evtTime >= periodStartMs) {
          if (evt.type === "like") interactiveTally.likes++;
          else if (evt.type === "comment") interactiveTally.comments++;
          else if (evt.type === "share") interactiveTally.shares++;
          else if (evt.type === "follow") interactiveTally.follows++;
        }
      });
    }
  } catch (err) {
    console.warn(`[Engagement Controller] Error reading userEvents for ${userId}:`, err);
  }

  // Verify interactive counts against RTDB records if userEvents query was empty
  try {
    const followsSnap = (await queryRtdb(`follows/${userId}`)) as Record<string, unknown> | null;
    if (followsSnap && typeof followsSnap === "object") {
      const followCount = Object.keys(followsSnap).length;
      if (followCount > interactiveTally.follows) {
        interactiveTally.follows = followCount;
      }
    }
  } catch {
    // fallback
  }

  // Ensure currentPeriod counts don't regress
  interactiveTally.likes = Math.max(interactiveTally.likes, currentPeriod.likeCount || 0);
  interactiveTally.follows = Math.max(interactiveTally.follows, currentPeriod.followCount || 0);

  // Read active watch session status
  let activeSession: {
    status: "streaming" | "paused" | "idle";
    videoId: string | null;
    startedAt: string | null;
    lastActiveAt: string | null;
  } = {
    status: "idle",
    videoId: null,
    startedAt: null,
    lastActiveAt: null,
  };

  try {
    const activeSessionSnap = (await queryRtdb(
      `engagement/users/${userId}/activeWatchSession`,
    )) as {
      status?: "streaming" | "paused" | "idle";
      videoId?: string;
      startedAt?: string;
      lastActiveAt?: string;
    } | null;
    if (activeSessionSnap && typeof activeSessionSnap === "object") {
      activeSession = {
        status: activeSessionSnap.status || "idle",
        videoId: activeSessionSnap.videoId || null,
        startedAt: activeSessionSnap.startedAt || null,
        lastActiveAt: activeSessionSnap.lastActiveAt || null,
      };
    }
  } catch {
    // fallback
  }

  // Update computed properties inside current period
  currentPeriod.likeCount = interactiveTally.likes;
  currentPeriod.commentCount = interactiveTally.comments;
  currentPeriod.shareCount = interactiveTally.shares;
  currentPeriod.followCount = interactiveTally.follows;

  // Save the updated counts in RTDB
  if (!justRotated) {
    await queryRtdb(`engagement/users/${userId}/currentPeriod`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentPeriod),
    });
  }

  // Compute remaining time formatting
  const expiresAtMs = new Date(currentPeriod.expiresAt).getTime();
  const diffMs = expiresAtMs - Date.now();
  let formattedTimeRemaining = "Period expired";
  if (diffMs > 0) {
    const days = Math.floor(diffMs / (24 * 3600 * 1000));
    const hours = Math.floor((diffMs % (24 * 3600 * 1000)) / (3600 * 1000));
    const mins = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
    if (days > 0) {
      formattedTimeRemaining = `${days}d ${hours}h remaining`;
    } else {
      formattedTimeRemaining = `${hours}h ${mins}m remaining`;
    }
  }

  const requiredSeconds = rules.requiredWatchTimeMinutes * 60;
  const progressPercent = Math.min(
    100,
    Math.floor((currentPeriod.verifiedWatchTimeSeconds / requiredSeconds) * 100),
  );

  // Fetch overall security trust score for eligibility
  let trustScore = 100;
  let riskLevel: RiskLevel = "low";
  try {
    const lastDecision = await queryRtdb(`fraud/enforcementDecisions`);
    if (lastDecision && typeof lastDecision === "object") {
      interface DecisionRecord {
        accountId?: string;
        epochMs?: number;
        trustScore?: number;
        riskLevel?: RiskLevel;
      }
      const userDecisions = Object.values(lastDecision).filter(
        (d) => (d as DecisionRecord).accountId === userId,
      ) as DecisionRecord[];
      if (userDecisions.length > 0) {
        userDecisions.sort((a, b) => (b.epochMs ?? 0) - (a.epochMs ?? 0));
        const latest = userDecisions[0];
        trustScore = latest.trustScore ?? 100;
        riskLevel = latest.riskLevel ?? "low";
      }
    }
  } catch {
    // fallback
  }

  // Strict Qualification Requirements Evaluation:
  // 1. Must reach required watch time (e.g. 60m)
  // 2. Must like at least 1 video
  // 3. Must follow at least 1 creator
  // 4. Must meet minimum security trust score
  const watchTimeMet = currentPeriod.verifiedWatchTimeSeconds >= requiredSeconds;
  const likeMet = interactiveTally.likes >= 1;
  const followMet = interactiveTally.follows >= 1;
  const trustScoreMet = trustScore >= rules.minTrustScoreForReward;
  const missingMins = Math.max(
    0,
    Math.ceil((requiredSeconds - currentPeriod.verifiedWatchTimeSeconds) / 60),
  );

  let eligibleToClaim = true;
  let ineligibilityReason: string | null = null;

  if (!rules.enabled) {
    eligibleToClaim = false;
    ineligibilityReason = "The reward campaign is currently paused.";
  } else if (!watchTimeMet) {
    eligibleToClaim = false;
    ineligibilityReason = `Stream for ${missingMins} more minutes of cinema to reach the ${rules.requiredWatchTimeMinutes}-minute watch time requirement.`;
  } else if (!likeMet) {
    eligibleToClaim = false;
    ineligibilityReason = "You must like at least 1 video before claiming your reward.";
  } else if (!followMet) {
    eligibleToClaim = false;
    ineligibilityReason = "You must follow at least 1 creator before claiming your reward.";
  } else if (!trustScoreMet) {
    eligibleToClaim = false;
    ineligibilityReason = "Your account is currently undergoing verification by platform security.";
  }

  return {
    ok: true,
    currentPeriod: {
      ...currentPeriod,
      progressPercent,
      formattedTimeRemaining,
      requiredMinutes: rules.requiredWatchTimeMinutes,
      requiredSeconds,
    },
    interactives: interactiveTally,
    requirements: {
      watchTimeMet,
      likeMet,
      followMet,
      trustScoreMet,
      missingWatchMinutes: missingMins,
      missingLikes: Math.max(0, 1 - interactiveTally.likes),
      missingFollows: Math.max(0, 1 - interactiveTally.follows),
      requiredWatchMinutes: rules.requiredWatchTimeMinutes,
      requiredLikes: 1,
      requiredFollows: 1,
    },
    activeSession,
    eligibility: {
      eligibleToClaim,
      ineligibilityReason,
      trustScore,
      riskLevel,
    },
  };
}

/**
 * Gets or creates the active period, handling automated periodic rotation.
 */
async function getOrCreateActivePeriod(
  userId: string,
): Promise<{ currentPeriod: UserEngagementPeriod; justRotated: boolean }> {
  const rules = await getEngagementRules();
  const currentPath = `engagement/users/${userId}/currentPeriod`;
  const existing = (await queryRtdb(currentPath)) as UserEngagementPeriod | null;

  const now = Date.now();
  const nowIso = new Date().toISOString();

  if (existing) {
    const expiresMs = new Date(existing.expiresAt).getTime();
    if (now < expiresMs) {
      return { currentPeriod: existing, justRotated: false };
    }

    // Period expired! Automated rotation
    const archiveId = existing.periodId;
    existing.status = "archived";

    // Archive historical stats
    await queryRtdb(`engagement/users/${userId}/history/${archiveId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(existing),
    });

    // Create fresh period
    const newPeriodId = `prd_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const durationDays = rules.rewardPeriodDays || 30;
    const expiresAt = new Date(now + durationDays * 24 * 3600 * 1000).toISOString();

    const newPeriod: UserEngagementPeriod = {
      periodId: newPeriodId,
      userId,
      startedAt: nowIso,
      expiresAt,
      verifiedWatchTimeSeconds: 0,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      followCount: 0,
      claimCount: 0,
      status: "active",
    };

    await queryRtdb(currentPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newPeriod),
    });

    await writeAuditLog({
      userId,
      eventType: "period_rotated",
      details: `Engagement cycle rotated. Archived ${archiveId}, initialized new active period ${newPeriodId}.`,
    });

    return { currentPeriod: newPeriod, justRotated: true };
  }

  // Initialize fresh first period
  const newPeriodId = `prd_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const durationDays = rules.rewardPeriodDays || 30;
  const expiresAt = new Date(now + durationDays * 24 * 3600 * 1000).toISOString();

  const newPeriod: UserEngagementPeriod = {
    periodId: newPeriodId,
    userId,
    startedAt: nowIso,
    expiresAt,
    verifiedWatchTimeSeconds: 0,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    followCount: 0,
    claimCount: 0,
    status: "active",
  };

  await queryRtdb(currentPath, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newPeriod),
  });

  return { currentPeriod: newPeriod, justRotated: true };
}

/**
 * Manually finalizes and rotates engagement period for a specific user.
 */
export async function forceRotateUserPeriod(userId: string): Promise<UserEngagementPeriod> {
  const currentPath = `engagement/users/${userId}/currentPeriod`;
  const existing = (await queryRtdb(currentPath)) as UserEngagementPeriod | null;
  const rules = await getEngagementRules();

  if (existing) {
    existing.status = "archived";
    await queryRtdb(`engagement/users/${userId}/history/${existing.periodId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(existing),
    });
  }

  const nowIso = new Date().toISOString();
  const newPeriodId = `prd_manual_${Date.now()}`;
  const durationDays = rules.rewardPeriodDays || 30;
  const expiresAt = new Date(Date.now() + durationDays * 24 * 3600 * 1000).toISOString();

  const newPeriod: UserEngagementPeriod = {
    periodId: newPeriodId,
    userId,
    startedAt: nowIso,
    expiresAt,
    verifiedWatchTimeSeconds: 0,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    followCount: 0,
    claimCount: 0,
    status: "active",
  };

  await queryRtdb(currentPath, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newPeriod),
  });

  await writeAuditLog({
    userId,
    eventType: "manual_reset",
    details: `Administrator manually forced immediate rotation of reward cycle to period ${newPeriodId}.`,
  });

  return newPeriod;
}

/**
 * Increments active reward claim counts in user period upon successful VTUshare fulfillment.
 */
export async function recordPeriodClaim(userId: string): Promise<void> {
  const currentPath = `engagement/users/${userId}/currentPeriod`;
  const existing = (await queryRtdb(currentPath)) as UserEngagementPeriod | null;
  if (existing) {
    existing.claimCount = (existing.claimCount || 0) + 1;
    await queryRtdb(currentPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(existing),
    });
  }
}

/**
 * Helper to record structural audit logs in Firebase RTDB.
 */
export async function writeAuditLog(
  log: Omit<EngagementAuditLog, "logId" | "timestamp">,
): Promise<void> {
  const logId = `log_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const record: EngagementAuditLog = {
    ...log,
    logId,
    timestamp: new Date().toISOString(),
  };
  await queryRtdb(`engagement/auditLogs/${logId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
}

/**
 * Returns list of security alerts.
 */
export async function getEngagementAlerts(limit = 100): Promise<EngagementAlert[]> {
  try {
    const alerts = (await queryRtdb(`engagement/alerts`)) as Record<string, EngagementAlert> | null;
    if (!alerts) return [];
    const list = Object.values(alerts);
    list.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
    return list.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Resolves a high-risk security alert.
 */
export async function resolveEngagementAlert(
  alertId: string,
  status: "resolved_safe" | "resolved_restricted",
  resolutionNotes: string,
): Promise<boolean> {
  try {
    const alert = (await queryRtdb(`engagement/alerts/${alertId}`)) as EngagementAlert | null;
    if (!alert) return false;

    const updated: EngagementAlert = {
      ...alert,
      status,
      resolutionNotes,
      resolvedAt: new Date().toISOString(),
    };

    await queryRtdb(`engagement/alerts/${alertId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });

    // Write audit log
    await writeAuditLog({
      userId: alert.userId,
      eventType: "security_flag",
      details: `Alert ${alertId} marked as ${status}. Resolution notes: ${resolutionNotes}`,
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Tally engagement metrics for Real-time Dashboard Analytics.
 */
export async function getEngagementDashboardAnalytics(): Promise<{
  activeEngagedUsers: number;
  totalVerifiedWatchTimeSeconds: number;
  openAlertsCount: number;
  funnelEligibleCount: number;
  funnelClaimCount: number;
  funnelDeliveredCount: number;
  auditLogs: EngagementAuditLog[];
}> {
  let activeEngagedUsers = 0;
  let totalVerifiedWatchTimeSeconds = 0;
  let openAlertsCount = 0;
  let funnelEligibleCount = 0;
  let funnelClaimCount = 0;
  let funnelDeliveredCount = 0;
  let auditLogs: EngagementAuditLog[] = [];

  try {
    // 1. Tally active period users and total duration
    const allUsersData = (await queryRtdb("engagement/users")) as Record<
      string,
      { currentPeriod?: UserEngagementPeriod }
    > | null;
    if (allUsersData) {
      const rules = await getEngagementRules();
      const requiredSeconds = rules.requiredWatchTimeMinutes * 60;
      Object.values(allUsersData).forEach((u) => {
        if (u?.currentPeriod) {
          totalVerifiedWatchTimeSeconds += u.currentPeriod.verifiedWatchTimeSeconds || 0;
          if (u.currentPeriod.verifiedWatchTimeSeconds > 300) {
            // > 5 minutes watched
            activeEngagedUsers++;
          }
          if (u.currentPeriod.verifiedWatchTimeSeconds >= requiredSeconds) {
            funnelEligibleCount++;
          }
        }
      });
    }

    // 2. Count active unresolved alerts
    const alerts = await getEngagementAlerts(200);
    openAlertsCount = alerts.filter((a) => a.status === "pending").length;

    // 3. Funnel counts from reward claims
    const txs = (await queryRtdb("rewardTransactions")) as Record<
      string,
      { status: string; userId?: string }
    > | null;
    if (txs) {
      const uniqueClaimers = new Set<string>();
      const uniqueDelivered = new Set<string>();
      Object.values(txs).forEach((t) => {
        if (t.userId) {
          uniqueClaimers.add(t.userId);
          if (t.status === "success") {
            uniqueDelivered.add(t.userId);
          }
        }
      });
      funnelClaimCount = uniqueClaimers.size;
      funnelDeliveredCount = uniqueDelivered.size;
    }

    // 4. Recent Audit Logs
    const rawLogs = (await queryRtdb("engagement/auditLogs")) as Record<
      string,
      EngagementAuditLog
    > | null;
    if (rawLogs) {
      auditLogs = Object.values(rawLogs);
      auditLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      auditLogs = auditLogs.slice(0, 50);
    }
  } catch (err) {
    console.warn("[Engagement Controller] Failed to compile dashboard metrics:", err);
  }

  return {
    activeEngagedUsers,
    totalVerifiedWatchTimeSeconds,
    openAlertsCount,
    funnelEligibleCount,
    funnelClaimCount,
    funnelDeliveredCount,
    auditLogs,
  };
}

/**
 * Records an engagement action (like, follow, comment, share) directly to the user's active period.
 */
export async function recordUserEngagementAction(
  userId: string,
  type: "like" | "follow" | "comment" | "share",
  targetId?: string,
): Promise<{ ok: boolean; likes: number; follows: number }> {
  const ts = new Date().toISOString();
  const eventId = `evt_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const eventRecord = {
    type,
    targetId: targetId || null,
    ts,
  };

  try {
    await queryRtdb(`userEvents/${userId}/${eventId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventRecord),
    });
  } catch (err) {
    console.warn(`[Engagement Controller] Failed to write userEvent ${type} for ${userId}:`, err);
  }

  const { currentPeriod } = await getOrCreateActivePeriod(userId);
  if (type === "like") {
    currentPeriod.likeCount = (currentPeriod.likeCount || 0) + 1;
  } else if (type === "follow") {
    currentPeriod.followCount = (currentPeriod.followCount || 0) + 1;
  } else if (type === "comment") {
    currentPeriod.commentCount = (currentPeriod.commentCount || 0) + 1;
  } else if (type === "share") {
    currentPeriod.shareCount = (currentPeriod.shareCount || 0) + 1;
  }

  try {
    await queryRtdb(`engagement/users/${userId}/currentPeriod`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentPeriod),
    });
  } catch (err) {
    console.warn(`[Engagement Controller] Failed to update currentPeriod for ${userId}:`, err);
  }

  return {
    ok: true,
    likes: currentPeriod.likeCount || 0,
    follows: currentPeriod.followCount || 0,
  };
}
