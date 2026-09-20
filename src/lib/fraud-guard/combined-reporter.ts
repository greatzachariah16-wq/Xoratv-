import { FRAUD_GUARD_CONFIG } from "./config";
import { rtdbGet, sanitizePathKey } from "./db";
import { FraudReporter } from "./reporter";
import type { CombinedDeviceProfile, UnifiedAnalyticsOverview, UnifiedFraudReport } from "./types";

/**
 * Combined Fraud Reporter & Analytics Aggregator.
 * Analyzes and aggregates metrics across both client-side hardware telemetry
 * and server-side network & collision records.
 */
export class CombinedFraudReporter {
  /**
   * Retrieves the most recent combined full-stack fraud reports.
   */
  public static async getRecentReports(limit = 50): Promise<UnifiedFraudReport[]> {
    const raw = await rtdbGet<Record<string, UnifiedFraudReport>>(
      FRAUD_GUARD_CONFIG.rtdbPaths.combinedReports,
    );

    if (!raw) return [];

    const list = Object.values(raw);
    list.sort((a, b) => (b.epochMs || 0) - (a.epochMs || 0));
    return list.slice(0, limit);
  }

  /**
   * Computes high-level aggregated analytics across combined sessions.
   */
  public static async getAnalyticsOverview(sampleLimit = 200): Promise<UnifiedAnalyticsOverview> {
    const reports = await this.getRecentReports(sampleLimit);
    const flaggedDevices = await FraudReporter.getFlaggedDevices(100);

    const total = reports.length;
    if (total === 0) {
      return {
        totalAssessments: 0,
        averageTrustScore: 100,
        riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
        botAndHeadlessRate: 0,
        multiAccountCollisionRate: 0,
        datacenterAndVpnRate: 0,
        speedHackRate: 0,
        syntheticEntropyRate: 0,
        flaggedDevicesCount: flaggedDevices.length,
        totalUniqueAccountsAssessed: 0,
        assessedAt: new Date().toISOString(),
      };
    }

    let scoreSum = 0;
    const riskDist = { low: 0, medium: 0, high: 0, critical: 0 };
    let botCount = 0;
    let collisionCount = 0;
    let dcOrVpnCount = 0;
    let speedHackCount = 0;
    let syntheticEntropyCount = 0;
    const uniqueAccounts = new Set<string>();

    reports.forEach((r) => {
      scoreSum += r.trustScore;
      riskDist[r.riskLevel]++;
      uniqueAccounts.add(r.accountId);

      if (
        r.clientSideSignals.isHeadlessOrBot ||
        r.clientSideSignals.webdriverFlag ||
        r.clientSideSignals.headlessGpu
      ) {
        botCount++;
      }

      if (r.serverSideSignals.isMultiAccountAbuse) {
        collisionCount++;
      }

      if (r.serverSideSignals.ipIsDatacenter || r.serverSideSignals.ipIsProxyOrVpn) {
        dcOrVpnCount++;
      }

      if (
        r.serverSideSignals.heartbeatSpeedRatio &&
        r.serverSideSignals.heartbeatSpeedRatio > FRAUD_GUARD_CONFIG.heartbeat.maxAllowedSpeedRatio
      ) {
        speedHackCount++;
      }

      if (!r.clientSideSignals.hasHumanInteractionEntropy) {
        syntheticEntropyCount++;
      }
    });

    return {
      totalAssessments: total,
      averageTrustScore: Math.round(scoreSum / total),
      riskDistribution: riskDist,
      botAndHeadlessRate: Number(((botCount / total) * 100).toFixed(1)),
      multiAccountCollisionRate: Number(((collisionCount / total) * 100).toFixed(1)),
      datacenterAndVpnRate: Number(((dcOrVpnCount / total) * 100).toFixed(1)),
      speedHackRate: Number(((speedHackCount / total) * 100).toFixed(1)),
      syntheticEntropyRate: Number(((syntheticEntropyCount / total) * 100).toFixed(1)),
      flaggedDevicesCount: flaggedDevices.length,
      totalUniqueAccountsAssessed: uniqueAccounts.size,
      assessedAt: new Date().toISOString(),
    };
  }

  /**
   * Retrieves a comprehensive profile of a specific device, combining hardware traits
   * with server-side account collision histories.
   */
  public static async getCombinedDeviceProfile(
    deviceFingerprintId: string,
  ): Promise<CombinedDeviceProfile | null> {
    const cleanId = sanitizePathKey(deviceFingerprintId);

    // Fetch hardware profile
    const profileNode = await rtdbGet<{
      hardware?: {
        platform?: string;
        screenResolution?: string;
        cores?: number;
        gpuRenderer?: string;
        timezone?: string;
      };
      lastTrustScore?: number;
      lastRiskLevel?: "low" | "medium" | "high" | "critical";
      lastAssessedAt?: string;
    }>(`${FRAUD_GUARD_CONFIG.rtdbPaths.devices}/${cleanId}/profile`);

    // Fetch linked accounts
    const accounts = await FraudReporter.getDeviceAccountHistory(deviceFingerprintId);

    if (!profileNode && accounts.length === 0) {
      return null;
    }

    return {
      deviceFingerprintId,
      hardware: profileNode?.hardware || {},
      accountsLinked: accounts,
      totalAccounts: accounts.length,
      isMultiAccountAbuse: accounts.length >= FRAUD_GUARD_CONFIG.deviceCollision.collisionThreshold,
      lastTrustScore: profileNode?.lastTrustScore ?? 100,
      lastRiskLevel: profileNode?.lastRiskLevel ?? "low",
      lastAssessedAt: profileNode?.lastAssessedAt || new Date().toISOString(),
    };
  }
}
