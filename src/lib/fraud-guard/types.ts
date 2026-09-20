/**
 * Comprehensive Type Definitions for FraudGuard.
 * Production-grade Anti-Bot & Anti-Reward-Abuse Engine.
 */

export type EnforcementMode = "observe_only" | "enforce";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type DecisionAction = "allow" | "flag" | "challenge" | "block";

export type FraudSignalType =
  | "MULTI_ACCOUNT_DEVICE_COLLISION"
  | "DATACENTER_OR_HOSTING_IP"
  | "VPN_OR_PROXY_DETECTED"
  | "TOR_EXIT_NODE"
  | "HEARTBEAT_TIME_WARP_ACCELERATION"
  | "HEARTBEAT_NONCE_REPLAY"
  | "HEARTBEAT_NONCE_EXPIRED"
  | "HEARTBEAT_INVALID_SESSION"
  | "RATE_LIMIT_IP_MINUTE_EXCEEDED"
  | "RATE_LIMIT_DEVICE_HOUR_EXCEEDED"
  | "RATE_LIMIT_ACCOUNT_HOUR_EXCEEDED"
  | "BEHAVIORAL_SYNTHETIC_INTERACTION"
  | "WEBDRIVER_AUTOMATION_FLAG"
  | "HEADLESS_GPU_OR_BROWSER"
  | "BURST_REWARD_CLAIMING";

export interface FraudSignal {
  type: FraudSignalType;
  severity: RiskLevel;
  penaltyPoints: number;
  description: string;
  evidence: Record<string, string | number | boolean | null>;
  detectedAt: string;
}

export interface IPReputationData {
  ip: string;
  isDatacenter: boolean;
  isProxy: boolean;
  isVpn: boolean;
  isTor: boolean;
  countryCode: string;
  countryName: string;
  isp: string;
  asOrganization: string;
  asn: string;
  cachedAt: number;
  expiresAt: number;
}

export interface DeviceAccountRecord {
  accountId: string;
  email: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  sessionCount: number;
}

export interface DeviceLinkAssessment {
  deviceFingerprintId: string;
  distinctAccounts: string[];
  distinctEmails: string[];
  totalSessions: number;
  isCollisionAbuse: boolean;
  collisionCount: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  key: string;
  bucket: string;
  currentCount: number;
  maxLimit: number;
  retryAfterSeconds: number;
}

export interface HeartbeatNonceRecord {
  nonce: string;
  sessionId: string;
  accountId: string;
  deviceFingerprintId: string;
  issuedAt: number;
  expiresAt: number;
  lastPlaybackSeconds: number;
  lastHeartbeatWallClock: number;
  used: boolean;
}

export interface WatchHeartbeatPayload {
  nonce: string;
  sessionId: string;
  accountId: string;
  deviceFingerprintId: string;
  clientIp: string;
  currentPlaybackSeconds: number;
  playbackRate?: number;
  claimedDeltaSeconds: number;
  videoDurationSeconds?: number;
  behavioralSignals?: Array<{
    type: string;
    penalty: number;
    description: string;
  }>;
}

export interface WatchHeartbeatValidationResult {
  isValid: boolean;
  action: DecisionAction;
  enforcementMode: EnforcementMode;
  trustScore: number;
  riskLevel: RiskLevel;
  nextNonce: string | null;
  wallClockDeltaSeconds: number;
  playbackDeltaSeconds: number;
  speedRatio: number;
  signals: FraudSignal[];
  evaluatedAt: string;
}

export interface AccountActionPayload {
  actionType: "signup" | "reward_claim" | "profile_update" | "ad_view";
  accountId: string;
  deviceFingerprintId: string;
  clientIp: string;
  email?: string | null;
}

export interface CompositeTrustAssessment {
  trustScore: number; // 0 to 100
  riskLevel: RiskLevel;
  recommendedAction: DecisionAction;
  enforcementMode: EnforcementMode;
  isEligibleForRewards: boolean;
  deviceFingerprintId: string;
  accountId: string;
  clientIp: string;
  signals: FraudSignal[];
  breakdown: {
    deviceCollisionPenalty: number;
    ipReputationPenalty: number;
    heartbeatPenalty: number;
    rateLimitPenalty: number;
    behavioralPenalty: number;
  };
  assessedAt: string;
}

export interface FraudEventRecord {
  eventId: string;
  eventType: "heartbeat" | "account_action" | "rate_limit_violation";
  accountId: string;
  deviceFingerprintId: string;
  clientIp: string;
  trustScore: number;
  riskLevel: RiskLevel;
  action: DecisionAction;
  enforcementMode: EnforcementMode;
  signals: FraudSignal[];
  timestamp: string;
  epochMs: number;
}

export interface UnifiedSessionInput {
  accountId: string;
  email?: string | null;
  clientIp: string;
  deviceFingerprint?: {
    fingerprintId: string;
    hardware: {
      platform: string;
      screenResolution: string;
      hardwareConcurrency: number;
      timezone: string;
      maxTouchPoints: number;
    };
    webgl: {
      renderer: string;
      unmaskedRenderer?: string;
      isHeadlessGpu: boolean;
    };
    environment: {
      webdriver: boolean;
      phantomJs: boolean;
      nightmareJs: boolean;
      selenium: boolean;
      domAutomation: boolean;
    };
  };
  telemetry?: {
    scrollCount: number;
    scrollVelocityVariance: number;
    hasHumanScrollCurves: boolean;
    touchCount: number;
    averageTouchRadius: number;
    touchPressureVariance: number;
    hasHumanTouchJitter: boolean;
    mouseMoveCount: number;
    mouseTrajectoryCurvature: number;
    activeForegroundSeconds: number;
    backgroundSeconds: number;
    rapidClickBurstCount: number;
    totalInteractionEvents: number;
  };
  heartbeat?: {
    sessionId: string;
    nonce: string;
    currentPlaybackSeconds: number;
    claimedDeltaSeconds: number;
  };
}

export interface UnifiedFraudReport {
  reportId: string;
  accountId: string;
  deviceFingerprintId: string;
  clientIp: string;
  trustScore: number;
  riskLevel: RiskLevel;
  recommendedAction: DecisionAction;
  enforcementMode: EnforcementMode;
  isEligibleForRewards: boolean;
  clientSideSignals: {
    isHeadlessOrBot: boolean;
    webdriverFlag: boolean;
    headlessGpu: boolean;
    hasHumanInteractionEntropy: boolean;
    interactionEventCount: number;
    foregroundDwellSeconds: number;
    backgroundDwellSeconds: number;
  };
  serverSideSignals: {
    ipIsDatacenter: boolean;
    ipIsProxyOrVpn: boolean;
    ipIsp: string;
    ipCountry: string;
    deviceCollisionCount: number;
    distinctEmailsOnDevice: string[];
    isMultiAccountAbuse: boolean;
    heartbeatValid?: boolean;
    heartbeatSpeedRatio?: number;
    rateLimitExceeded: boolean;
  };
  allSignals: FraudSignal[];
  scoreBreakdown: {
    deviceCollisionPenalty: number;
    ipReputationPenalty: number;
    heartbeatPenalty: number;
    rateLimitPenalty: number;
    behavioralPenalty: number;
  };
  assessedAt: string;
  epochMs: number;
}

export interface UnifiedAnalyticsOverview {
  totalAssessments: number;
  averageTrustScore: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  botAndHeadlessRate: number; // percentage 0-100
  multiAccountCollisionRate: number; // percentage 0-100
  datacenterAndVpnRate: number; // percentage 0-100
  speedHackRate: number; // percentage 0-100
  syntheticEntropyRate: number; // percentage 0-100
  flaggedDevicesCount: number;
  totalUniqueAccountsAssessed: number;
  assessedAt: string;
}

export interface CombinedDeviceProfile {
  deviceFingerprintId: string;
  hardware: {
    platform?: string;
    screenResolution?: string;
    cores?: number;
    gpuRenderer?: string;
    timezone?: string;
  };
  accountsLinked: Array<{
    accountId: string;
    email: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    sessionCount: number;
  }>;
  totalAccounts: number;
  isMultiAccountAbuse: boolean;
  lastTrustScore: number;
  lastRiskLevel: RiskLevel;
  lastAssessedAt: string;
}
