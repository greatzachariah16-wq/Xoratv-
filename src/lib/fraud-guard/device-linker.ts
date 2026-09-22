import { FRAUD_GUARD_CONFIG } from "./config";
import { rtdbGet, rtdbSet, sanitizePathKey } from "./db";
import type { DeviceAccountRecord, DeviceLinkAssessment, FraudSignal } from "./types";

interface StoredAccountNode {
  accountId: string;
  email: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSeenEpoch: number;
  sessionCount: number;
}

/**
 * Server-side Device-Account Linker (Firebase RTDB Backed).
 * Tracks device-to-account mappings and flags multi-account farming collisions
 * within a rolling time window.
 */
export class DeviceLinker {
  /**
   * Records an account session on a device fingerprint and evaluates collision risk.
   * Performs a single, lightweight RTDB lookup and write.
   */
  public static async linkAndAssess(
    deviceFingerprintId: string,
    accountId: string,
    email: string | null = null,
  ): Promise<{
    assessment: DeviceLinkAssessment;
    signals: FraudSignal[];
  }> {
    const cleanDeviceId = sanitizePathKey(deviceFingerprintId);
    const cleanAccountId = sanitizePathKey(accountId);
    const accountsPath = `${FRAUD_GUARD_CONFIG.rtdbPaths.devices}/${cleanDeviceId}/accounts`;
    const nowIso = new Date().toISOString();
    const nowEpoch = Date.now();

    // 1. Single lookup of accounts linked to this device
    const existingAccounts = (await rtdbGet<Record<string, StoredAccountNode>>(accountsPath)) || {};

    // 2. Filter accounts within the rolling window
    const windowMs = FRAUD_GUARD_CONFIG.deviceCollision.rollingWindowDays * 24 * 60 * 60 * 1000;
    const cutoffEpoch = nowEpoch - windowMs;

    const activeAccounts = Object.values(existingAccounts).filter(
      (rec) => (rec.lastSeenEpoch || 0) >= cutoffEpoch,
    );

    // Collect distinct account IDs and emails
    const distinctAccountIds = new Set<string>(activeAccounts.map((a) => a.accountId));
    distinctAccountIds.add(accountId);

    const distinctEmails = new Set<string>();
    activeAccounts.forEach((a) => {
      if (a.email) distinctEmails.add(a.email);
    });
    if (email) distinctEmails.add(email);

    const collisionCount = distinctAccountIds.size;
    const isCollisionAbuse =
      collisionCount >= FRAUD_GUARD_CONFIG.deviceCollision.collisionThreshold;

    // 3. Prepare current account record update
    const currentRec = existingAccounts[cleanAccountId];
    const updatedRecord: StoredAccountNode = {
      accountId,
      email: email || currentRec?.email || null,
      firstSeenAt: currentRec?.firstSeenAt || nowIso,
      lastSeenAt: nowIso,
      lastSeenEpoch: nowEpoch,
      sessionCount: (currentRec?.sessionCount || 0) + 1,
    };

    // 4. Update the account node in RTDB (asynchronous, non-blocking for speed)
    void rtdbSet(`${accountsPath}/${cleanAccountId}`, updatedRecord);

    // Record account-devices lookup for multi-device login warning dashboard
    const todayIso = nowIso.slice(0, 10);
    const accountDevicesPath = `accountDevices/${cleanAccountId}/${todayIso}/${cleanDeviceId}`;
    void rtdbSet(accountDevicesPath, {
      lastSeenAt: nowIso,
      email: email || null,
    });

    // Also update lightweight device summary for easy indexing
    const summaryPath = `${FRAUD_GUARD_CONFIG.rtdbPaths.devices}/${cleanDeviceId}/summary`;
    void rtdbSet(summaryPath, {
      totalDistinctAccounts: collisionCount,
      isFlagged: isCollisionAbuse,
      lastSeenAt: nowIso,
      lastAccountId: accountId,
    });

    // 5. Generate Anomaly Signals based on collision severity
    const signals: FraudSignal[] = [];

    if (collisionCount >= 4) {
      signals.push({
        type: "MULTI_ACCOUNT_DEVICE_COLLISION",
        severity: "critical",
        penaltyPoints: FRAUD_GUARD_CONFIG.penalties.deviceFourOrMoreAccountsCollision,
        description: `Severe multi-account collision: ${collisionCount} distinct accounts observed on hardware fingerprint within ${FRAUD_GUARD_CONFIG.deviceCollision.rollingWindowDays} days.`,
        evidence: {
          collisionCount,
          emailsDetected: Array.from(distinctEmails).join(", "),
          deviceFingerprintId,
        },
        detectedAt: nowIso,
      });
    } else if (collisionCount >= 3) {
      signals.push({
        type: "MULTI_ACCOUNT_DEVICE_COLLISION",
        severity: "high",
        penaltyPoints: FRAUD_GUARD_CONFIG.penalties.deviceThreeAccountsCollision,
        description: `Multi-account farming threshold reached: 3 distinct accounts linked to this device fingerprint.`,
        evidence: {
          collisionCount: 3,
          emailsDetected: Array.from(distinctEmails).join(", "),
          deviceFingerprintId,
        },
        detectedAt: nowIso,
      });
    } else if (collisionCount === 2) {
      signals.push({
        type: "MULTI_ACCOUNT_DEVICE_COLLISION",
        severity: "low",
        penaltyPoints: FRAUD_GUARD_CONFIG.penalties.deviceTwoAccountsCollision,
        description: `Multiple accounts (2) detected on the same hardware fingerprint.`,
        evidence: {
          collisionCount: 2,
          deviceFingerprintId,
        },
        detectedAt: nowIso,
      });
    }

    const totalSessions =
      Object.values(existingAccounts).reduce((sum, a) => sum + (a.sessionCount || 0), 0) + 1;

    const assessment: DeviceLinkAssessment = {
      deviceFingerprintId,
      distinctAccounts: Array.from(distinctAccountIds),
      distinctEmails: Array.from(distinctEmails),
      totalSessions,
      isCollisionAbuse,
      collisionCount,
    };

    return { assessment, signals };
  }
}
