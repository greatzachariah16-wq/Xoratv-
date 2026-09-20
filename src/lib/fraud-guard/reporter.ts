import { FRAUD_GUARD_CONFIG } from "./config";
import { rtdbGet, sanitizePathKey } from "./db";
import type { FraudEventRecord } from "./types";

export interface DeviceSummaryNode {
  totalDistinctAccounts: number;
  isFlagged: boolean;
  lastSeenAt: string;
  lastAccountId: string;
}

export interface AdminFraudMetrics {
  totalEventsLogged: number;
  totalFlaggedDevices: number;
  criticalEventsCount: number;
  highRiskEventsCount: number;
  datacenterIpCount: number;
  collisionAbuseCount: number;
  averageTrustScore: number;
}

/**
 * Data Access and Reporting Layer for Future Admin Dashboards.
 * Clean query layer over Firebase RTDB fraud nodes.
 * NOT wired to any UI or route.
 */
export class FraudReporter {
  /**
   * Retrieves recent fraud audit events.
   */
  public static async getRecentFraudEvents(limit = 50): Promise<FraudEventRecord[]> {
    const raw = await rtdbGet<Record<string, FraudEventRecord>>(
      FRAUD_GUARD_CONFIG.rtdbPaths.fraudEvents,
    );

    if (!raw) return [];

    const events = Object.values(raw);
    events.sort((a, b) => (b.epochMs || 0) - (a.epochMs || 0));
    return events.slice(0, limit);
  }

  /**
   * Retrieves devices that have hit multi-account collision thresholds.
   */
  public static async getFlaggedDevices(limit = 30): Promise<
    Array<{
      deviceId: string;
      totalDistinctAccounts: number;
      isFlagged: boolean;
      lastSeenAt: string;
      lastAccountId: string;
    }>
  > {
    const raw = await rtdbGet<Record<string, { summary?: DeviceSummaryNode }>>(
      FRAUD_GUARD_CONFIG.rtdbPaths.devices,
    );

    if (!raw) return [];

    const flaggedList: Array<{
      deviceId: string;
      totalDistinctAccounts: number;
      isFlagged: boolean;
      lastSeenAt: string;
      lastAccountId: string;
    }> = [];

    Object.entries(raw).forEach(([deviceId, node]) => {
      if (node?.summary) {
        if (
          node.summary.isFlagged ||
          node.summary.totalDistinctAccounts >=
            FRAUD_GUARD_CONFIG.deviceCollision.collisionThreshold
        ) {
          flaggedList.push({
            deviceId,
            totalDistinctAccounts: node.summary.totalDistinctAccounts,
            isFlagged: node.summary.isFlagged,
            lastSeenAt: node.summary.lastSeenAt,
            lastAccountId: node.summary.lastAccountId,
          });
        }
      }
    });

    flaggedList.sort((a, b) => b.totalDistinctAccounts - a.totalDistinctAccounts);
    return flaggedList.slice(0, limit);
  }

  /**
   * Aggregates summary statistics for anti-fraud observability.
   */
  public static async getFraudSummaryMetrics(): Promise<AdminFraudMetrics> {
    const events = await this.getRecentFraudEvents(100);
    const flaggedDevices = await this.getFlaggedDevices(100);

    let criticalCount = 0;
    let highRiskCount = 0;
    let dcCount = 0;
    let collisionCount = 0;
    let scoreSum = 0;

    events.forEach((ev) => {
      scoreSum += ev.trustScore;
      if (ev.riskLevel === "critical") criticalCount++;
      if (ev.riskLevel === "high") highRiskCount++;

      ev.signals.forEach((sig) => {
        if (sig.type === "DATACENTER_OR_HOSTING_IP") dcCount++;
        if (sig.type === "MULTI_ACCOUNT_DEVICE_COLLISION") collisionCount++;
      });
    });

    return {
      totalEventsLogged: events.length,
      totalFlaggedDevices: flaggedDevices.length,
      criticalEventsCount: criticalCount,
      highRiskEventsCount: highRiskCount,
      datacenterIpCount: dcCount,
      collisionAbuseCount: collisionCount,
      averageTrustScore: events.length > 0 ? Math.round(scoreSum / events.length) : 100,
    };
  }

  /**
   * Fetches full account history linked to a specific device fingerprint.
   */
  public static async getDeviceAccountHistory(deviceFingerprintId: string): Promise<
    Array<{
      accountId: string;
      email: string | null;
      firstSeenAt: string;
      lastSeenAt: string;
      sessionCount: number;
    }>
  > {
    const cleanId = sanitizePathKey(deviceFingerprintId);
    const path = `${FRAUD_GUARD_CONFIG.rtdbPaths.devices}/${cleanId}/accounts`;
    const accountsNode = await rtdbGet<
      Record<
        string,
        {
          accountId: string;
          email: string | null;
          firstSeenAt: string;
          lastSeenAt: string;
          sessionCount: number;
        }
      >
    >(path);

    if (!accountsNode) return [];
    return Object.values(accountsNode);
  }
}
