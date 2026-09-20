import { FRAUD_GUARD_CONFIG } from "./config";
import { rtdbSet, sanitizePathKey } from "./db";
import { DeviceLinker } from "./device-linker";
import { HeartbeatValidator } from "./heartbeat-validator";
import { IPReputationService } from "./ip-reputation";
import { RateLimiter } from "./rate-limiter";
import { ScoringEngine } from "./scoring-engine";
import type { FraudSignal, UnifiedFraudReport, UnifiedSessionInput } from "./types";

/**
 * Combined Analytics Engine.
 * Integrates System 1 (Client Hardware Fingerprinting & Behavioral Entropy)
 * with System 2 (Server Firebase Device Linking, IP Reputation, Nonce Heartbeats, Rate Limits)
 * into a single unified analytical assessment and reporting record.
 */
export class CombinedAnalyticsEngine {
  /**
   * Evaluates a full-spectrum session by orchestrating client-side telemetry
   * and server-side state checks into a single authoritative report.
   */
  public static async evaluateUnifiedSession(
    input: UnifiedSessionInput,
  ): Promise<UnifiedFraudReport> {
    const nowEpoch = Date.now();
    const nowIso = new Date().toISOString();
    const reportId = `rep_${nowEpoch}_${Math.random().toString(36).slice(2, 8)}`;
    const allSignals: FraudSignal[] = [];

    const deviceId =
      input.deviceFingerprint?.fingerprintId || `dev_anon_${sanitizePathKey(input.accountId)}`;

    // -------------------------------------------------------------
    // 1. Client-Side Telemetry & Hardware Vector Evaluation
    // -------------------------------------------------------------
    let isHeadlessOrBot = false;
    let webdriverFlag = false;
    let headlessGpu = false;
    let hasHumanInteractionEntropy = true;
    let interactionEventCount = 0;
    let foregroundDwellSeconds = 0;
    let backgroundDwellSeconds = 0;

    if (input.deviceFingerprint) {
      const { environment, webgl } = input.deviceFingerprint;

      // Check webdriver automation
      if (environment.webdriver) {
        webdriverFlag = true;
        isHeadlessOrBot = true;
        allSignals.push({
          type: "WEBDRIVER_AUTOMATION_FLAG",
          severity: "critical",
          penaltyPoints: FRAUD_GUARD_CONFIG.penalties.webdriverAutomationDetected,
          description:
            "navigator.webdriver flag detected (Puppeteer/Selenium/Playwright script execution).",
          evidence: { webdriver: true },
          detectedAt: nowIso,
        });
      }

      // Check software/virtual GPU
      if (webgl.isHeadlessGpu) {
        headlessGpu = true;
        isHeadlessOrBot = true;
        allSignals.push({
          type: "HEADLESS_GPU_OR_BROWSER",
          severity: "high",
          penaltyPoints: FRAUD_GUARD_CONFIG.penalties.headlessBrowserDetected,
          description: `Emulated or virtual GPU rasterizer detected (${webgl.unmaskedRenderer || webgl.renderer}).`,
          evidence: { renderer: webgl.renderer },
          detectedAt: nowIso,
        });
      }

      // Check headless DOM artifacts
      if (
        environment.phantomJs ||
        environment.selenium ||
        environment.domAutomation ||
        environment.nightmareJs
      ) {
        isHeadlessOrBot = true;
        allSignals.push({
          type: "HEADLESS_GPU_OR_BROWSER",
          severity: "critical",
          penaltyPoints: FRAUD_GUARD_CONFIG.penalties.headlessBrowserDetected,
          description: "Headless runtime browser artifacts found in global window context.",
          evidence: {
            phantom: environment.phantomJs,
            selenium: environment.selenium,
            domAutomation: environment.domAutomation,
          },
          detectedAt: nowIso,
        });
      }
    }

    // Check interaction behavioral entropy
    if (input.telemetry) {
      const tel = input.telemetry;
      interactionEventCount = tel.totalInteractionEvents;
      foregroundDwellSeconds = tel.activeForegroundSeconds;
      backgroundDwellSeconds = tel.backgroundSeconds;

      // Scroll velocity check
      if (tel.scrollCount >= 5 && !tel.hasHumanScrollCurves) {
        hasHumanInteractionEntropy = false;
        allSignals.push({
          type: "BEHAVIORAL_SYNTHETIC_INTERACTION",
          severity: "medium",
          penaltyPoints: FRAUD_GUARD_CONFIG.penalties.syntheticInteractionEntropy,
          description:
            "Linear or synthetic scroll dynamics detected without human deceleration curves.",
          evidence: {
            scrollCount: tel.scrollCount,
            variance: tel.scrollVelocityVariance,
          },
          detectedAt: nowIso,
        });
      }

      // Touch dynamics check (0-pixel contact radius on touch device)
      if (tel.touchCount >= 4 && tel.averageTouchRadius === 0) {
        hasHumanInteractionEntropy = false;
        allSignals.push({
          type: "BEHAVIORAL_SYNTHETIC_INTERACTION",
          severity: "medium",
          penaltyPoints: FRAUD_GUARD_CONFIG.penalties.syntheticInteractionEntropy,
          description:
            "Touch events detected with 0px contact radius (synthetic simulator or macro touch).",
          evidence: {
            touchCount: tel.touchCount,
            averageRadius: tel.averageTouchRadius,
          },
          detectedAt: nowIso,
        });
      }

      // Background dwell ratio
      const totalDwell = tel.activeForegroundSeconds + tel.backgroundSeconds;
      if (totalDwell > 40 && tel.backgroundSeconds / totalDwell > 0.85) {
        allSignals.push({
          type: "BEHAVIORAL_SYNTHETIC_INTERACTION",
          severity: "low",
          penaltyPoints: 15,
          description:
            "Abnormally high background dwell ratio (>85% backgrounded during active session).",
          evidence: {
            foregroundSec: tel.activeForegroundSeconds,
            backgroundSec: tel.backgroundSeconds,
          },
          detectedAt: nowIso,
        });
      }

      // Click burst spamming
      if (tel.rapidClickBurstCount > 0) {
        allSignals.push({
          type: "BURST_REWARD_CLAIMING",
          severity: "medium",
          penaltyPoints: 20,
          description: "Superhuman click frequency burst detected (>6 clicks within 2 seconds).",
          evidence: { burstCount: tel.rapidClickBurstCount },
          detectedAt: nowIso,
        });
      }
    }

    // -------------------------------------------------------------
    // 2. Server-Side Velocity / Rate Limiting Check
    // -------------------------------------------------------------
    let rateLimitExceeded = false;
    const ipVelocity = await RateLimiter.checkIpVelocity(input.clientIp);
    if (ipVelocity.signal) {
      rateLimitExceeded = true;
      allSignals.push(ipVelocity.signal);
    }

    const deviceVelocity = await RateLimiter.checkDeviceActionVelocity(
      deviceId,
      input.heartbeat ? "heartbeat" : "reward_claim",
    );
    if (deviceVelocity.signal) {
      rateLimitExceeded = true;
      allSignals.push(deviceVelocity.signal);
    }

    // -------------------------------------------------------------
    // 3. Server-Side IP / ASN Reputation Check (Cached in RTDB)
    // -------------------------------------------------------------
    const ipRep = await IPReputationService.checkReputation(input.clientIp);
    ipRep.signals.forEach((s) => allSignals.push(s));

    // -------------------------------------------------------------
    // 4. Server-Side Device-Account Collision Tracker (Firebase RTDB)
    // -------------------------------------------------------------
    const deviceCollisions = await DeviceLinker.linkAndAssess(
      deviceId,
      input.accountId,
      input.email || null,
    );
    deviceCollisions.signals.forEach((s) => allSignals.push(s));

    // -------------------------------------------------------------
    // 5. Server-Side Stateless Heartbeat Validation (if present)
    // -------------------------------------------------------------
    let heartbeatValid: boolean | undefined = undefined;
    let heartbeatSpeedRatio: number | undefined = undefined;

    if (input.heartbeat) {
      const hbResult = await HeartbeatValidator.validate({
        nonce: input.heartbeat.nonce,
        sessionId: input.heartbeat.sessionId,
        accountId: input.accountId,
        deviceFingerprintId: deviceId,
        clientIp: input.clientIp,
        currentPlaybackSeconds: input.heartbeat.currentPlaybackSeconds,
        claimedDeltaSeconds: input.heartbeat.claimedDeltaSeconds,
      });

      heartbeatValid = hbResult.isValid;
      heartbeatSpeedRatio = hbResult.speedRatio;
      hbResult.signals.forEach((s) => allSignals.push(s));
    }

    // -------------------------------------------------------------
    // 6. Unified Composite Scoring Evaluation
    // -------------------------------------------------------------
    const assessment = ScoringEngine.evaluate(
      input.accountId,
      deviceId,
      input.clientIp,
      allSignals,
    );

    const report: UnifiedFraudReport = {
      reportId,
      accountId: input.accountId,
      deviceFingerprintId: deviceId,
      clientIp: input.clientIp,
      trustScore: assessment.trustScore,
      riskLevel: assessment.riskLevel,
      recommendedAction: assessment.recommendedAction,
      enforcementMode: FRAUD_GUARD_CONFIG.enforcementMode,
      isEligibleForRewards: assessment.isEligibleForRewards,
      clientSideSignals: {
        isHeadlessOrBot,
        webdriverFlag,
        headlessGpu,
        hasHumanInteractionEntropy,
        interactionEventCount,
        foregroundDwellSeconds,
        backgroundDwellSeconds,
      },
      serverSideSignals: {
        ipIsDatacenter: ipRep.reputation.isDatacenter,
        ipIsProxyOrVpn: ipRep.reputation.isProxy || ipRep.reputation.isVpn,
        ipIsp: ipRep.reputation.isp,
        ipCountry: ipRep.reputation.countryCode,
        deviceCollisionCount: deviceCollisions.assessment.collisionCount,
        distinctEmailsOnDevice: deviceCollisions.assessment.distinctEmails,
        isMultiAccountAbuse: deviceCollisions.assessment.isCollisionAbuse,
        heartbeatValid,
        heartbeatSpeedRatio,
        rateLimitExceeded,
      },
      allSignals,
      scoreBreakdown: assessment.breakdown,
      assessedAt: nowIso,
      epochMs: nowEpoch,
    };

    // -------------------------------------------------------------
    // 7. Asynchronously Log to Firebase RTDB for Observability
    // -------------------------------------------------------------
    const cleanReportId = sanitizePathKey(reportId);
    const cleanDeviceId = sanitizePathKey(deviceId);

    // Save report in combined reports node
    void rtdbSet(`${FRAUD_GUARD_CONFIG.rtdbPaths.combinedReports}/${cleanReportId}`, report);

    // Update comprehensive device profile node
    if (input.deviceFingerprint) {
      void rtdbSet(`${FRAUD_GUARD_CONFIG.rtdbPaths.devices}/${cleanDeviceId}/profile`, {
        deviceFingerprintId: deviceId,
        hardware: {
          platform: input.deviceFingerprint.hardware.platform,
          screenResolution: input.deviceFingerprint.hardware.screenResolution,
          cores: input.deviceFingerprint.hardware.hardwareConcurrency,
          gpuRenderer:
            input.deviceFingerprint.webgl.unmaskedRenderer ||
            input.deviceFingerprint.webgl.renderer,
          timezone: input.deviceFingerprint.hardware.timezone,
        },
        lastTrustScore: assessment.trustScore,
        lastRiskLevel: assessment.riskLevel,
        lastAssessedAt: nowIso,
      });
    }

    return report;
  }
}
