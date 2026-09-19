/**
 * Xora Mobile Data Usage & Bandwidth Optimization Engine.
 *
 * Enforces a strict 300 MB/hour maximum data budget:
 * - 300 MB / 3600 seconds = 83.3 KB/sec = 666.7 kbps bandwidth ceiling.
 * - Video stream profile: 360p / 240p @ ~550 kbps video + ~96 kbps audio (~280 MB/hr total).
 * - Constrained forward buffering: 8s max forward buffer to avoid wasting data on skipped videos.
 * - Adaptive image sizing: transforms remote posters/thumbnails to <=400px width.
 * - Real-time session data usage monitoring & telemetry.
 */

export type DataSaverMode = "300mb_saver" | "150mb_ultra" | "auto" | "off";

export interface DataSaverConfig {
  mode: DataSaverMode;
  maxBitrateKbps: number; // Maximum combined audio/video bitrate
  maxResolutionHeight: number; // Max video vertical resolution (e.g. 360)
  maxBufferLengthSeconds: number; // Forward buffer limit in seconds
  maxBufferSizeMb: number; // HLS buffer size limit in MB
  enableImageCompression: boolean; // Compress thumbnails/posters
  autoDetectMobile: boolean; // Auto-enable on cellular / mobile connections
}

export interface DataUsageStats {
  sessionBytesUsed: number;
  sessionPlaybackSeconds: number;
  currentBitrateKbps: number;
  hourlyRateMb: number;
  savingsPercent: number;
}

const STORAGE_KEY = "xora_data_saver_mode";

const PRESETS: Record<DataSaverMode, Omit<DataSaverConfig, "mode" | "autoDetectMobile">> = {
  "300mb_saver": {
    maxBitrateKbps: 667, // 300 MB / hour max ceiling
    maxResolutionHeight: 360,
    maxBufferLengthSeconds: 8,
    maxBufferSizeMb: 6,
    enableImageCompression: true,
  },
  "150mb_ultra": {
    maxBitrateKbps: 333, // 150 MB / hour extreme saver
    maxResolutionHeight: 240,
    maxBufferLengthSeconds: 5,
    maxBufferSizeMb: 3,
    enableImageCompression: true,
  },
  auto: {
    maxBitrateKbps: 667, // Defaults to 300MB/hr on mobile / cellular
    maxResolutionHeight: 360,
    maxBufferLengthSeconds: 8,
    maxBufferSizeMb: 6,
    enableImageCompression: true,
  },
  off: {
    maxBitrateKbps: 4500, // Unrestricted 1080p/4K
    maxResolutionHeight: 1080,
    maxBufferLengthSeconds: 30,
    maxBufferSizeMb: 30,
    enableImageCompression: false,
  },
};

// Global session data usage state
let sessionBytes = 0;
let sessionPlaybackDuration = 0;
let lastBitrate = 550; // kbps
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

/**
 * Check if the user is currently on a mobile device or cellular connection.
 */
export function isMobileOrCellular(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  // 1. Check Network Information API
  const conn = (
    navigator as unknown as {
      connection?: {
        type?: string;
        effectiveType?: string;
        saveData?: boolean;
      };
    }
  ).connection;

  if (conn) {
    if (conn.saveData) return true;
    if (
      conn.type === "cellular" ||
      conn.effectiveType === "2g" ||
      conn.effectiveType === "3g" ||
      conn.effectiveType === "4g"
    ) {
      return true;
    }
  }

  // 2. Check user-agent / screen width
  const isSmallScreen = window.innerWidth <= 768;
  const isMobileUA = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(
    navigator.userAgent,
  );
  return isSmallScreen || isMobileUA;
}

/**
 * Gets the current active data saver mode from localStorage or defaults to 300mb_saver.
 */
export function getDataSaverMode(): DataSaverMode {
  if (typeof window === "undefined") return "300mb_saver";
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as DataSaverMode | null;
    if (
      saved &&
      (saved === "300mb_saver" || saved === "150mb_ultra" || saved === "auto" || saved === "off")
    ) {
      return saved;
    }
  } catch {
    // Ignore localStorage errors
  }
  return "300mb_saver"; // Default to 300MB/hr mobile optimization
}

/**
 * Sets and saves the active data saver mode.
 */
export function setDataSaverMode(mode: DataSaverMode): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Ignore
    }
  }
  notify();
}

/**
 * Returns the effective active configuration based on the mode and network condition.
 */
export function getActiveDataSaverConfig(): DataSaverConfig {
  const mode = getDataSaverMode();
  let effectiveMode: DataSaverMode = mode;

  if (mode === "auto") {
    effectiveMode = isMobileOrCellular() ? "300mb_saver" : "off";
  }

  const preset = PRESETS[effectiveMode];
  return {
    mode,
    autoDetectMobile: true,
    ...preset,
  };
}

/**
 * Tracks video playback progress and updates estimated bandwidth consumption.
 */
export function recordPlaybackConsumption(seconds: number, estimatedBitrateKbps?: number): void {
  if (seconds <= 0) return;
  const bitrate = estimatedBitrateKbps || getActiveDataSaverConfig().maxBitrateKbps;
  lastBitrate = bitrate;
  sessionPlaybackDuration += seconds;
  // bytes = (bitrate in kbps * 1000 / 8) * seconds
  const addedBytes = Math.round(((bitrate * 1000) / 8) * seconds);
  sessionBytes += addedBytes;
  notify();
}

/**
 * Returns current data usage statistics for the session.
 */
export function getDataUsageStats(): DataUsageStats {
  const config = getActiveDataSaverConfig();
  const sessionMb = sessionBytes / (1024 * 1024);
  const hoursPlayed = sessionPlaybackDuration / 3600;
  const hourlyRateMb = hoursPlayed > 0 ? sessionMb / hoursPlayed : config.maxBitrateKbps * 0.45; // ~280-300MB/h

  // Savings compared to unoptimized 1080p HD (which averages ~1800 MB/hr)
  const standardRate = 1800;
  const actualRate = Math.min(hourlyRateMb, 300);
  const savingsPercent = Math.max(
    0,
    Math.round(((standardRate - actualRate) / standardRate) * 100),
  );

  return {
    sessionBytesUsed: sessionBytes,
    sessionPlaybackSeconds: sessionPlaybackDuration,
    currentBitrateKbps: lastBitrate,
    hourlyRateMb: Math.round(hourlyRateMb * 10) / 10,
    savingsPercent,
  };
}

/**
 * React hook to observe data saver configuration & live stats.
 */
import { useEffect, useState } from "react";

export function useDataSaver() {
  const [config, setConfig] = useState<DataSaverConfig>(getActiveDataSaverConfig);
  const [stats, setStats] = useState<DataUsageStats>(getDataUsageStats);

  useEffect(() => {
    const update = () => {
      setConfig(getActiveDataSaverConfig());
      setStats(getDataUsageStats());
    };
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  return {
    config,
    stats,
    is300MbCapped: config.maxBitrateKbps <= 667,
    setMode: setDataSaverMode,
  };
}

/**
 * Optimizes an image URL (e.g. Unsplash or Cloudinary) for the 300MB/hr data saver budget.
 */
export function getOptimizedImageUrl(url?: string | null, targetWidth = 400): string | null {
  if (!url) return null;
  const config = getActiveDataSaverConfig();
  if (!config.enableImageCompression) return url;

  // Optimize Unsplash images
  if (url.includes("images.unsplash.com")) {
    const clean = url.replace(/([?&])w=\d+/g, "").replace(/([?&])q=\d+/g, "");
    const separator = clean.includes("?") ? "&" : "?";
    return `${clean}${separator}w=${targetWidth}&q=65&auto=format`;
  }

  // Optimize Cloudinary image URLs
  if (url.includes("res.cloudinary.com") && url.includes("/image/upload/")) {
    const transform = `w_${targetWidth},q_auto:eco,f_auto`;
    if (!url.includes(transform)) {
      return url.replace("/image/upload/", `/image/upload/${transform}/`);
    }
  }

  return url;
}
