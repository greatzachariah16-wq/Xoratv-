import type { EnforcementMode } from "./types";

/**
 * Production Anti-Fraud Configuration for XoraTV.
 * All scoring weights, thresholds, TTLs, and limits are centrally declared here.
 */
export const FRAUD_GUARD_CONFIG = {
  // Global enforcement mode: "observe_only" logs all events without blocking.
  // Can be toggled to "enforce" whenever ready to reject automated abuse.
  enforcementMode: "observe_only" as EnforcementMode,

  // Trust Score Thresholds (0 - 100)
  thresholds: {
    minScoreForRewardEligibility: 65,
    criticalRiskCutoff: 35,
    highRiskCutoff: 55,
    mediumRiskCutoff: 75,
  },

  // Configurable Penalty Weights
  penalties: {
    // Multi-account collisions on a single device
    deviceTwoAccountsCollision: 10,
    deviceThreeAccountsCollision: 30,
    deviceFourOrMoreAccountsCollision: 50,

    // IP & Network Reputation
    datacenterOrHostingIp: 35,
    proxyOrVpnDetected: 25,
    torExitNode: 50,

    // Watch Session Heartbeat Tampering
    heartbeatTimeWarpSpeedHack: 45,
    heartbeatNonceReplay: 60,
    heartbeatNonceExpired: 30,
    heartbeatInvalidSession: 40,

    // Rate Limit Violations
    rateLimitIpMinuteExceeded: 30,
    rateLimitDeviceHourExceeded: 35,
    rateLimitAccountHourExceeded: 40,

    // Automation & Behavioral Flags
    webdriverAutomationDetected: 60,
    headlessBrowserDetected: 50,
    syntheticInteractionEntropy: 20,
    burstRewardClaiming: 40,
  },

  // Multi-Account Device Collision Rule
  deviceCollision: {
    rollingWindowDays: 30, // Rolling window for multi-account tracking
    collisionThreshold: 3, // 3+ distinct accounts on one device triggers collision alert
  },

  // Watch Session Heartbeat Rules
  heartbeat: {
    nonceTtlSeconds: 90, // Nonce expires after 90 seconds
    minExpectedDeltaSeconds: 8, // Minimum expected time between heartbeats
    maxExpectedDeltaSeconds: 65, // Maximum expected time between heartbeats
    maxAllowedSpeedRatio: 2.1, // Catch client time-acceleration or media speedup hacks
    minAllowedSpeedRatio: 0.1, // Minimum playback progression
  },

  // Rate Limiting Bucket Max Allowances
  rateLimits: {
    ipMinuteLimit: 60, // Max 60 requests per IP per minute
    deviceHourHeartbeats: 240, // Max 240 heartbeats per device per hour (~2 hours active streaming)
    deviceHourSignups: 3, // Max 3 signups per device per hour
    accountHourRewardClaims: 10, // Max 10 reward claims per account per hour
  },

  // IP Reputation Cache
  ipReputation: {
    cacheTtlHours: 168, // Cache IP reputation lookups in RTDB for 7 days (168h) to protect free quota
    apiTimeoutMs: 3500, // Timeout for external IP reputation API call
  },

  // Firebase RTDB Paths
  rtdbPaths: {
    devices: "fraud/devices",
    ipReputationCache: "fraud/ipReputation",
    rateLimits: "fraud/rateLimits",
    heartbeatNonces: "fraud/heartbeats",
    fraudEvents: "fraud/events",
    summaryMetrics: "fraud/metrics",
    combinedReports: "fraud/combinedReports",
  },
} as const;
