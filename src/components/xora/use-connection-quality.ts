import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type Hls from "hls.js";

export type ConnectionQuality = "good" | "fair" | "weak";
export type PlaybackStatus = "playing" | "hint" | "stalled" | "longStalled" | "recovering";
export type ConnectionQualityMode = "auto" | "data-saver" | "high";

type VideoRef = RefObject<HTMLVideoElement | null>;
type HlsRef = RefObject<Hls | null>;
type NetworkInformation = { effectiveType?: string };
type NavigatorWithConnection = Navigator & { connection?: NetworkInformation };
type HlsErrorPayload = { details?: string; type?: string };
type HlsEventApi = {
  on: (event: string, listener: (event: string, data?: HlsErrorPayload) => void) => void;
  off: (event: string, listener: (event: string, data?: HlsErrorPayload) => void) => void;
};

type QualityLevel = { bitrate: number; height?: number; width?: number };

export type ConnectionQualityOptions = {
  sourceKey?: string;
  engineRevision?: number;
  onModeChange?: (mode: ConnectionQualityMode) => void;
};

const STORAGE_KEY = "xoratv:player-quality:v1";
const WEAK_NETWORKS = new Set(["slow-2g", "2g", "3g"]);

function readSavedMode(): ConnectionQualityMode | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "auto" || value === "data-saver" || value === "high" ? value : null;
  } catch {
    return null;
  }
}

function readAdaptiveStart(): ConnectionQualityMode {
  if (typeof navigator === "undefined") return "auto";
  const connection = (navigator as NavigatorWithConnection).connection;
  return connection?.effectiveType && WEAK_NETWORKS.has(connection.effectiveType)
    ? "data-saver"
    : "auto";
}

export function useAdaptiveStart() {
  const [mode, setModeState] = useState<ConnectionQualityMode>("auto");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setModeState(readSavedMode() ?? readAdaptiveStart());
    setReady(true);
  }, []);

  const setMode = useCallback((nextMode: ConnectionQualityMode) => {
    setModeState(nextMode);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, nextMode);
      } catch {
        // Private browsing or storage restrictions must not interrupt playback.
      }
    }
  }, []);

  return { mode, ready, setMode };
}

function getBufferAhead(video: HTMLVideoElement): number | null {
  const currentTime = video.currentTime;
  const ranges = video.buffered;

  for (let index = 0; index < ranges.length; index += 1) {
    const start = ranges.start(index);
    const end = ranges.end(index);
    if (currentTime >= start - 0.15 && currentTime <= end + 0.15) {
      return Math.max(0, end - currentTime);
    }
  }

  return ranges.length > 0 ? Math.max(0, ranges.end(ranges.length - 1) - currentTime) : null;
}

function getBufferPercent(video: HTMLVideoElement): number | null {
  if (!Number.isFinite(video.duration) || video.duration <= 0 || video.buffered.length === 0) {
    return null;
  }

  let bufferedSeconds = 0;
  for (let index = 0; index < video.buffered.length; index += 1) {
    bufferedSeconds += video.buffered.end(index) - video.buffered.start(index);
  }

  return Math.max(0, Math.min(100, Math.round((bufferedSeconds / video.duration) * 100)));
}

function getLowestLevelIndex(levels: readonly QualityLevel[]): number {
  const sensible = levels
    .map((level, index) => ({ level, index }))
    .filter(({ level }) => (level.height ?? 0) >= 240 || (level.width ?? 0) >= 426);
  const pool = sensible.length > 0 ? sensible : levels.map((level, index) => ({ level, index }));

  return pool.reduce(
    (lowest, current) => current.level.bitrate < lowest.level.bitrate ? current : lowest,
    pool[0] ?? { level: { bitrate: 0 }, index: 0 },
  ).index;
}

function applyModeToHls(hls: Hls | null | undefined, mode: ConnectionQualityMode): void {
  if (!hls || hls.levels.length === 0) return;

  if (mode === "auto") {
    hls.currentLevel = -1;
    return;
  }

  const levels = hls.levels as readonly QualityLevel[];
  if (mode === "data-saver") {
    hls.currentLevel = getLowestLevelIndex(levels);
    return;
  }

  hls.currentLevel = levels.reduce(
    (highest, level, index) => level.bitrate > levels[highest].bitrate ? index : highest,
    0,
  );
}

function degradeQuality(quality: ConnectionQuality): ConnectionQuality {
  if (quality === "good") return "fair";
  return "weak";
}

export function useConnectionQuality(
  videoRef: VideoRef,
  hlsRef?: HlsRef,
  options: ConnectionQualityOptions = {},
) {
  const { mode, ready: modeReady, setMode } = useAdaptiveStart();
  const [quality, setQuality] = useState<ConnectionQuality>("good");
  const [status, setStatus] = useState<PlaybackStatus>("playing");
  const [bufferAheadSeconds, setBufferAheadSeconds] = useState<number | null>(null);
  const [bufferPercent, setBufferPercent] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const statusRef = useRef<PlaybackStatus>("playing");
  const qualityRef = useRef<ConnectionQuality>("good");
  const modeRef = useRef<ConnectionQualityMode>(mode);
  const onModeChangeRef = useRef(options.onModeChange);
  const waitingStartedAtRef = useRef<number | null>(null);
  const visibleSinceRef = useRef(0);
  const stallsRef = useRef<number[]>([]);
  const candidateQualityRef = useRef<ConnectionQuality>("good");
  const candidateSinceRef = useRef(0);
  const autoSwitchedThisStallRef = useRef(false);
  const waitingTimerRef = useRef<number | null>(null);
  const longStallTimerRef = useRef<number | null>(null);
  const recoverTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onModeChangeRef.current = options.onModeChange;
  }, [options.onModeChange]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const setPlaybackStatus = useCallback((next: PlaybackStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const applyQualityMode = useCallback((nextMode: ConnectionQualityMode) => {
    applyModeToHls(hlsRef?.current, nextMode);
    onModeChangeRef.current?.(nextMode);
  }, [hlsRef]);

  const chooseQualityMode = useCallback((nextMode: ConnectionQualityMode) => {
    setMode(nextMode);
    modeRef.current = nextMode;
    applyQualityMode(nextMode);
  }, [applyQualityMode, setMode]);

  useEffect(() => {
    if (!modeReady) return;
    applyQualityMode(mode);
  }, [applyQualityMode, mode, modeReady, options.engineRevision]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let disposed = false;
    const clearTimer = (timer: number | null) => {
      if (timer !== null) window.clearTimeout(timer);
    };
    const resetWaitingTimers = () => {
      clearTimer(waitingTimerRef.current);
      clearTimer(longStallTimerRef.current);
      waitingTimerRef.current = null;
      longStallTimerRef.current = null;
    };

    resetWaitingTimers();
    clearTimer(recoverTimerRef.current);
    clearTimer(toastTimerRef.current);
    waitingStartedAtRef.current = null;
    visibleSinceRef.current = 0;
    stallsRef.current = [];
    candidateSinceRef.current = 0;
    candidateQualityRef.current = "good";
    autoSwitchedThisStallRef.current = false;
    qualityRef.current = "good";
    setQuality("good");
    setBufferAheadSeconds(null);
    setBufferPercent(null);
    setToast("");
    setPlaybackStatus("playing");

    const sampleQuality = () => {
      if (disposed) return;
      const ahead = getBufferAhead(video);
      const percent = getBufferPercent(video);
      setBufferAheadSeconds((current) => {
        const next = ahead === null ? null : Math.round(ahead * 10) / 10;
        return current === next ? current : next;
      });
      setBufferPercent((current) => current === percent ? current : percent);

      const now = Date.now();
      stallsRef.current = stallsRef.current.filter((timestamp) => now - timestamp < 60_000);
      if (video.paused || video.ended) return;

      let nextQuality: ConnectionQuality = ahead === null
        ? (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA ? "fair" : "weak")
        : ahead > 10 ? "good" : ahead >= 3 ? "fair" : "weak";

      if (stallsRef.current.length >= 5) nextQuality = "weak";
      else if (stallsRef.current.length >= 3) nextQuality = degradeQuality(nextQuality);

      if (statusRef.current === "stalled" || statusRef.current === "longStalled") {
        nextQuality = "weak";
      }

      if (nextQuality === qualityRef.current) {
        candidateQualityRef.current = nextQuality;
        candidateSinceRef.current = 0;
      } else if (candidateQualityRef.current !== nextQuality) {
        candidateQualityRef.current = nextQuality;
        candidateSinceRef.current = now;
      } else if (candidateSinceRef.current > 0 && now - candidateSinceRef.current >= 2_000) {
        qualityRef.current = nextQuality;
        setQuality(nextQuality);
        candidateSinceRef.current = 0;
      }

      if (waitingStartedAtRef.current === null && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        setPlaybackStatus(ahead !== null && ahead < 3 ? "hint" : "playing");
      }
    };

    const beginWaiting = () => {
      if (disposed || video.paused || video.ended || waitingStartedAtRef.current !== null) return;

      const now = Date.now();
      waitingStartedAtRef.current = now;
      visibleSinceRef.current = 0;
      stallsRef.current.push(now);
      resetWaitingTimers();
      waitingTimerRef.current = window.setTimeout(() => {
        if (disposed || waitingStartedAtRef.current === null) return;
        visibleSinceRef.current = Date.now();
        qualityRef.current = "weak";
        setQuality("weak");
        setPlaybackStatus("stalled");
      }, 1_000);
      longStallTimerRef.current = window.setTimeout(() => {
        if (disposed || waitingStartedAtRef.current === null) return;
        setPlaybackStatus("longStalled");
        if (!autoSwitchedThisStallRef.current) {
          autoSwitchedThisStallRef.current = true;
          if (modeRef.current !== "data-saver") {
            chooseQualityMode("data-saver");
            setToast("Switched to Data saver");
            clearTimer(toastTimerRef.current);
            toastTimerRef.current = window.setTimeout(() => setToast(""), 2_400);
          }
        }
      }, 6_000);
    };

    const recoverPlayback = () => {
      if (disposed || video.paused) return;
      const wasWaiting = waitingStartedAtRef.current !== null;
      const wasVisible = statusRef.current === "stalled" || statusRef.current === "longStalled";
      waitingStartedAtRef.current = null;
      resetWaitingTimers();

      if (wasWaiting && wasVisible) {
        setPlaybackStatus("recovering");
        clearTimer(recoverTimerRef.current);
        recoverTimerRef.current = window.setTimeout(() => {
          if (!disposed) setPlaybackStatus("playing");
        }, 200);
      } else {
        setPlaybackStatus("playing");
      }
      autoSwitchedThisStallRef.current = false;
      sampleQuality();
    };

    const onWaiting = () => beginWaiting();
    const onStalled = () => beginWaiting();
    const onPlaying = () => recoverPlayback();
    const onCanPlay = () => recoverPlayback();
    const onProgress = () => sampleQuality();
    const onTimeUpdate = () => sampleQuality();
    const onPause = () => {
      waitingStartedAtRef.current = null;
      resetWaitingTimers();
      clearTimer(recoverTimerRef.current);
      setPlaybackStatus("playing");
      autoSwitchedThisStallRef.current = false;
    };

    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("progress", onProgress);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("pause", onPause);

    const hls = hlsRef?.current ?? null;
    let hlsApi: HlsEventApi | null = null;
    if (hls) {
      hlsApi = hls as unknown as HlsEventApi;
      const onHlsError = (_event: string, data?: HlsErrorPayload) => {
        if (data?.details === "bufferStalledError" || data?.details === "bufferNudgeOnStall") {
          beginWaiting();
        }
      };
      const onHlsProgress = () => sampleQuality();
      const onManifestParsed = () => applyModeToHls(hls, modeRef.current);
      hlsApi.on("hlsError", onHlsError);
      hlsApi.on("hlsFragBuffered", onHlsProgress);
      hlsApi.on("hlsBufferAppended", onHlsProgress);
      hlsApi.on("hlsManifestParsed", onManifestParsed);
      const removeHlsListeners = () => {
        hlsApi?.off("hlsError", onHlsError);
        hlsApi?.off("hlsFragBuffered", onHlsProgress);
        hlsApi?.off("hlsBufferAppended", onHlsProgress);
        hlsApi?.off("hlsManifestParsed", onManifestParsed);
      };
      const interval = window.setInterval(sampleQuality, 750);

      return () => {
        disposed = true;
        video.removeEventListener("waiting", onWaiting);
        video.removeEventListener("stalled", onStalled);
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("canplay", onCanPlay);
        video.removeEventListener("progress", onProgress);
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("pause", onPause);
        removeHlsListeners();
        window.clearInterval(interval);
        resetWaitingTimers();
        clearTimer(recoverTimerRef.current);
        clearTimer(toastTimerRef.current);
      };
    }

    const interval = window.setInterval(sampleQuality, 750);
    return () => {
      disposed = true;
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onStalled);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("pause", onPause);
      window.clearInterval(interval);
      resetWaitingTimers();
      clearTimer(recoverTimerRef.current);
      clearTimer(toastTimerRef.current);
    };
  }, [applyQualityMode, chooseQualityMode, hlsRef, options.engineRevision, options.sourceKey, setPlaybackStatus, videoRef]);

  return {
    quality,
    status,
    bufferAheadSeconds,
    bufferPercent,
    mode,
    setMode: chooseQualityMode,
    toast,
    currentLevel: hlsRef?.current?.currentLevel ?? null,
  };
}
