import { FRAUD_GUARD_CONFIG } from "./config";
import { rtdbGet, rtdbSet, sanitizePathKey } from "./db";
import type { FraudSignal, RateLimitCheckResult } from "./types";

/**
 * Generates an IP minute-bucket key formatted as YYYYMMDDHHmm (e.g. 202609200515).
 */
function getMinuteBucket(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${d}${h}${min}`;
}

/**
 * Generates an hour-bucket key formatted as YYYYMMDDHH (e.g. 2026092005).
 */
function getHourBucket(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  return `${y}${m}${d}${h}`;
}

/**
 * Database-backed rate limiter for Render free tier.
 * Persists counters in Firebase RTDB so state survives instance restarts and sleeps.
 * Auto-expires naturally via time-bucket keys.
 */
export class RateLimiter {
  /**
   * Evaluates request rate for an IP address on a 1-minute rolling bucket.
   */
  public static async checkIpVelocity(
    clientIp: string,
  ): Promise<{ result: RateLimitCheckResult; signal: FraudSignal | null }> {
    const cleanIp = sanitizePathKey(clientIp || "127.0.0.1");
    const bucket = getMinuteBucket();
    const path = `${FRAUD_GUARD_CONFIG.rtdbPaths.rateLimits}/ip/${cleanIp}/${bucket}`;
    const maxLimit = FRAUD_GUARD_CONFIG.rateLimits.ipMinuteLimit;

    const currentCount = (await rtdbGet<number>(path)) || 0;
    const nextCount = currentCount + 1;

    // Increment asynchronously
    void rtdbSet(path, nextCount);

    const allowed = currentCount < maxLimit;
    const retryAfterSeconds = allowed ? 0 : 60 - new Date().getUTCSeconds();

    let signal: FraudSignal | null = null;
    if (!allowed) {
      signal = {
        type: "RATE_LIMIT_IP_MINUTE_EXCEEDED",
        severity: "medium",
        penaltyPoints: FRAUD_GUARD_CONFIG.penalties.rateLimitIpMinuteExceeded,
        description: `IP rate limit exceeded: ${currentCount} requests within minute bucket ${bucket}.`,
        evidence: {
          clientIp,
          currentCount,
          maxLimit,
          bucket,
        },
        detectedAt: new Date().toISOString(),
      };
    }

    return {
      result: {
        allowed,
        key: cleanIp,
        bucket,
        currentCount,
        maxLimit,
        retryAfterSeconds,
      },
      signal,
    };
  }

  /**
   * Evaluates action velocity (e.g. heartbeats, signups, claims) for a device on a 1-hour bucket.
   */
  public static async checkDeviceActionVelocity(
    deviceFingerprintId: string,
    action: "heartbeat" | "signup" | "reward_claim",
  ): Promise<{ result: RateLimitCheckResult; signal: FraudSignal | null }> {
    const cleanDevice = sanitizePathKey(deviceFingerprintId);
    const bucket = getHourBucket();
    const path = `${FRAUD_GUARD_CONFIG.rtdbPaths.rateLimits}/device/${cleanDevice}/${action}_${bucket}`;

    let maxLimit = 100;
    if (action === "heartbeat") {
      maxLimit = FRAUD_GUARD_CONFIG.rateLimits.deviceHourHeartbeats;
    } else if (action === "signup") {
      maxLimit = FRAUD_GUARD_CONFIG.rateLimits.deviceHourSignups;
    } else if (action === "reward_claim") {
      maxLimit = FRAUD_GUARD_CONFIG.rateLimits.accountHourRewardClaims;
    }

    const currentCount = (await rtdbGet<number>(path)) || 0;
    const nextCount = currentCount + 1;

    void rtdbSet(path, nextCount);

    const allowed = currentCount < maxLimit;
    const retryAfterSeconds = allowed ? 0 : (60 - new Date().getUTCMinutes()) * 60;

    let signal: FraudSignal | null = null;
    if (!allowed) {
      signal = {
        type: "RATE_LIMIT_DEVICE_HOUR_EXCEEDED",
        severity: "high",
        penaltyPoints: FRAUD_GUARD_CONFIG.penalties.rateLimitDeviceHourExceeded,
        description: `Device velocity exceeded: ${currentCount} '${action}' actions in hour bucket ${bucket} (limit: ${maxLimit}).`,
        evidence: {
          deviceFingerprintId,
          action,
          currentCount,
          maxLimit,
        },
        detectedAt: new Date().toISOString(),
      };
    }

    return {
      result: {
        allowed,
        key: cleanDevice,
        bucket,
        currentCount,
        maxLimit,
        retryAfterSeconds,
      },
      signal,
    };
  }
}
