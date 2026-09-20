import { FRAUD_GUARD_CONFIG } from "./config";
import { rtdbGet, rtdbSet, sanitizePathKey } from "./db";
import type { FraudSignal, HeartbeatNonceRecord, WatchHeartbeatPayload } from "./types";

/**
 * Generates a cryptographically random nonce string.
 */
function generateRandomHex(byteCount = 16): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(byteCount);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Stateless, Render-Free-Tier-Optimized Heartbeat Validator.
 * Uses single-use database-backed nonces to validate real wall-clock progression against
 * claimed playback time, detecting video speed hacks, automated skipping, and replay attacks.
 */
export class HeartbeatValidator {
  /**
   * Issues a short-lived, single-use nonce for a video watch session.
   */
  public static async issueNonce(
    sessionId: string,
    accountId: string,
    deviceFingerprintId: string,
    currentPlaybackSeconds = 0,
  ): Promise<{ nonce: string; expiresAtEpoch: number }> {
    const cleanSession = sanitizePathKey(sessionId);
    const nonce = generateRandomHex(16);
    const now = Date.now();
    const expiresAt = now + FRAUD_GUARD_CONFIG.heartbeat.nonceTtlSeconds * 1000;

    const record: HeartbeatNonceRecord = {
      nonce,
      sessionId,
      accountId,
      deviceFingerprintId,
      issuedAt: now,
      expiresAt,
      lastPlaybackSeconds: Math.max(0, currentPlaybackSeconds),
      lastHeartbeatWallClock: now,
      used: false,
    };

    const path = `${FRAUD_GUARD_CONFIG.rtdbPaths.heartbeatNonces}/${cleanSession}/${nonce}`;
    await rtdbSet(path, record);

    return { nonce, expiresAtEpoch: expiresAt };
  }

  /**
   * Validates a watch heartbeat using the single-use nonce.
   * Compares wall-clock delta against claimed playback delta to detect time acceleration hacks.
   */
  public static async validate(payload: WatchHeartbeatPayload): Promise<{
    isValid: boolean;
    wallClockDeltaSeconds: number;
    playbackDeltaSeconds: number;
    speedRatio: number;
    nextNonce: string | null;
    signals: FraudSignal[];
  }> {
    const cleanSession = sanitizePathKey(payload.sessionId);
    const cleanNonce = sanitizePathKey(payload.nonce);
    const now = Date.now();
    const nowIso = new Date().toISOString();
    const signals: FraudSignal[] = [];

    const path = `${FRAUD_GUARD_CONFIG.rtdbPaths.heartbeatNonces}/${cleanSession}/${cleanNonce}`;
    const nonceRecord = await rtdbGet<HeartbeatNonceRecord>(path);

    // 1. Nonce existence & replay check
    if (!nonceRecord) {
      signals.push({
        type: "HEARTBEAT_INVALID_SESSION",
        severity: "high",
        penaltyPoints: FRAUD_GUARD_CONFIG.penalties.heartbeatInvalidSession,
        description: "Heartbeat nonce not found or session expired.",
        evidence: {
          sessionId: payload.sessionId,
          nonce: payload.nonce,
        },
        detectedAt: nowIso,
      });

      return {
        isValid: false,
        wallClockDeltaSeconds: 0,
        playbackDeltaSeconds: 0,
        speedRatio: 0,
        nextNonce: null,
        signals,
      };
    }

    if (nonceRecord.used) {
      signals.push({
        type: "HEARTBEAT_NONCE_REPLAY",
        severity: "critical",
        penaltyPoints: FRAUD_GUARD_CONFIG.penalties.heartbeatNonceReplay,
        description: "Single-use heartbeat nonce replayed. Automated script replay detected.",
        evidence: {
          sessionId: payload.sessionId,
          nonce: payload.nonce,
        },
        detectedAt: nowIso,
      });

      return {
        isValid: false,
        wallClockDeltaSeconds: 0,
        playbackDeltaSeconds: 0,
        speedRatio: 0,
        nextNonce: null,
        signals,
      };
    }

    // Immediately mark nonce as consumed to invalidate concurrent replays
    void rtdbSet(`${path}/used`, true);

    // 2. Nonce expiration check
    if (now > nonceRecord.expiresAt) {
      signals.push({
        type: "HEARTBEAT_NONCE_EXPIRED",
        severity: "medium",
        penaltyPoints: FRAUD_GUARD_CONFIG.penalties.heartbeatNonceExpired,
        description: `Heartbeat nonce expired (> ${FRAUD_GUARD_CONFIG.heartbeat.nonceTtlSeconds}s old).`,
        evidence: {
          ageSeconds: Math.round((now - nonceRecord.issuedAt) / 1000),
          maxTtl: FRAUD_GUARD_CONFIG.heartbeat.nonceTtlSeconds,
        },
        detectedAt: nowIso,
      });
    }

    // 3. Wall-Clock Delta vs Playback Delta Validation
    const wallClockDeltaSeconds = Math.max(
      0.1,
      Number(((now - nonceRecord.lastHeartbeatWallClock) / 1000).toFixed(2)),
    );

    const playbackDeltaSeconds = Math.max(
      0,
      Number((payload.currentPlaybackSeconds - nonceRecord.lastPlaybackSeconds).toFixed(2)),
    );

    const speedRatio = Number((playbackDeltaSeconds / wallClockDeltaSeconds).toFixed(2));

    // Check for speed manipulation (e.g., claiming 60s watched in 10s of real time)
    if (speedRatio > FRAUD_GUARD_CONFIG.heartbeat.maxAllowedSpeedRatio) {
      signals.push({
        type: "HEARTBEAT_TIME_WARP_ACCELERATION",
        severity: "critical",
        penaltyPoints: FRAUD_GUARD_CONFIG.penalties.heartbeatTimeWarpSpeedHack,
        description: `Playback progression time-warp detected: ${playbackDeltaSeconds}s media progressed in ${wallClockDeltaSeconds}s wall-clock time (speed: ${speedRatio}x).`,
        evidence: {
          speedRatio,
          playbackDeltaSeconds,
          wallClockDeltaSeconds,
          maxAllowedSpeedRatio: FRAUD_GUARD_CONFIG.heartbeat.maxAllowedSpeedRatio,
        },
        detectedAt: nowIso,
      });
    }

    // Check for burst spamming
    if (wallClockDeltaSeconds < FRAUD_GUARD_CONFIG.heartbeat.minExpectedDeltaSeconds) {
      signals.push({
        type: "BURST_REWARD_CLAIMING",
        severity: "high",
        penaltyPoints: FRAUD_GUARD_CONFIG.penalties.burstRewardClaiming,
        description: `Excessive heartbeat ping frequency: arrived in ${wallClockDeltaSeconds}s (minimum expected: ${FRAUD_GUARD_CONFIG.heartbeat.minExpectedDeltaSeconds}s).`,
        evidence: {
          wallClockDeltaSeconds,
          minExpectedDeltaSeconds: FRAUD_GUARD_CONFIG.heartbeat.minExpectedDeltaSeconds,
        },
        detectedAt: nowIso,
      });
    }

    // 4. Issue the next single-use nonce for seamless continuation
    const next = await this.issueNonce(
      payload.sessionId,
      payload.accountId,
      payload.deviceFingerprintId,
      payload.currentPlaybackSeconds,
    );

    const isValid = signals.length === 0;

    return {
      isValid,
      wallClockDeltaSeconds,
      playbackDeltaSeconds,
      speedRatio,
      nextNonce: next.nonce,
      signals,
    };
  }
}
