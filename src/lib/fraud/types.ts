export type RiskLevel = "low" | "medium" | "high" | "critical";

export type AnomalyType =
  | "WEBDRIVER_AUTOMATION_FLAG"
  | "HEADLESS_BROWSER_SIGNATURE"
  | "SYNTHETIC_TOUCH_DYNAMICS"
  | "LINEAR_OR_MACRO_SCROLL"
  | "UNNATURAL_MOUSE_TRAJECTORY"
  | "ZERO_ENTROPY_INTERACTION"
  | "BACKGROUND_EXCESSIVE_DWELL"
  | "MULTI_ACCOUNT_DEVICE_COLLISION"
  | "HARDWARE_CONCURRENCY_SPOOF"
  | "CANVAS_TAMPERING_SUSPICION"
  | "RAPID_FIRE_AUTOMATION";

export interface AnomalySignal {
  type: AnomalyType;
  severity: "low" | "medium" | "high" | "critical";
  penaltyPoints: number;
  description: string;
  evidence: Record<string, string | number | boolean | null>;
  timestamp: string;
}

export interface CanvasFingerprint {
  hash: string;
  windingSupported: boolean;
  textMetricsHash: string;
  dataUrlSnippet: string;
}

export interface WebGLFingerprint {
  hash: string;
  vendor: string;
  renderer: string;
  unmaskedVendor: string;
  unmaskedRenderer: string;
  isHeadlessGpu: boolean;
  maxTextureSize: number;
  extensionsCount: number;
}

export interface AudioFingerprint {
  hash: string;
  sampleRate: number;
  maxChannelCount: number;
  dynamicsCompressorReduction?: number;
  supported: boolean;
}

export interface HardwareVector {
  screenResolution: string;
  availableResolution: string;
  colorDepth: number;
  pixelRatio: number;
  hardwareConcurrency: number;
  deviceMemoryGB: number | null;
  maxTouchPoints: number;
  timezone: string;
  timezoneOffsetMinutes: number;
  platform: string;
  touchScreenSupported: boolean;
}

export interface EnvironmentFlags {
  webdriver: boolean;
  phantomJs: boolean;
  nightmareJs: boolean;
  selenium: boolean;
  domAutomation: boolean;
  chromeRuntimeMissing: boolean;
  pluginsLength: number;
  languages: string[];
}

export interface DeviceFingerprint {
  fingerprintId: string;
  canvas: CanvasFingerprint;
  webgl: WebGLFingerprint;
  audio: AudioFingerprint;
  hardware: HardwareVector;
  environment: EnvironmentFlags;
  collectedAt: string;
}

export interface ScrollSample {
  timestamp: number;
  scrollY: number;
  deltaY: number;
  durationMs: number;
  velocity: number;
  acceleration: number;
}

export interface TouchSample {
  timestamp: number;
  identifier: number;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  force: number;
}

export interface MouseSample {
  timestamp: number;
  x: number;
  y: number;
  speed: number;
}

export interface InteractionTelemetry {
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
}

export interface AccountDeviceLink {
  deviceId: string;
  accountId: string;
  email: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  sessionCount: number;
}

export interface DeviceCollisionReport {
  deviceId: string;
  distinctAccountCount: number;
  distinctEmails: string[];
  isMultiAccountAbuse: boolean;
  firstObservedAt: string;
}

export interface FraudAssessment {
  trustScore: number; // 0 (Definite Bot/Abuse) to 100 (Verified Human)
  riskLevel: RiskLevel;
  deviceFingerprintId: string;
  isEligibleForRewards: boolean;
  isHeadlessOrBot: boolean;
  isMultipleAccountCollusion: boolean;
  signals: AnomalySignal[];
  telemetrySummary: InteractionTelemetry;
  deviceSummary: {
    gpuRenderer: string;
    screen: string;
    platform: string;
    timezone: string;
    cores: number;
    touchPoints: number;
  };
  assessedAt: string;
}
