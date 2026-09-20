import { generateDeviceFingerprint } from "./fingerprint";
import { telemetryCollector } from "./telemetry";
import type {
  AccountDeviceLink,
  AnomalySignal,
  DeviceCollisionReport,
  DeviceFingerprint,
  FraudAssessment,
  RiskLevel,
} from "./types";

const LOCAL_DEVICE_LINKS_KEY = "xora_fraud_device_links";

/**
 * Retrieves recorded account-device links from local storage.
 */
export function getStoredDeviceLinks(): AccountDeviceLink[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_DEVICE_LINKS_KEY);
    return raw ? (JSON.parse(raw) as AccountDeviceLink[]) : [];
  } catch {
    return [];
  }
}

/**
 * Registers an account and email association with the current device fingerprint.
 * Detects multiple account abuse even if different emails are used.
 */
export function recordDeviceAccountLink(
  deviceId: string,
  accountId: string,
  email: string | null,
): DeviceCollisionReport {
  const links = getStoredDeviceLinks();
  const now = new Date().toISOString();

  const existing = links.find((l) => l.deviceId === deviceId && l.accountId === accountId);

  if (existing) {
    existing.lastSeenAt = now;
    existing.sessionCount += 1;
    if (email && !existing.email) existing.email = email;
  } else {
    links.push({
      deviceId,
      accountId,
      email: email || null,
      firstSeenAt: now,
      lastSeenAt: now,
      sessionCount: 1,
    });
  }

  // Keep last 100 records
  if (links.length > 100) {
    links.splice(0, links.length - 100);
  }

  try {
    localStorage.setItem(LOCAL_DEVICE_LINKS_KEY, JSON.stringify(links));
  } catch {
    // Storage full or unavailable
  }

  // Calculate collisions for this specific device
  const deviceRecords = links.filter((l) => l.deviceId === deviceId);
  const distinctAccountIds = Array.from(new Set(deviceRecords.map((r) => r.accountId)));
  const distinctEmails = Array.from(
    new Set(deviceRecords.map((r) => r.email).filter(Boolean) as string[]),
  );

  return {
    deviceId,
    distinctAccountCount: distinctAccountIds.length,
    distinctEmails,
    isMultiAccountAbuse: distinctAccountIds.length >= 2,
    firstObservedAt: deviceRecords[0]?.firstSeenAt || now,
  };
}

/**
 * Performs a comprehensive fraud, bot, and multi-account assessment.
 */
export async function assessFraudRisk(options?: {
  currentAccountId?: string | null;
  currentEmail?: string | null;
  cachedFingerprint?: DeviceFingerprint;
}): Promise<FraudAssessment> {
  const fingerprint = options?.cachedFingerprint || (await generateDeviceFingerprint());
  const telemetry = telemetryCollector.getTelemetry();

  const signals: AnomalySignal[] = [];
  let score = 100;
  const now = new Date().toISOString();

  // 1. Check Automation / Webdriver flag
  if (fingerprint.environment.webdriver) {
    signals.push({
      type: "WEBDRIVER_AUTOMATION_FLAG",
      severity: "critical",
      penaltyPoints: 60,
      description: "navigator.webdriver automation flag detected (Puppeteer/Selenium/Playwright).",
      evidence: { webdriver: true },
      timestamp: now,
    });
    score -= 60;
  }

  // 2. Check Headless GPU / Emulated Renderer
  if (fingerprint.webgl.isHeadlessGpu) {
    signals.push({
      type: "HEADLESS_BROWSER_SIGNATURE",
      severity: "high",
      penaltyPoints: 50,
      description:
        "Virtual or software rasterizer GPU detected (SwiftShader/llvmpipe/Mesa/VMware).",
      evidence: {
        renderer: fingerprint.webgl.renderer,
        unmaskedRenderer: fingerprint.webgl.unmaskedRenderer,
      },
      timestamp: now,
    });
    score -= 50;
  }

  // 3. Check Headless script artifacts
  if (
    fingerprint.environment.phantomJs ||
    fingerprint.environment.nightmareJs ||
    fingerprint.environment.selenium ||
    fingerprint.environment.domAutomation
  ) {
    signals.push({
      type: "HEADLESS_BROWSER_SIGNATURE",
      severity: "critical",
      penaltyPoints: 55,
      description: "Automation environment artifacts detected in global window namespace.",
      evidence: {
        phantom: fingerprint.environment.phantomJs,
        selenium: fingerprint.environment.selenium,
        domAutomation: fingerprint.environment.domAutomation,
      },
      timestamp: now,
    });
    score -= 55;
  }

  // 4. Multi-Account Device Collision Check
  let collisionReport: DeviceCollisionReport = {
    deviceId: fingerprint.fingerprintId,
    distinctAccountCount: 1,
    distinctEmails: [],
    isMultiAccountAbuse: false,
    firstObservedAt: now,
  };

  if (options?.currentAccountId) {
    collisionReport = recordDeviceAccountLink(
      fingerprint.fingerprintId,
      options.currentAccountId,
      options.currentEmail || null,
    );
  } else {
    // Read existing links for device
    const links = getStoredDeviceLinks().filter((l) => l.deviceId === fingerprint.fingerprintId);
    const distinctAccs = Array.from(new Set(links.map((l) => l.accountId)));
    collisionReport = {
      deviceId: fingerprint.fingerprintId,
      distinctAccountCount: distinctAccs.length,
      distinctEmails: Array.from(new Set(links.map((l) => l.email).filter(Boolean) as string[])),
      isMultiAccountAbuse: distinctAccs.length >= 2,
      firstObservedAt: links[0]?.firstSeenAt || now,
    };
  }

  if (collisionReport.distinctAccountCount >= 3) {
    const penalty = Math.min(45, 20 + (collisionReport.distinctAccountCount - 2) * 10);
    signals.push({
      type: "MULTI_ACCOUNT_DEVICE_COLLISION",
      severity: "high",
      penaltyPoints: penalty,
      description: `Device fingerprint linked to ${collisionReport.distinctAccountCount} distinct user accounts (${collisionReport.distinctEmails.length} emails).`,
      evidence: {
        distinctAccounts: collisionReport.distinctAccountCount,
        emailsDetected: collisionReport.distinctEmails.join(", "),
      },
      timestamp: now,
    });
    score -= penalty;
  } else if (collisionReport.distinctAccountCount === 2) {
    signals.push({
      type: "MULTI_ACCOUNT_DEVICE_COLLISION",
      severity: "low",
      penaltyPoints: 10,
      description: "Multiple accounts observed on this single device fingerprint.",
      evidence: {
        distinctAccounts: 2,
      },
      timestamp: now,
    });
    score -= 10;
  }

  // 5. Check Scroll Dynamics (Linear / macro scripts)
  if (telemetry.scrollCount >= 6 && !telemetry.hasHumanScrollCurves) {
    signals.push({
      type: "LINEAR_OR_MACRO_SCROLL",
      severity: "medium",
      penaltyPoints: 25,
      description: "Zero or abnormal scroll velocity variance detected (synthetic scroll script).",
      evidence: {
        scrollCount: telemetry.scrollCount,
        scrollVelocityVariance: telemetry.scrollVelocityVariance,
      },
      timestamp: now,
    });
    score -= 25;
  }

  // 6. Check Touch Dynamics (Zero radius or missing jitter on touch devices)
  if (
    fingerprint.hardware.touchScreenSupported &&
    telemetry.touchCount >= 4 &&
    telemetry.averageTouchRadius === 0
  ) {
    signals.push({
      type: "SYNTHETIC_TOUCH_DYNAMICS",
      severity: "medium",
      penaltyPoints: 20,
      description:
        "Touch events generated with 0-pixel contact radius (synthetic simulator or macro).",
      evidence: {
        touchCount: telemetry.touchCount,
        averageTouchRadius: telemetry.averageTouchRadius,
      },
      timestamp: now,
    });
    score -= 20;
  }

  // 7. Check Background vs Foreground Dwell Ratio
  const totalDwell = telemetry.activeForegroundSeconds + telemetry.backgroundSeconds;
  if (totalDwell > 45 && telemetry.backgroundSeconds / totalDwell > 0.85) {
    signals.push({
      type: "BACKGROUND_EXCESSIVE_DWELL",
      severity: "low",
      penaltyPoints: 15,
      description: "User tab in background for >85% of active session duration.",
      evidence: {
        foregroundSec: telemetry.activeForegroundSeconds,
        backgroundSec: telemetry.backgroundSeconds,
        ratio: (telemetry.backgroundSeconds / totalDwell).toFixed(2),
      },
      timestamp: now,
    });
    score -= 15;
  }

  // 8. Rapid-Fire Automation clicks
  if (telemetry.rapidClickBurstCount > 0) {
    signals.push({
      type: "RAPID_FIRE_AUTOMATION",
      severity: "medium",
      penaltyPoints: 20,
      description: "Superhuman click frequency burst detected.",
      evidence: { burstCount: telemetry.rapidClickBurstCount },
      timestamp: now,
    });
    score -= 20;
  }

  // Clamp score between 0 and 100
  const finalScore = Math.max(0, Math.min(100, score));

  // Determine Risk Level
  let riskLevel: RiskLevel = "low";
  if (finalScore < 40) {
    riskLevel = "critical";
  } else if (finalScore < 60) {
    riskLevel = "high";
  } else if (finalScore < 80) {
    riskLevel = "medium";
  }

  const isHeadlessOrBot =
    fingerprint.environment.webdriver ||
    fingerprint.webgl.isHeadlessGpu ||
    fingerprint.environment.phantomJs ||
    fingerprint.environment.selenium;

  return {
    trustScore: finalScore,
    riskLevel,
    deviceFingerprintId: fingerprint.fingerprintId,
    isEligibleForRewards: finalScore >= 65 && !isHeadlessOrBot,
    isHeadlessOrBot,
    isMultipleAccountCollusion: collisionReport.distinctAccountCount >= 3,
    signals,
    telemetrySummary: telemetry,
    deviceSummary: {
      gpuRenderer: fingerprint.webgl.unmaskedRenderer || fingerprint.webgl.renderer,
      screen: fingerprint.hardware.screenResolution,
      platform: fingerprint.hardware.platform,
      timezone: fingerprint.hardware.timezone,
      cores: fingerprint.hardware.hardwareConcurrency,
      touchPoints: fingerprint.hardware.maxTouchPoints,
    },
    assessedAt: now,
  };
}
