import { FRAUD_GUARD_CONFIG } from "./config";
import { CombinedAnalyticsEngine } from "./combined-analytics";
import { CombinedFraudReporter } from "./combined-reporter";
import { DeviceLinker } from "./device-linker";
import { HeartbeatValidator } from "./heartbeat-validator";
import { IPReputationService } from "./ip-reputation";
import { RateLimiter } from "./rate-limiter";
import { ScoringEngine } from "./scoring-engine";
import type {
  AccountActionPayload,
  CombinedDeviceProfile,
  CompositeTrustAssessment,
  FraudSignal,
  UnifiedAnalyticsOverview,
  UnifiedFraudReport,
  UnifiedSessionInput,
  WatchHeartbeatPayload,
  WatchHeartbeatValidationResult,
} from "./types";

export * from "./types";
export * from "./config";
export * from "./db";
export * from "./device-linker";
export * from "./ip-reputation";
export * from "./rate-limiter";
export * from "./heartbeat-validator";
export * from "./scoring-engine";
export * from "./reporter";
export * from "./combined-analytics";
export * from "./combined-reporter";
export * from "./enforcement-rules";

/**
 * Unified FraudGuard Anti-Bot & Anti-Reward-Abuse Facade.
 * Stateless, high-performance, and optimized for Render free-tier execution.
 */
export class FraudGuard {
  /**
   * Generates the initial single-use nonce when a user starts watching a video.
   */
  public static async createWatchSessionNonce(
    sessionId: string,
    accountId: string,
    deviceFingerprintId: string,
    initialPlaybackSeconds = 0,
  ): Promise<{ nonce: string; expiresAtEpoch: number }> {
    return HeartbeatValidator.issueNonce(
      sessionId,
      accountId,
      deviceFingerprintId,
      initialPlaybackSeconds,
    );
  }

  /**
   * Verifies a periodic watch heartbeat.
   * Validates nonces, wall-clock progression, IP reputation, velocity, and multi-account status.
   * Runs in "observe_only" mode by default.
   */
  public static async verifyWatchHeartbeat(
    payload: WatchHeartbeatPayload,
  ): Promise<WatchHeartbeatValidationResult> {
    const gatheredSignals: FraudSignal[] = [];

    // 1. Fast Edge Rate Limiting (Protects CPU before heavier logic)
    const ipRateCheck = await RateLimiter.checkIpVelocity(payload.clientIp);
    if (ipRateCheck.signal) gatheredSignals.push(ipRateCheck.signal);

    const deviceRateCheck = await RateLimiter.checkDeviceActionVelocity(
      payload.deviceFingerprintId,
      "heartbeat",
    );
    if (deviceRateCheck.signal) gatheredSignals.push(deviceRateCheck.signal);

    // 2. Stateless Heartbeat Playback Delta & Nonce Validation
    const heartbeatValidation = await HeartbeatValidator.validate(payload);
    heartbeatValidation.signals.forEach((s) => gatheredSignals.push(s));

    // 3. IP / ASN Datacenter & Proxy Reputation Check (Cached in RTDB)
    const ipCheck = await IPReputationService.checkReputation(payload.clientIp);
    ipCheck.signals.forEach((s) => gatheredSignals.push(s));

    // 4. Server-Side Device-Account Linking & Collision Detection
    const deviceLink = await DeviceLinker.linkAndAssess(
      payload.deviceFingerprintId,
      payload.accountId,
    );
    deviceLink.signals.forEach((s) => gatheredSignals.push(s));

    // 5. Client Behavioral Telemetry Forwarding (if provided in payload)
    if (payload.behavioralSignals && payload.behavioralSignals.length > 0) {
      payload.behavioralSignals.forEach((b) => {
        gatheredSignals.push({
          type: "BEHAVIORAL_SYNTHETIC_INTERACTION",
          severity: "medium",
          penaltyPoints: b.penalty || 20,
          description: b.description || "Unnatural interaction pattern",
          evidence: { rawSignal: b.type },
          detectedAt: new Date().toISOString(),
        });
      });
    }

    // 6. Calculate Composite Trust Assessment
    const assessment = ScoringEngine.evaluate(
      payload.accountId,
      payload.deviceFingerprintId,
      payload.clientIp,
      gatheredSignals,
    );

    const isValid =
      heartbeatValidation.isValid &&
      (FRAUD_GUARD_CONFIG.enforcementMode === "observe_only" || assessment.isEligibleForRewards);

    return {
      isValid,
      action: assessment.recommendedAction,
      enforcementMode: FRAUD_GUARD_CONFIG.enforcementMode,
      trustScore: assessment.trustScore,
      riskLevel: assessment.riskLevel,
      nextNonce: heartbeatValidation.nextNonce,
      wallClockDeltaSeconds: heartbeatValidation.wallClockDeltaSeconds,
      playbackDeltaSeconds: heartbeatValidation.playbackDeltaSeconds,
      speedRatio: heartbeatValidation.speedRatio,
      signals: gatheredSignals,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Assesses an account-level lifecycle action (e.g., signup, reward claim, or profile change).
   */
  public static async checkAccountAction(
    payload: AccountActionPayload,
  ): Promise<CompositeTrustAssessment> {
    const gatheredSignals: FraudSignal[] = [];

    // Rate limit check
    const ipCheck = await RateLimiter.checkIpVelocity(payload.clientIp);
    if (ipCheck.signal) gatheredSignals.push(ipCheck.signal);

    const actionRate = await RateLimiter.checkDeviceActionVelocity(
      payload.deviceFingerprintId,
      payload.actionType === "signup"
        ? "signup"
        : payload.actionType === "reward_claim"
          ? "reward_claim"
          : "heartbeat",
    );
    if (actionRate.signal) gatheredSignals.push(actionRate.signal);

    // IP reputation
    const repCheck = await IPReputationService.checkReputation(payload.clientIp);
    repCheck.signals.forEach((s) => gatheredSignals.push(s));

    // Device link & collision check
    const linkCheck = await DeviceLinker.linkAndAssess(
      payload.deviceFingerprintId,
      payload.accountId,
      payload.email,
    );
    linkCheck.signals.forEach((s) => gatheredSignals.push(s));

    // Scoring
    return ScoringEngine.evaluate(
      payload.accountId,
      payload.deviceFingerprintId,
      payload.clientIp,
      gatheredSignals,
    );
  }

  /**
   * Evaluates a session by combining System 1 (Client Hardware/Telemetry)
   * and System 2 (Server Firebase RTDB/IP Reputation/Heartbeat).
   */
  public static async evaluateUnifiedSession(
    input: UnifiedSessionInput,
  ): Promise<UnifiedFraudReport> {
    return CombinedAnalyticsEngine.evaluateUnifiedSession(input);
  }

  /**
   * Retrieves high-level aggregated analytics across both client and server data.
   */
  public static async getUnifiedAnalyticsOverview(
    sampleLimit = 200,
  ): Promise<UnifiedAnalyticsOverview> {
    return CombinedFraudReporter.getAnalyticsOverview(sampleLimit);
  }

  /**
   * Retrieves recent full-stack combined fraud reports.
   */
  public static async getRecentCombinedReports(limit = 50): Promise<UnifiedFraudReport[]> {
    return CombinedFraudReporter.getRecentReports(limit);
  }

  /**
   * Retrieves comprehensive hardware profile and linked account collisions for a device.
   */
  public static async getCombinedDeviceProfile(
    deviceFingerprintId: string,
  ): Promise<CombinedDeviceProfile | null> {
    return CombinedFraudReporter.getCombinedDeviceProfile(deviceFingerprintId);
  }

  /**
   * Determines the tiered enforcement action for a fraud report.
   */
  public static async determineEnforcementAction(report: UnifiedFraudReport) {
    const { determineEnforcementAction } = await import("./enforcement-rules");
    return determineEnforcementAction(report);
  }

  /**
   * Retrieves recent enforcement decisions from Firebase RTDB.
   */
  public static async getRecentEnforcementDecisions(limit = 50) {
    const { getRecentEnforcementDecisions } = await import("./enforcement-rules");
    return getRecentEnforcementDecisions(limit);
  }

  /**
   * Resolves or clears an enforcement decision.
   */
  public static async resolveEnforcementDecision(
    decisionId: string,
    resolution: "approved" | "confirmed_bot",
    resolutionNotes?: string,
  ) {
    const { resolveEnforcementDecision } = await import("./enforcement-rules");
    return resolveEnforcementDecision(decisionId, resolution, resolutionNotes);
  }
}
