import { rtdbGet, rtdbSet, sanitizePathKey } from "./db";
import type { FraudSignal, UnifiedFraudReport } from "./types";

export type EnforcementTier = 0 | 1 | 2 | 3;

export type EnforcementTierName =
  "Tier 0 — Clear" | "Tier 1 — Observe" | "Tier 2 — Soft friction" | "Tier 3 — Hard restriction";

export type EnforcementActionType =
  "payout_normal" | "payout_logged" | "hold_for_challenge" | "pause_reward_accrual";

export type UserFacingRewardStatus = "None" | "Processing" | "Under review";

export interface EnforcementDecision {
  decisionId: string;
  reportId: string;
  accountId: string;
  deviceFingerprintId: string;
  clientIp: string;
  tier: EnforcementTier;
  tierName: EnforcementTierName;
  action: EnforcementActionType;
  reason: string;
  escalateToAccountSuspension: boolean;
  tier3Count7Days: number;
  userFacingStatus: UserFacingRewardStatus;
  userFacingMessage: string | null;
  isHardOverride: boolean;
  hardOverrideSignals: string[];
  deviceSharingExceptionApplied: boolean;
  activeSignals: FraudSignal[];
  trustScore: number;
  resolution?: "approved" | "confirmed_bot" | "pending";
  resolutionNotes?: string;
  resolvedAt?: string;
  assessedAt: string;
  epochMs: number;
}

interface Tier3AuditRecord {
  decisionId: string;
  reportId: string;
  reason: string;
  epochMs: number;
  isoDate: string;
}

const RTDB_ENFORCEMENT_DECISIONS_PATH = "fraud/enforcementDecisions";
const RTDB_TIER3_ESCALATIONS_PATH = "fraud/escalations/tier3Events";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Checks whether an active signal qualifies as an unequivocal "hard override".
 * Near-zero false-positive rate.
 */
function isHardOverrideSignal(signal: FraudSignal): boolean {
  if (
    signal.type === "WEBDRIVER_AUTOMATION_FLAG" ||
    signal.type === "HEADLESS_GPU_OR_BROWSER" ||
    signal.type === "HEARTBEAT_NONCE_REPLAY" ||
    signal.type === "HEARTBEAT_TIME_WARP_ACCELERATION"
  ) {
    return true;
  }
  return false;
}

/**
 * Pure decision layer for anti-bot and reward abuse enforcement.
 * Implements hard-overrides, score tiers, device sharing exceptions,
 * 14-day decay rules, and 7-day rolling Tier 3 escalation tracking.
 *
 * NOTE: This function only evaluates and logs decisions. It does NOT call
 * any payment APIs, modify user permissions, or alter any UI state.
 */
export async function determineEnforcementAction(
  report: UnifiedFraudReport,
): Promise<EnforcementDecision> {
  const nowEpoch = Date.now();
  const nowIso = new Date().toISOString();
  const decisionId = `dec_${nowEpoch}_${Math.random().toString(36).slice(2, 8)}`;

  // 1. Decay rule: Filter out any signals older than 14 days
  const activeSignals = (report.allSignals || []).filter((sig) => {
    if (!sig.detectedAt) return true;
    const detectedEpoch = new Date(sig.detectedAt).getTime();
    if (isNaN(detectedEpoch)) return true;
    return nowEpoch - detectedEpoch <= FOURTEEN_DAYS_MS;
  });

  // 2. Hard-override evaluation
  const hardOverrideSignals = activeSignals.filter(isHardOverrideSignal).map((s) => s.type);

  const hasHardOverride = hardOverrideSignals.length > 0;

  let tier: EnforcementTier = 0;
  let reason = "";
  let deviceSharingExceptionApplied = false;

  if (hasHardOverride) {
    tier = 3;
    reason = `Hard-override triggered: definitive automation detected (${hardOverrideSignals.join(", ")}). Tier 3 restriction applied immediately.`;
  } else {
    // 3. Score-based tier mapping (0–100)
    const score = report.trustScore;

    if (score >= 70) {
      tier = 0;
      reason = `Trust score ${score}/100 within clear threshold (70–100). Reward approved for normal processing.`;
    } else if (score >= 45) {
      tier = 1;
      reason = `Trust score ${score}/100 within observational threshold (45–69). Reward approved; full anomaly telemetry recorded for pattern analysis.`;
    } else if (score >= 25) {
      tier = 2;
      reason = `Trust score ${score}/100 within soft friction threshold (25–44). Reward queued for interaction verification/manual batch review.`;
    } else {
      // Score < 25 would normally be Tier 3, check device-sharing exception first
      const significantNonCollisionSignals = activeSignals.filter(
        (s) => s.type !== "MULTI_ACCOUNT_DEVICE_COLLISION" && s.severity !== "low",
      );

      // 4. Device-sharing exception:
      // If the ONLY significant negative signal is multi-account on same device,
      // cap at Tier 2 to protect families and shared household devices.
      if (
        significantNonCollisionSignals.length === 0 &&
        report.serverSideSignals.isMultiAccountAbuse
      ) {
        tier = 2;
        deviceSharingExceptionApplied = true;
        reason = `Device-sharing exception applied: 3+ accounts observed on device, but no automation or speed hacks detected. Capped at Tier 2 soft friction.`;
      } else {
        tier = 3;
        reason = `Trust score ${score}/100 below critical cutoff (<25) with multiple compounding risk signals. Tier 3 restriction applied.`;
      }
    }
  }

  // 5. Tier metadata & user-facing message mapping (no accusatory language)
  let tierName: EnforcementTierName = "Tier 0 — Clear";
  let action: EnforcementActionType = "payout_normal";
  let userFacingStatus: UserFacingRewardStatus = "None";
  let userFacingMessage: string | null = null;

  switch (tier) {
    case 0:
      tierName = "Tier 0 — Clear";
      action = "payout_normal";
      userFacingStatus = "None";
      userFacingMessage = null;
      break;
    case 1:
      tierName = "Tier 1 — Observe";
      action = "payout_logged";
      userFacingStatus = "None";
      userFacingMessage = null;
      break;
    case 2:
      tierName = "Tier 2 — Soft friction";
      action = "hold_for_challenge";
      userFacingStatus = "Processing";
      userFacingMessage = "Processing your reward...";
      break;
    case 3:
      tierName = "Tier 3 — Hard restriction";
      action = "pause_reward_accrual";
      userFacingStatus = "Under review";
      userFacingMessage = "Reward status under review.";
      break;
  }

  // 6. Escalation tracking: 3+ Tier 3 events within rolling 7 days
  let tier3Count7Days = 0;
  let escalateToAccountSuspension = false;

  const cleanAccountId = sanitizePathKey(report.accountId);
  const cleanDeviceId = sanitizePathKey(report.deviceFingerprintId);

  const accountEscalationPath = `${RTDB_TIER3_ESCALATIONS_PATH}/accounts/${cleanAccountId}`;
  const deviceEscalationPath = `${RTDB_TIER3_ESCALATIONS_PATH}/devices/${cleanDeviceId}`;

  // Read prior Tier 3 history
  const [priorAccountT3, priorDeviceT3] = await Promise.all([
    rtdbGet<Record<string, Tier3AuditRecord>>(accountEscalationPath),
    rtdbGet<Record<string, Tier3AuditRecord>>(deviceEscalationPath),
  ]);

  const cutoff7Days = nowEpoch - SEVEN_DAYS_MS;

  const filterRecent = (dict: Record<string, Tier3AuditRecord> | null): Tier3AuditRecord[] => {
    if (!dict) return [];
    return Object.values(dict).filter((rec) => rec.epochMs >= cutoff7Days);
  };

  const recentAccountT3 = filterRecent(priorAccountT3);
  const recentDeviceT3 = filterRecent(priorDeviceT3);

  tier3Count7Days = Math.max(recentAccountT3.length, recentDeviceT3.length);

  if (tier === 3) {
    tier3Count7Days += 1;

    const newT3Record: Tier3AuditRecord = {
      decisionId,
      reportId: report.reportId,
      reason,
      epochMs: nowEpoch,
      isoDate: nowIso,
    };

    // Save pruned 7-day record to Firebase RTDB asynchronously
    const recordKey = sanitizePathKey(decisionId);
    void rtdbSet(`${accountEscalationPath}/${recordKey}`, newT3Record);
    void rtdbSet(`${deviceEscalationPath}/${recordKey}`, newT3Record);

    if (tier3Count7Days >= 3) {
      escalateToAccountSuspension = true;
      reason += ` [Escalation Flag: ${tier3Count7Days} Tier 3 events detected within 7 days. Flagged for admin suspension review.]`;
    }
  }

  const decision: EnforcementDecision = {
    decisionId,
    reportId: report.reportId,
    accountId: report.accountId,
    deviceFingerprintId: report.deviceFingerprintId,
    clientIp: report.clientIp,
    tier,
    tierName,
    action,
    reason,
    escalateToAccountSuspension,
    tier3Count7Days,
    userFacingStatus,
    userFacingMessage,
    isHardOverride: hasHardOverride,
    hardOverrideSignals,
    deviceSharingExceptionApplied,
    activeSignals,
    trustScore: report.trustScore,
    assessedAt: nowIso,
    epochMs: nowEpoch,
  };

  // 7. Observability Logging: Record every decision to Firebase RTDB
  const cleanDecisionId = sanitizePathKey(decisionId);
  void rtdbSet(`${RTDB_ENFORCEMENT_DECISIONS_PATH}/${cleanDecisionId}`, decision);

  return decision;
}

/**
 * Retrieves the most recent enforcement decisions from Firebase RTDB.
 */
export async function getRecentEnforcementDecisions(limit = 50): Promise<EnforcementDecision[]> {
  const raw = await rtdbGet<Record<string, EnforcementDecision>>(RTDB_ENFORCEMENT_DECISIONS_PATH);

  if (!raw) return [];

  const list = Object.values(raw);
  list.sort((a, b) => (b.epochMs || 0) - (a.epochMs || 0));
  return list.slice(0, limit);
}

/**
 * Resolves an enforcement decision in Firebase RTDB (e.g. manual admin clearance or confirmation).
 */
export async function resolveEnforcementDecision(
  decisionId: string,
  resolution: "approved" | "confirmed_bot",
  resolutionNotes?: string,
): Promise<boolean> {
  const cleanDecisionId = sanitizePathKey(decisionId);
  const path = `${RTDB_ENFORCEMENT_DECISIONS_PATH}/${cleanDecisionId}`;
  const existing = await rtdbGet<EnforcementDecision>(path);

  if (!existing) return false;

  const updated: EnforcementDecision = {
    ...existing,
    resolution,
    resolutionNotes: resolutionNotes || `Manually marked ${resolution} by administrator.`,
    resolvedAt: new Date().toISOString(),
  };

  return rtdbSet(path, updated);
}
