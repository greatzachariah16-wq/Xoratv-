import { useCallback, useEffect, useRef, useState } from "react";
import {
  addNativeVlcListener,
  closeNativeVlc,
  openNativeVlc,
  isNativeVlcPlatform,
} from "@/lib/native-vlc";
import {
  Gauge,
  Play,
  Smartphone,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { resolveMediaUrl, useSignedUrl } from "@/lib/media";
import { getOriginalVideoUrl, get240pDeliveryUrl } from "@/lib/cloudinary";
import { duration as fmtDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { parseEmbedInfo } from "@/integrations/providers/embed";
import { trackEvent } from "@/lib/events";
import type { FeedType } from "@/integrations/firebase/types";
import {
  recordPlaybackConsumption,
  getOptimizedImageUrlWithConfig,
  useDataSaver,
} from "@/lib/data-saver";
import { useAuth } from "@/hooks/useAuth";
import { generateDeviceFingerprint } from "@/lib/fraud/fingerprint";
import { useOrientation } from "@/hooks/useOrientation";
import { ProviderEmbedPlayer } from "./ProviderEmbedPlayer";
import { BufferOverlay, SignalChip } from "./ConnectionQualityUI";
import {
  useConnectionQuality,
  type ConnectionQualityMode,
} from "./use-connection-quality";
import { markPlaybackStartup, recordPlaybackTelemetry, startPlaybackTelemetry } from "@/lib/playback-telemetry";

type Props = {
  mediaPath?: string | null;
  posterPath?: string | null;
  /** Direct https URL for externally hosted (discovered) videos. */
  externalUrl?: string | null;
  /** Direct https thumbnail URL for externally hosted videos. */
  externalPoster?: string | null;
  source?: string | null;
  streamUrl?: string | null;
  /** Android-only proxied URL for LibVLC; web playback keeps using streamUrl. */
  nativeStreamUrl?: string | null;
  vertical?: boolean;
  title?: string;
  autoPlay?: boolean;
  loop?: boolean;
  className?: string;
  postId?: string | null;
  authorId?: string | null;
  genre?: string | null;
  feed?: FeedType;
  /** Use the more forgiving buffering/recovery profile for live TV HLS streams. */
  liveTv?: boolean;
  onClose?: () => void;
};

export function NativeVideoPlayer({
  mediaPath,
  posterPath,
  externalUrl,
  externalPoster,
  streamUrl,
  nativeStreamUrl,
  vertical = false,
  title = "Video",
  autoPlay = false,
  loop = false,
  className,
  postId,
  authorId,
  genre,
  feed,
  liveTv = false,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<import("hls.js").default | null>(null);
  const [hlsRevision, setHlsRevision] = useState(0);
  const dataSaverController = useDataSaver();
  const { config: dataSaver } = dataSaverController;
  const effectiveStream = streamUrl || externalUrl || null;
  const signedSrc = useSignedUrl("videos", effectiveStream ? null : mediaPath);
  const signedPoster = useSignedUrl("posters", externalPoster ? null : posterPath);
  // Shorts use the stored MP4 directly first for compatibility with older
  // Android WebViews. A 240p Cloudinary rendition remains available as fallback.
  const src = effectiveStream || signedSrc;
  // Start Shorts with the stored, original MP4 URL. This avoids relying on a
  // delivery transformation that may not be available for every uploaded
  // asset or older Android WebView. Keep a 240p rendition as the recovery path.
  const originalShortsSrc = feed === "shorts" && src ? getOriginalVideoUrl(src) : null;
  const shortsFallbackSrc = feed === "shorts" && src ? get240pDeliveryUrl(src) : null;
  const activeSrc = feed === "shorts" && src ? (originalShortsSrc || src) : src;
  const nativeVlcOnly = liveTv && isNativeVlcPlatform();
  const rawPoster = externalPoster ?? signedPoster;
  const poster = getOptimizedImageUrlWithConfig(rawPoster, 400, dataSaver);

  const [playing, setPlaying] = useState(false);
  const [playerClosed, setPlayerClosed] = useState(false);
  const [muted, setMuted] = useState(feed === "shorts" ? true : false);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nativeVlcActive, setNativeVlcActive] = useState(false);
  const nativeVlcActiveRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const shortsRetriedOriginal = useRef(false);
  const shortsRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [signalActivityKey, setSignalActivityKey] = useState(0);
  const { isLandscape, lockLandscape, unlockOrientation } = useOrientation();
  const updateDataSaverMode = useCallback((mode: ConnectionQualityMode) => {
    dataSaverController.setMode(
      mode === "high" ? "off" : mode === "data-saver" ? "300mb_saver" : "auto",
    );

    const video = videoRef.current;
    if (!video || hlsRef.current) return;

    const connection = typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
    const useLowSource = mode === "data-saver"
      || (mode === "auto" && Boolean(connection?.effectiveType && ["slow-2g", "2g", "3g"].includes(connection.effectiveType)));
    const lowerSource = shortsFallbackSrc && shortsFallbackSrc !== activeSrc
      ? shortsFallbackSrc
      : activeSrc ? get240pDeliveryUrl(activeSrc) : null;
    const nextSource = useLowSource && lowerSource && lowerSource !== activeSrc
      ? lowerSource
      : activeSrc;

    if (!nextSource) return;
    const resolvedNextSource = typeof window === "undefined"
      ? nextSource
      : new URL(nextSource, window.location.href).href;
    if (video.currentSrc === resolvedNextSource) return;

    const resumeAt = video.currentTime;
    const wasPlaying = !video.paused;
    const restorePosition = () => {
      video.removeEventListener("loadedmetadata", restorePosition);
      if (Number.isFinite(resumeAt) && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(resumeAt, video.duration);
      }
      if (wasPlaying) void video.play().catch(() => {});
    };
    video.addEventListener("loadedmetadata", restorePosition, { once: true });
    video.src = nextSource;
    video.load();
  }, [activeSrc, dataSaverController.setMode, shortsFallbackSrc]);
  const connection = useConnectionQuality(videoRef, hlsRef, {
    sourceKey: activeSrc || "",
    engineRevision: hlsRevision,
    onModeChange: updateDataSaverMode,
  });
  const revealSignalChip = useCallback(() => {
    setSignalActivityKey((currentKey) => currentKey + 1);
  }, []);

  // Tracking refs to ensure events fire at most once per playback session
  const trackedStart = useRef(false);
  const tracked3s = useRef(false);
  const trackedComplete = useRef(false);
  const timer3sRef = useRef<NodeJS.Timeout | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Watch Integrity state and refs
  const { user } = useAuth();
  const sessionRef = useRef<{ sessionId: string; nonce: string } | null>(null);
  const lastHeartbeatTimeRef = useRef<number>(0);
  const devFingerprintIdRef = useRef<string>("");

  // Reset transient state whenever the source video changes.
  useEffect(() => {
    setPlayerClosed(false);
    if (nativeVlcActiveRef.current) {
      nativeVlcActiveRef.current = false;
      setNativeVlcActive(false);
      void closeNativeVlc();
    }
    setPlaying(false);
    setWaiting(false);
    setFailed(false);
    setCurrent(0);
    setTotal(0);
    lastTimeRef.current = 0;
    trackedStart.current = false;
    tracked3s.current = false;
    trackedComplete.current = false;
    shortsRetriedOriginal.current = false;
    if (shortsRecoveryTimerRef.current) {
      clearTimeout(shortsRecoveryTimerRef.current);
      shortsRecoveryTimerRef.current = null;
    }
    sessionRef.current = null;
    lastHeartbeatTimeRef.current = 0;
    if (timer3sRef.current) {
      clearTimeout(timer3sRef.current);
      timer3sRef.current = null;
    }
  }, [mediaPath, externalUrl, streamUrl, nativeStreamUrl, postId]);

  // Reflect native play/pause/failure and close events in the XoraTV player state.
  useEffect(() => {
    if (!nativeVlcOnly) return;

    let disposed = false;
    let listener: { remove(): Promise<void> } | null = null;

    void addNativeVlcListener((state) => {
      if (disposed) return;
      setPlaying(state.playing);
      setWaiting(state.waiting);
      setFailed(state.failed);
      if (state.closed) {
        nativeVlcActiveRef.current = false;
        setNativeVlcActive(false);
        if (state.userClosed) {
          setPlayerClosed(true);
          setPlaying(false);
          setWaiting(false);
          setFailed(false);
          onCloseRef.current?.();
        }
      }
    })
      .then((registered) => {
        if (disposed) {
          void registered.remove();
        } else {
          listener = registered;
        }
      })
      .catch((error) => console.warn("[Xora] Player state listener unavailable:", error));

    return () => {
      disposed = true;
      if (listener) void listener.remove();
      if (nativeVlcActiveRef.current) {
        nativeVlcActiveRef.current = false;
        void closeNativeVlc();
      }
    };
  }, [nativeVlcOnly]);

  // Production-Ready Xora Engagement Handshake & Heartbeat Loop
  useEffect(() => {
    if (!playing || !user || !postId || !videoRef.current) {
      return;
    }

    let intervalId: NodeJS.Timeout | null = null;
    let isRequestActive = false;
    const video = videoRef.current;

    // Guard against fast-forward skips: when seeking happens, reset baseline time so skipped seconds are not counted
    const handleSeeking = () => {
      if (video) {
        lastHeartbeatTimeRef.current = video.currentTime;
      }
    };
    video.addEventListener("seeking", handleSeeking);

    const startSessionAndLoop = async () => {
      try {
        const fingerprintData = await generateDeviceFingerprint();
        const devFingerprintId = fingerprintData.fingerprintId;
        devFingerprintIdRef.current = devFingerprintId;

        // 1. Fire Session Start request
        const startRes = await fetch("/api/engagement/start-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            videoId: postId,
            deviceFingerprintId: devFingerprintId,
          }),
        });

        if (!startRes.ok) {
          console.warn("[Watch Integrity] Failed to initiate secure watch session");
          return;
        }

        const sessionData = await startRes.json();
        if (sessionData?.ok && sessionData?.sessionId) {
          sessionRef.current = {
            sessionId: sessionData.sessionId,
            nonce: sessionData.nonce,
          };
          lastHeartbeatTimeRef.current = videoRef.current ? videoRef.current.currentTime : 0;
          // Notify dashboard immediately that a watch session has commenced
          window.dispatchEvent(new CustomEvent("xora:engagement-updated"));
        }

        // 2. Start periodic verification heartbeat loop (every 10s of active playback)
        intervalId = setInterval(async () => {
          const v = videoRef.current;
          if (!v || v.paused || isRequestActive || !sessionRef.current) {
            return;
          }

          const currTime = v.currentTime;
          const delta = currTime - lastHeartbeatTimeRef.current;

          // Catch fast forwarding / skipping jump: if delta > 25, reset without claiming skipped time
          if (delta > 25) {
            lastHeartbeatTimeRef.current = currTime;
            return;
          }

          // Step forward (minimum 8s for regular intervals)
          if (delta >= 8) {
            isRequestActive = true;
            try {
              const payload = {
                sessionId: sessionRef.current.sessionId,
                nonce: sessionRef.current.nonce,
                accountId: user.id,
                deviceFingerprintId: devFingerprintId,
                currentPlaybackSeconds: Math.round(currTime),
                claimedDeltaSeconds: Math.round(delta),
                videoDurationSeconds: Math.round(v.duration || 0),
              };

              const hbRes = await fetch("/api/engagement/heartbeat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });

              if (hbRes.ok) {
                const hbData = await hbRes.json();
                if (hbData?.ok && hbData?.validationResult?.isValid) {
                  sessionRef.current.nonce = hbData.validationResult.nextNonce;
                  lastHeartbeatTimeRef.current = currTime;
                  window.dispatchEvent(new CustomEvent("xora:engagement-updated"));
                } else {
                  sessionRef.current = null;
                }
              }
            } catch (err) {
              console.error("[Watch Integrity] Heartbeat error:", err);
            } finally {
              isRequestActive = false;
            }
          }
        }, 10000); // 10 seconds
      } catch (err) {
        console.error("[Watch Integrity] Setup failed:", err);
      }
    };

    startSessionAndLoop();

    return () => {
      video.removeEventListener("seeking", handleSeeking);
      if (intervalId) {
        clearInterval(intervalId);
      }

      // When video is paused or stopped: immediately flush and mark active watch time!
      const currentVideo = video;
      if (currentVideo && sessionRef.current && user) {
        const currTime = currentVideo.currentTime;
        const delta = currTime - lastHeartbeatTimeRef.current;

        // Ensure reasonable delta (not a fast-forward jump, and at least 2 genuine seconds)
        if (delta >= 2 && delta <= 30) {
          fetch("/api/engagement/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: sessionRef.current.sessionId,
              nonce: sessionRef.current.nonce,
              accountId: user.id,
              deviceFingerprintId: devFingerprintIdRef.current || "browser-generic",
              currentPlaybackSeconds: Math.round(currTime),
              claimedDeltaSeconds: Math.round(delta),
              videoDurationSeconds: Math.round(currentVideo.duration || 0),
              isPause: true,
            }),
          })
            .then((res) => {
              if (res.ok) {
                window.dispatchEvent(new CustomEvent("xora:engagement-updated"));
              }
            })
            .catch(() => {});
          lastHeartbeatTimeRef.current = currTime;
        }
      }
    };
  }, [playing, user, postId]);

  // Xora Sparkle Hub's Shorts method: assign the resolved playable URL
  // directly to the native video element. No HLS.js, no provider embed, and
  // no Cloudinary URL rewriting for Shorts.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!activeSrc) return;
    // Native Android live TV is rendered only by LibVLC, never the WebView media element.
    if (liveTv && isNativeVlcPlatform()) return;

    const telemetryId = postId || `${title}-${src}`;
    startPlaybackTelemetry(telemetryId, activeSrc);

    // Only Shorts use this direct native path. Homepage keeps the existing
    // provider/HLS handling below.
    if (feed === "shorts") {
      video.src = activeSrc;
      video.load();
    } else if (/\.m3u8(?:[?#]|$)/i.test(src)) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = activeSrc;
      } else {
        let hlsInstance: import("hls.js").default | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let recovered = false;
        let networkRecoveryCount = 0;
        let disposed = false;

        import("hls.js")
          .then(({ default: Hls }) => {
            if (disposed || !videoRef.current) return;
            if (Hls.isSupported()) {
              hlsInstance = new Hls({
                enableWorker: true,
                lowLatencyMode: liveTv ? true : false,
                backBufferLength: liveTv ? 30 : 4,
                maxBitrate: liveTv ? 0 : dataSaver.maxBitrateKbps * 1000,
                maxBufferLength: liveTv ? 30 : Math.max(dataSaver.maxBufferLengthSeconds, 12),
                maxMaxBufferLength: liveTv ? 60 : Math.max(dataSaver.maxBufferLengthSeconds * 2, 24),
                maxBufferSize: liveTv ? 16 * 1024 * 1024 : dataSaver.maxBufferSizeMb * 1024 * 1024,
                liveSyncDurationCount: liveTv ? 4 : undefined,
                liveMaxLatencyDurationCount: liveTv ? 12 : undefined,
                capLevelToPlayerSize: true,
                fragLoadingMaxRetry: 4,
                manifestLoadingMaxRetry: 4,
                levelLoadingMaxRetry: 4,
              });
              hlsRef.current = hlsInstance;
              setHlsRevision((revision) => revision + 1);
              hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
                if (!data.fatal) return;

                if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered && hlsInstance) {
                  recovered = true;
                  setFailed(false);
                  hlsInstance.recoverMediaError();
                  return;
                }

                if (data.type === Hls.ErrorTypes.NETWORK_ERROR && hlsInstance && networkRecoveryCount < 2 && !retryTimer) {
                  networkRecoveryCount += 1;
                  setFailed(false);
                  retryTimer = setTimeout(() => {
                    retryTimer = null;
                    hlsInstance?.startLoad();
                  }, 1200);
                  return;
                }

                setFailed(true);
              });
              hlsInstance.attachMedia(videoRef.current);
              hlsInstance.loadSource(activeSrc);
              return;
            }
            videoRef.current.src = activeSrc;
          })
          .catch(() => {
            if (!disposed && videoRef.current) videoRef.current.src = activeSrc;
          });

        return () => {
          disposed = true;
          if (retryTimer) clearTimeout(retryTimer);
          if (hlsRef.current === hlsInstance) hlsRef.current = null;
          hlsInstance?.destroy();
          if (timer3sRef.current) clearTimeout(timer3sRef.current);
          video.pause();
          video.removeAttribute("src");
          video.load();
        };
      }
    } else {
      video.src = src;
    }

    return () => {
      if (timer3sRef.current) clearTimeout(timer3sRef.current);
      if (shortsRecoveryTimerRef.current) clearTimeout(shortsRecoveryTimerRef.current);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [activeSrc, feed, liveTv, dataSaver.maxBitrateKbps, dataSaver.maxBufferLengthSeconds, dataSaver.maxBufferSizeMb]);

  // Keep the mute button in sync with imperative changes.
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted, src]);

  const handlePlay = () => {
    const telemetryId = postId || `${title}-${src || "unknown"}`;
    markPlaybackStartup(telemetryId);
    recordPlaybackTelemetry(telemetryId, { playbackSeconds: current });
    setPlaying(true);
    revealSignalChip();
    if (!trackedStart.current && postId) {
      trackedStart.current = true;
      trackEvent({
        type: "view_start",
        postId,
        authorId,
        genre,
        feed,
      });
    }
    if (!tracked3s.current && postId) {
      if (timer3sRef.current) clearTimeout(timer3sRef.current);
      timer3sRef.current = setTimeout(() => {
        if (!tracked3s.current) {
          tracked3s.current = true;
          trackEvent({
            type: "view_3s",
            postId,
            authorId,
            genre,
            feed,
          });
        }
      }, 3000);
    }
  };

  const handlePause = () => {
    setPlaying(false);
    if (timer3sRef.current) {
      clearTimeout(timer3sRef.current);
      timer3sRef.current = null;
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const now = video.currentTime;
    const prev = lastTimeRef.current || 0;
    if (now > prev && now - prev < 2) {
      recordPlaybackConsumption(now - prev, dataSaver.maxBitrateKbps);
    }
    lastTimeRef.current = now;
    setCurrent(now);
    const telemetryId = postId || `${title}-${src || "unknown"}`;
    recordPlaybackTelemetry(telemetryId, { playbackSeconds: now });
    if (video.duration && !trackedComplete.current && postId) {
      if (video.currentTime / video.duration >= 0.85) {
        trackedComplete.current = true;
        trackEvent({
          type: "view_complete",
          postId,
          authorId,
          genre,
          feed,
          durationSeconds: Math.round(video.duration),
        });
      }
    }
  };

  const handleEnded = () => {
    setPlaying(false);
    if (!trackedComplete.current && postId) {
      trackedComplete.current = true;
      trackEvent({
        type: "view_complete",
        postId,
        authorId,
        genre,
        feed,
        durationSeconds: Math.round(total || 0),
      });
    }
  };

  const handleBufferRetry = useCallback(() => {
    const video = videoRef.current;
    if (!video || !activeSrc) return;

    const isLive = liveTv || !Number.isFinite(video.duration);
    const resumeAt = video.currentTime;
    const hls = hlsRef.current;

    if (hls) {
      hls.stopLoad();
      hls.loadSource(activeSrc);
      hls.startLoad(isLive ? -1 : resumeAt);
      void video.play().catch(() => {});
      return;
    }

    const restorePlayback = () => {
      video.removeEventListener("loadedmetadata", restorePlayback);
      if (isLive && video.seekable.length > 0) {
        const lastRange = video.seekable.length - 1;
        video.currentTime = Math.max(video.seekable.start(lastRange), video.seekable.end(lastRange) - 0.5);
      } else if (!isLive && Number.isFinite(resumeAt)) {
        video.currentTime = resumeAt;
      }
      void video.play().catch(() => {});
    };

    video.addEventListener("loadedmetadata", restorePlayback, { once: true });
    video.load();
  }, [activeSrc, liveTv]);

  const handleSelectQualityMode = useCallback((mode: ConnectionQualityMode) => {
    connection.setMode(mode);
  }, [connection.setMode]);

  const startNativePlayback = useCallback(async () => {
    if (!nativeVlcOnly || !activeSrc || nativeVlcActiveRef.current) return;
    setWaiting(true);
    setFailed(false);
    try {
      await openNativeVlc({
        url: nativeStreamUrl || activeSrc,
        title,
      });
      nativeVlcActiveRef.current = true;
      setNativeVlcActive(true);
    } catch (error) {
      console.error("[Xora] Native playback failed:", error);
      setWaiting(false);
      setFailed(true);
    }
  }, [activeSrc, nativeStreamUrl, nativeVlcOnly, title]);

  const toggle = useCallback(() => {
    if (liveTv && isNativeVlcPlatform()) {
      void startNativePlayback();
      return;
    }
    const video = videoRef.current;
    if (!video || !activeSrc) return;
    if (video.paused || video.ended) {
      const attempt = video.play();
      if (attempt) {
        attempt.catch(() => {
          // Mobile browsers reject unmuted autoplay-like starts; retry muted once.
          video.muted = true;
          setMuted(true);
          void video.play().catch(() => setFailed(true));
        });
      }
    } else {
      video.pause();
    }
  }, [activeSrc, liveTv, startNativePlayback]);

  // Autoplay-in-view (shorts): starts unmuted when in view, and paused when out of view.
  useEffect(() => {
    if (!autoPlay) return;
    if (liveTv && isNativeVlcPlatform() && activeSrc) {
      void startNativePlayback();
      return;
    }
    const video = videoRef.current;
    if (!video || !src) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          // Start Shorts muted so Android can begin immediately without waiting
          // for an autoplay permission rejection. The viewer can unmute normally.
          video.muted = true;
          setMuted(true);
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [autoPlay, activeSrc, liveTv, startNativePlayback]);

  const aspect = vertical ? "aspect-[9/16]" : "aspect-video";

  if (!mediaPath && !externalUrl && !streamUrl) {
    return (
      <div
        className={cn(
          "grid w-full place-items-center rounded-xl bg-surface-2 text-xs uppercase tracking-widest text-muted-foreground",
          aspect,
          className,
        )}
      >
        No video
      </div>
    );
  }


  const reopenPlayer = () => {
    setPlayerClosed(false);
    if (nativeVlcOnly && nativeStreamUrl) {
      void openNativeVlc({ url: nativeStreamUrl, title })
        .then(() => {
          nativeVlcActiveRef.current = true;
          setNativeVlcActive(true);
        })
        .catch((error) => {
          console.warn("[Xora] Could not reopen native player:", error);
          setFailed(true);
        });
    }
  };

  const debugEnabled = import.meta.env.DEV
    || (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1");

  return (
    <div
      onPointerMove={revealSignalChip}
      onFocusCapture={revealSignalChip}
      className={cn(
        "group relative w-full max-w-full overflow-hidden rounded-xl bg-ink",
        nativeVlcOnly && nativeVlcActive ? "hidden" : aspect,
        className,
      )}
    >
      <div className="pointer-events-none absolute left-3 top-3 z-30 max-w-[calc(100%-4.5rem)]">
        <span className="block max-w-full truncate rounded-full border border-white/25 bg-black/65 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white backdrop-blur-md">
          4K HD
        </span>
      </div>
      {!playerClosed ? (
        <button type="button" onClick={() => {
          videoRef.current?.pause();
          if (nativeVlcActiveRef.current) {
            nativeVlcActiveRef.current = false;
            setNativeVlcActive(false);
            void closeNativeVlc();
          }
          setPlaying(false);
          setWaiting(false);
          setPlayerClosed(true);
          onClose?.();
        }} aria-label="Close player" title="Close player" className="absolute right-3 top-3 z-40 grid size-11 place-items-center rounded-full border border-white/20 bg-black/70 text-white shadow-lg backdrop-blur-md transition hover:bg-black/90">
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
      {playerClosed ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-ink p-4 text-center text-background">
          <div><p className="font-semibold">Player closed</p><button type="button" onClick={reopenPlayer} className="mt-3 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/15">Reopen player</button></div>
        </div>
      ) : null}
      {src && !nativeVlcOnly ? (
        <video
          key={activeSrc}
          ref={videoRef}
          src={/\.m3u8(?:[?#]|$)/i.test(activeSrc || "") ? undefined : activeSrc || undefined}
          poster={poster ?? undefined}
          playsInline
          loop={loop}
          muted={muted}
          // Shorts need the media connection warmed before the in-view autoplay
          // starts; lazy-loading the video element can add an unnecessary stall on mobile.
          preload={autoPlay ? "auto" : "metadata"}
          controlsList="nodownload"
          aria-label={title}
          className="h-full w-full bg-ink object-contain"
          onClick={toggle}
          onPlay={handlePlay}
          onPause={handlePause}
          onLoadStart={() => setWaiting(true)}
          onWaiting={() => {
            setWaiting(true);
            // Some Cloudinary renditions stall without firing a terminal error.
            // After a short wait, switch once to the original MP4 instead of
            // leaving Shorts on an endless spinner.
            if (feed === "shorts" && !shortsRecoveryTimerRef.current) {
              shortsRecoveryTimerRef.current = setTimeout(() => {
                shortsRecoveryTimerRef.current = null;
                const video = videoRef.current;
                if (!video) return;
                if (!shortsRetriedOriginal.current && shortsFallbackSrc && shortsFallbackSrc !== activeSrc) {
                  shortsRetriedOriginal.current = true;
                  setFailed(false);
                  setWaiting(true);
                  video.src = shortsFallbackSrc;
                  video.load();
                  if (autoPlay) void video.play().catch(() => {});
                } else {
                  setWaiting(false);
                  setFailed(true);
                }
              }, shortsRetriedOriginal.current ? 14000 : 7000);
            }
          }}
          onStalled={() => {
            setWaiting(true);
            if (feed === "shorts" && !shortsRecoveryTimerRef.current) {
              shortsRecoveryTimerRef.current = setTimeout(() => {
                shortsRecoveryTimerRef.current = null;
                const video = videoRef.current;
                if (!video) return;
                if (!shortsRetriedOriginal.current && shortsFallbackSrc && shortsFallbackSrc !== activeSrc) {
                  shortsRetriedOriginal.current = true;
                  setFailed(false);
                  video.src = shortsFallbackSrc;
                  video.load();
                  if (autoPlay) void video.play().catch(() => {});
                } else {
                  setWaiting(false);
                  setFailed(true);
                }
              }, 7000);
            }
          }}
          onPlaying={() => {
            if (shortsRecoveryTimerRef.current) clearTimeout(shortsRecoveryTimerRef.current);
            shortsRecoveryTimerRef.current = null;
            setWaiting(false);
            setFailed(false);
          }}
          onCanPlay={() => {
            if (shortsRecoveryTimerRef.current) clearTimeout(shortsRecoveryTimerRef.current);
            shortsRecoveryTimerRef.current = null;
            setWaiting(false);
          }}
          onError={(event) => {
            const mediaError = event.currentTarget.error;
            console.warn("[Xora video] Media playback error", {
              feed,
              code: mediaError?.code ?? null,
              message: mediaError?.message ?? null,
              currentSrc: event.currentTarget.currentSrc,
              networkState: event.currentTarget.networkState,
              readyState: event.currentTarget.readyState,
            });
            if (shortsRecoveryTimerRef.current) clearTimeout(shortsRecoveryTimerRef.current);
            shortsRecoveryTimerRef.current = null;
            const video = videoRef.current;
            // If the original MP4 cannot play, retry the same asset's
            // low-resolution Cloudinary rendition once.
            if (feed === "shorts" && shortsFallbackSrc && !shortsRetriedOriginal.current && shortsFallbackSrc !== activeSrc) {
              shortsRetriedOriginal.current = true;
              setFailed(false);
              setWaiting(true);
              if (video) {
                video.src = shortsFallbackSrc;
                video.load();
                if (autoPlay) void video.play().catch(() => {});
              }
              return;
            }
            setWaiting(false);
            setFailed(true);
          }}
          onDurationChange={(e) => setTotal(e.currentTarget.duration || 0)}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
        />
      ) : null}

      {!nativeVlcOnly && !playerClosed ? (
        <>
          <SignalChip
            quality={connection.status === "hint" || connection.status === "stalled" || connection.status === "longStalled"
              ? "weak"
              : connection.quality}
            expanded={connection.status !== "playing"}
            mode={connection.mode}
            activityKey={signalActivityKey}
            onOpen={revealSignalChip}
            onSelectMode={handleSelectQualityMode}
            hideUntilControls={isLandscape}
          />
          <BufferOverlay
            status={connection.status}
            bufferPercent={connection.bufferPercent}
            toast={connection.toast}
            onRetry={handleBufferRetry}
            onDataSaver={() => handleSelectQualityMode("data-saver")}
          />
          {debugEnabled ? (
            <div className="pointer-events-none absolute right-2 top-2 z-40 rounded-md bg-black/75 px-2 py-1 text-[9px] tabular-nums text-white/80">
              {connection.bufferAheadSeconds === null ? "—" : connection.bufferAheadSeconds.toFixed(1) + "s"}
              {" · level "}
              {connection.currentLevel === null ? "auto" : connection.currentLevel}
            </div>
          ) : null}
        </>
      ) : null}

      {/* Error overlay */}
      {failed ? (
        <div className="absolute inset-0 grid place-items-center bg-black/75 p-4 text-center text-xs text-background">
          <div>
            <p className="font-semibold">Unable to play video</p>
            <p className="mt-1 text-background/70">The media could not be loaded.</p>
          </div>
        </div>
      ) : null}

      {/* Center play icon toggle flash */}
      {!playing && !waiting && !failed ? (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play video"
          className="press absolute inset-0 grid place-items-center bg-black/10"
        >
          <div className="grid size-14 place-items-center rounded-full border border-white/40 bg-[rgba(255,253,250,0.25)] text-white shadow-lg backdrop-blur-[12px]">
            <Play className="ml-1 size-6 fill-current" aria-hidden="true" />
          </div>
        </button>
      ) : null}

      {!nativeVlcOnly ? (
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-8 transition-opacity duration-200",
          playing
            ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            : "opacity-100",
        )}
      >
        {/* Bottom buttons row */}
        <div className="flex items-center gap-2 text-xs font-medium text-background">
          <span className="tabular-nums">
            {fmtDuration(Math.round(current))} / {fmtDuration(Math.round(total))}
          </span>

          <div className="flex-1" />

          {/* Data Saver Mode Pill */}
          <div
            className="hidden sm:flex items-center gap-1 rounded-full border border-xora-mint/30 bg-xora-mint/10 px-2.5 py-1.5 text-[10px] font-medium text-xora-mint-ink backdrop-blur-md"
            title={`Optimized for mobile: Max ${dataSaver.maxBitrateKbps} kbps (≤ 300 MB/hr)`}
          >
            <Gauge className="size-3 text-xora-mint-ink" />
            <span>{dataSaver.maxBitrateKbps <= 667 ? "300MB/h Max" : "HD"}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              const next = !video.muted;
              video.muted = next;
              setMuted(next);
            }}
            aria-label={muted ? "Unmute" : "Mute"}
            className="press grid size-11 shrink-0 place-items-center rounded-full bg-background/20 text-background ring-1 ring-background/25"
          >
            {muted ? (
              <VolumeX className="size-4" aria-hidden="true" />
            ) : (
              <Volume2 className="size-4" aria-hidden="true" />
            )}
          </button>

        </div>
      </div>
      ) : null}
    </div>
  );
}

export function VideoPlayer(props: Props) {
  // Shorts are Xora-native only. Never send Shorts through provider embeds.
  if (props.feed === "shorts") {
    return <NativeVideoPlayer {...props} autoPlay={props.autoPlay} />;
  }

  const embedInfo = parseEmbedInfo(
    props.streamUrl || props.externalUrl || props.mediaPath,
    props.source,
  );

  return embedInfo ? (
    <ProviderEmbedPlayer
      embedUrl={embedInfo.embedUrl}
      title={props.title || "Video"}
      vertical={props.vertical}
      autoPlay={props.autoPlay}
      className={props.className}
      postId={props.postId}
      authorId={props.authorId}
      genre={props.genre}
      feed={props.feed}
      onClose={props.onClose}
    />
  ) : (
    <NativeVideoPlayer {...props} />
  );
}
