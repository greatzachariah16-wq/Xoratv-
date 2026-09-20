import { FRAUD_GUARD_CONFIG } from "./config";
import { rtdbSet, sanitizePathKey } from "./db";
import type {
  CompositeTrustAssessment,
  DecisionAction,
  FraudEventRecord,
  FraudSignal,
  RiskLevel,
} from "./types";

/**
 * Composite Trust Scoring Engine.
 * Integrates signals across device collisions, IP reputation, heartbeat anomalies,
 * rate-limit velocity, and client behavioral telemetry.
 * All penalty weights are sourced from FRAUD_GUARD_CONFIG.
 */
export class ScoringEngine {
  /**
   * Evaluates composite trust score from gathered signals.
   */
  public static evaluate(
    accountId: string,
    deviceFingerprintId: string,
    clientIp: string,
    signals: FraudSignal[],
  ): CompositeTrustAssessment {
    const nowIso = new Date().toISOString();

    let deviceCollisionPenalty = 0;
    let ipReputationPenalty = 0;
    let heartbeatPenalty = 0;
    let rateLimitPenalty = 0;
    let behavioralPenalty = 0;

    // Aggregate penalties by domain category
    signals.forEach((sig) => {
      switch (sig.type) {
        case "MULTI_ACCOUNT_DEVICE_COLLISION":
          deviceCollisionPenalty += sig.penaltyPoints;
          break;
        case "DATACENTER_OR_HOSTING_IP":
        case "VPN_OR_PROXY_DETECTED":
        case "TOR_EXIT_NODE":
          ipReputationPenalty += sig.penaltyPoints;
          break;
        case "HEARTBEAT_TIME_WARP_ACCELERATION":
        case "HEARTBEAT_NONCE_REPLAY":
        case "HEARTBEAT_NONCE_EXPIRED":
        case "HEARTBEAT_INVALID_SESSION":
          heartbeatPenalty += sig.penaltyPoints;
          break;
        case "RATE_LIMIT_IP_MINUTE_EXCEEDED":
        case "RATE_LIMIT_DEVICE_HOUR_EXCEEDED":
        case "RATE_LIMIT_ACCOUNT_HOUR_EXCEEDED":
        case "BURST_REWARD_CLAIMING":
          rateLimitPenalty += sig.penaltyPoints;
          break;
        case "BEHAVIORAL_SYNTHETIC_INTERACTION":
        case "WEBDRIVER_AUTOMATION_FLAG":
        case "HEADLESS_GPU_OR_BROWSER":
          behavioralPenalty += sig.penaltyPoints;
          break;
        default:
          behavioralPenalty += sig.penaltyPoints;
      }
    });

    const totalPenalty =
      deviceCollisionPenalty +
      ipReputationPenalty +
      heartbeatPenalty +
      rateLimitPenalty +
      behavioralPenalty;

    const rawScore = 100 - totalPenalty;
    const trustScore = Math.max(0, Math.min(100, rawScore));

    // Risk Classification
    let riskLevel: RiskLevel = "low";
    if (trustScore < FRAUD_GUARD_CONFIG.thresholds.criticalRiskCutoff) {
      riskLevel = "critical";
    } else if (trustScore < FRAUD_GUARD_CONFIG.thresholds.highRiskCutoff) {
      riskLevel = "high";
    } else if (trustScore < FRAUD_GUARD_CONFIG.thresholds.mediumRiskCutoff) {
      riskLevel = "medium";
    }

    // Recommended Action
    let recommendedAction: DecisionAction = "allow";
    if (riskLevel === "critical") {
      recommendedAction = "block";
    } else if (riskLevel === "high") {
      recommendedAction = "challenge";
    } else if (riskLevel === "medium") {
      recommendedAction = "flag";
    }

    const isEligibleForRewards =
      trustScore >= FRAUD_GUARD_CONFIG.thresholds.minScoreForRewardEligibility;

    const assessment: CompositeTrustAssessment = {
      trustScore,
      riskLevel,
      recommendedAction,
      enforcementMode: FRAUD_GUARD_CONFIG.enforcementMode,
      isEligibleForRewards,
      deviceFingerprintId,
      accountId,
      clientIp,
      signals,
      breakdown: {
        deviceCollisionPenalty,
        ipReputationPenalty,
        heartbeatPenalty,
        rateLimitPenalty,
        behavioralPenalty,
      },
      assessedAt: nowIso,
    };

    // Asynchronously record event in Firebase for observability (logging-only mode)
    void this.logFraudEvent({
      eventId: `fe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      eventType: "account_action",
      accountId,
      deviceFingerprintId,
      clientIp,
      trustScore,
      riskLevel,
      action: recommendedAction,
      enforcementMode: FRAUD_GUARD_CONFIG.enforcementMode,
      signals,
      timestamp: nowIso,
      epochMs: Date.now(),
    });

    return assessment;
  }

  /**
   * Logs a fraud event in Firebase RTDB without blocking the user.
   */
  public static async logFraudEvent(event: FraudEventRecord): Promise<void> {
    const cleanId = sanitizePathKey(event.eventId);
    const path = `${FRAUD_GUARD_CONFIG.rtdbPaths.fraudEvents}/${cleanId}`;
    await rtdbSet(path, event);
  }
}
