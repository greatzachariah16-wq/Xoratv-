

export type PlaybackTelemetrySnapshot = {
  sessionStartedAt: number;
  streamUrl: string;
  streamKind: "hls" | "progressive" | "unknown";
  networkType?: string;
  effectiveType?: string;
  saveData?: boolean;
  startupMs?: number;
  bufferingMs: number;
  playbackSeconds: number;
  lastBitrateKbps?: number;
  lastResolution?: string;
  resourceTransferBytes: number;
  resourceCount: number;
};

const telemetry = new Map<string, PlaybackTelemetrySnapshot>();
let resourceObserver: PerformanceObserver | null = null;

function networkSnapshot() {
  if (typeof navigator === "undefined") return {};
  const connection = (navigator as Navigator & { connection?: { type?: string; effectiveType?: string; saveData?: boolean } }).connection;
  return { networkType: connection?.type, effectiveType: connection?.effectiveType, saveData: connection?.saveData };
}

function refreshResourceTotals() {
  if (typeof performance === "undefined") return;
  for (const [key, item] of telemetry) {
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const matches = resources.filter((r) => r.name === item.streamUrl || r.name.startsWith(item.streamUrl));
    item.resourceTransferBytes = matches.reduce((sum, r) => sum + (r.transferSize || 0), 0);
    item.resourceCount = matches.length;
    telemetry.set(key, item);
  }
}

export function startPlaybackTelemetry(id: string, streamUrl: string) {
  const network = networkSnapshot();
  telemetry.set(id, {
    sessionStartedAt: performance.now(),
    streamUrl,
    streamKind: streamUrl.toLowerCase().includes(".m3u8") ? "hls" : (streamUrl.startsWith("http://") || streamUrl.startsWith("https://")) ? "progressive" : "unknown",
    bufferingMs: 0,
    playbackSeconds: 0,
    resourceTransferBytes: 0,
    resourceCount: 0,
    ...network,
  });
  if (typeof PerformanceObserver !== "undefined" && !resourceObserver) {
    try {
      resourceObserver = new PerformanceObserver(() => refreshResourceTotals());
      resourceObserver.observe({ type: "resource", buffered: true });
    } catch {
      resourceObserver = null;
    }
  }
}

export function markPlaybackStartup(id: string) {
  const item = telemetry.get(id);
  if (item && item.startupMs == null) item.startupMs = Math.round(performance.now() - item.sessionStartedAt);
}

export function recordPlaybackTelemetry(id: string, patch: Partial<PlaybackTelemetrySnapshot>) {
  const item = telemetry.get(id);
  if (!item) return;
  Object.assign(item, patch);
  refreshResourceTotals();
}

export function getPlaybackTelemetrySnapshot(id: string) {
  refreshResourceTotals();
  const item = telemetry.get(id);
  return item ? { ...item } : null;
}
