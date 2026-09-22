import { useEffect, useRef, useState, useCallback } from "react";
import {
  Volume2,
  VolumeX,
  ExternalLink,
  SkipForward,
  Play,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { trackEvent } from "@/lib/events";
import { cn } from "@/lib/utils";

interface XoraVideoAdPlayerProps {
  adTagUrl: string;
  onAdEnded: () => void;
  onAdStarted?: () => void;
  title?: string;
  postId?: string | null;
  authorId?: string | null;
  genre?: string | null;
  className?: string;
}

declare global {
  interface Window {
    google?: {
      ima?: {
        AdDisplayContainer: new (
          containerElement: HTMLElement,
          videoElement: HTMLVideoElement,
        ) => {
          initialize: () => void;
          destroy: () => void;
        };
        AdsLoader: new (adDisplayContainer: unknown) => {
          addEventListener: (
            event: string,
            callback: (e: unknown) => void,
            capture?: boolean,
          ) => void;
          requestAds: (adsRequest: unknown) => void;
          destroy: () => void;
        };
        AdsRequest: new () => {
          adTagUrl: string;
          linearAdSlotWidth: number;
          linearAdSlotHeight: number;
          nonLinearAdSlotWidth: number;
          nonLinearAdSlotHeight: number;
        };
        AdsManagerLoadedEvent: {
          Type: {
            ADS_MANAGER_LOADED: string;
          };
        };
        AdErrorEvent: {
          Type: {
            AD_ERROR: string;
          };
        };
        AdEvent: {
          Type: {
            CONTENT_PAUSE_REQUESTED: string;
            CONTENT_RESUME_REQUESTED: string;
            STARTED: string;
            COMPLETE: string;
            SKIPPED: string;
            ALL_ADS_COMPLETED: string;
            USER_CLOSE: string;
            CLICK: string;
            FIRST_QUARTILE: string;
            MIDPOINT: string;
            THIRD_QUARTILE: string;
            LOG: string;
          };
        };
        ViewMode: {
          NORMAL: string;
        };
      };
    };
  }
}

/**
 * Loads the Google IMA SDK script dynamically.
 */
function loadImaSdk(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.google?.ima) return resolve(true);

    const existing = document.getElementById("google-ima-sdk");
    if (existing) {
      const checkTimer = setInterval(() => {
        if (window.google?.ima) {
          clearInterval(checkTimer);
          resolve(true);
        }
      }, 100);
      setTimeout(() => {
        clearInterval(checkTimer);
        resolve(Boolean(window.google?.ima));
      }, 5000);
      return;
    }

    const script = document.createElement("script");
    script.id = "google-ima-sdk";
    script.src = "https://imasdk.googleapis.com/js/sdk/3/ima3.js";
    script.async = true;
    script.onload = () => resolve(Boolean(window.google?.ima));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

const FALLBACK_VIDEO_AD_URL = "https://vjs.zencdn.net/v/oceans.mp4";

export function XoraVideoAdPlayer({
  adTagUrl,
  onAdEnded,
  onAdStarted,
  title,
  postId,
  authorId,
  genre,
  className,
}: XoraVideoAdPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const adDisplayContainerRef = useRef<unknown>(null);
  const adsLoaderRef = useRef<unknown>(null);
  const adsManagerRef = useRef<unknown>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number>(15);
  const [canSkip, setCanSkip] = useState(false);
  const [skipTime, setSkipTime] = useState(5);
  const [clickUrl, setClickUrl] = useState<string | null>(null);
  const [hasStartedUserPlayback, setHasStartedUserPlayback] = useState(false);
  const [isFallbackMode, setIsFallbackMode] = useState(false);

  // Safe fallback termination
  const hasFinishedRef = useRef(false);
  const finishAdOnce = useCallback(
    (reason: "completed" | "skipped" | "error" | "no_fill") => {
      if (hasFinishedRef.current) return;
      hasFinishedRef.current = true;

      // Track analytics
      if (reason === "completed") {
        trackEvent({ type: "preroll_completed", postId, authorId, genre, meta: { adTagUrl } });
      } else if (reason === "skipped") {
        trackEvent({ type: "preroll_skipped", postId, authorId, genre, meta: { adTagUrl } });
      } else if (reason === "no_fill") {
        trackEvent({ type: "preroll_no_fill", postId, authorId, genre, meta: { adTagUrl } });
      } else {
        trackEvent({ type: "preroll_error", postId, authorId, genre, meta: { adTagUrl, reason } });
      }

      // Cleanup IMA manager & loader
      try {
        if (
          adsManagerRef.current &&
          typeof (adsManagerRef.current as { destroy: () => void }).destroy === "function"
        ) {
          (adsManagerRef.current as { destroy: () => void }).destroy();
        }
        if (
          adDisplayContainerRef.current &&
          typeof (adDisplayContainerRef.current as { destroy: () => void }).destroy === "function"
        ) {
          (adDisplayContainerRef.current as { destroy: () => void }).destroy();
        }
      } catch {
        // silence cleanup errors
      }

      onAdEnded();
    },
    [adTagUrl, authorId, genre, onAdEnded, postId],
  );

  // Helper to start direct HTML5 MP4 video ad
  const startDirectVideoAd = useCallback(
    (videoSrc: string) => {
      const videoEl = videoRef.current;
      if (!videoEl) {
        finishAdOnce("error");
        return;
      }

      videoEl.src = videoSrc;
      videoEl.load();

      setIsLoading(false);
      setIsPlaying(true);
      if (onAdStarted) onAdStarted();

      videoEl
        .play()
        .then(() => {
          setHasStartedUserPlayback(true);
        })
        .catch((err) => {
          console.warn("[XoraVideoAd] Autoplay prevented, waiting for user play trigger:", err);
        });
    },
    [finishAdOnce, onAdStarted],
  );

  // Helper when VAST returns no fill or error: switch to high quality fallback ad
  const handleNoFillOrErrorFallback = useCallback(
    (reason: "no_fill" | "error") => {
      if (hasFinishedRef.current) return;
      console.warn(`[XoraVideoAd] VAST ${reason}, switching to fallback video ad creative.`);
      trackEvent({ type: `preroll_${reason}`, postId, authorId, genre, meta: { adTagUrl } });
      setIsFallbackMode(true);
      startDirectVideoAd(FALLBACK_VIDEO_AD_URL);
    },
    [adTagUrl, authorId, genre, postId, startDirectVideoAd],
  );

  // Initialize IMA SDK & AdsLoader or Direct Video Mode
  useEffect(() => {
    let isMounted = true;
    let timeoutGuard: NodeJS.Timeout | null = null;

    trackEvent({ type: "preroll_requested", postId, authorId, genre, meta: { adTagUrl } });

    // Check if adTagUrl is a direct MP4/WebM video
    const isDirectVideoUrl =
      adTagUrl.endsWith(".mp4") ||
      adTagUrl.endsWith(".webm") ||
      adTagUrl.endsWith(".m3u8") ||
      adTagUrl.includes(".mp4?") ||
      adTagUrl.includes("oceans.mp4");

    if (isDirectVideoUrl) {
      startDirectVideoAd(adTagUrl);
      return;
    }

    // Safeguard: If VAST ad tag takes > 6 seconds to respond, fallback to direct ad creative
    timeoutGuard = setTimeout(() => {
      if (isMounted && !isPlaying && !hasFinishedRef.current && !isFallbackMode) {
        console.warn("[XoraVideoAd] VAST timeout safeguard reached. Switching to fallback ad.");
        handleNoFillOrErrorFallback("no_fill");
      }
    }, 6000);

    const initIma = async () => {
      const sdkReady = await loadImaSdk();
      if (!isMounted) return;

      if (!sdkReady || !window.google?.ima) {
        console.warn("[XoraVideoAd] Google IMA SDK unavailable, playing fallback video ad.");
        handleNoFillOrErrorFallback("error");
        return;
      }

      const container = containerRef.current;
      const videoEl = videoRef.current;
      if (!container || !videoEl) {
        handleNoFillOrErrorFallback("error");
        return;
      }

      try {
        const ima = window.google.ima;

        // 1. Create AdDisplayContainer
        const adDisplayContainer = new ima.AdDisplayContainer(container, videoEl);
        adDisplayContainerRef.current = adDisplayContainer;

        // 2. Create AdsLoader
        const adsLoader = new ima.AdsLoader(adDisplayContainer);
        adsLoaderRef.current = adsLoader;

        // 3. Listen for AdsManagerLoaded
        adsLoader.addEventListener(
          ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
          (evt: unknown) => {
            if (!isMounted || hasFinishedRef.current) return;
            if (timeoutGuard) clearTimeout(timeoutGuard);

            try {
              const loadedEvt = evt as {
                getAdsManager: (
                  videoElement: HTMLVideoElement,
                  settings?: unknown,
                ) => {
                  addEventListener: (type: string, cb: (e: unknown) => void) => void;
                  init: (width: number, height: number, viewMode: string) => void;
                  start: () => void;
                  getRemainingTime: () => number;
                  destroy: () => void;
                };
              };

              const adsManager = loadedEvt.getAdsManager(videoEl);
              adsManagerRef.current = adsManager;

              // Ad Events
              adsManager.addEventListener(ima.AdEvent.Type.STARTED, () => {
                if (!isMounted) return;
                setIsLoading(false);
                setIsPlaying(true);
                if (onAdStarted) onAdStarted();
                trackEvent({
                  type: "preroll_started",
                  postId,
                  authorId,
                  genre,
                  meta: { adTagUrl },
                });
              });

              adsManager.addEventListener(ima.AdEvent.Type.COMPLETE, () => {
                if (!isMounted) return;
                finishAdOnce("completed");
              });

              adsManager.addEventListener(ima.AdEvent.Type.SKIPPED, () => {
                if (!isMounted) return;
                finishAdOnce("skipped");
              });

              adsManager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => {
                if (!isMounted) return;
                finishAdOnce("completed");
              });

              adsManager.addEventListener(ima.AdEvent.Type.USER_CLOSE, () => {
                if (!isMounted) return;
                finishAdOnce("completed");
              });

              adsManager.addEventListener(ima.AdEvent.Type.LOG, (logEvt: unknown) => {
                const data = logEvt as { getAdData?: () => { clickThroughUrl?: string } };
                const clickThrough = data?.getAdData?.()?.clickThroughUrl;
                if (clickThrough) setClickUrl(clickThrough);
              });

              // Init & Start AdsManager
              const width = container.clientWidth || 640;
              const height = container.clientHeight || 360;
              adsManager.init(width, height, ima.ViewMode.NORMAL);

              // Initialize AdDisplayContainer on user interaction
              adDisplayContainer.initialize();
              adsManager.start();
            } catch (err) {
              console.warn("[XoraVideoAd] AdsManager initialization error:", err);
              handleNoFillOrErrorFallback("error");
            }
          },
        );

        // 4. Listen for AdError
        adsLoader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, (errEvt: unknown) => {
          if (timeoutGuard) clearTimeout(timeoutGuard);
          console.warn("[XoraVideoAd] IMA AdErrorEvent:", errEvt);
          handleNoFillOrErrorFallback("no_fill");
        });

        // 5. Request Ads
        const adsRequest = new ima.AdsRequest();
        adsRequest.adTagUrl = adTagUrl;
        adsRequest.linearAdSlotWidth = container.clientWidth || 640;
        adsRequest.linearAdSlotHeight = container.clientHeight || 360;

        adsLoader.requestAds(adsRequest);
      } catch (err) {
        console.warn("[XoraVideoAd] Failed setting up IMA SDK:", err);
        handleNoFillOrErrorFallback("error");
      }
    };

    void initIma();

    return () => {
      isMounted = false;
      if (timeoutGuard) clearTimeout(timeoutGuard);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    adTagUrl,
    authorId,
    finishAdOnce,
    genre,
    handleNoFillOrErrorFallback,
    onAdStarted,
    postId,
    startDirectVideoAd,
  ]);

  // Countdown timer effect
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });

      setSkipTime((prev) => {
        if (prev <= 1) {
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying]);

  // Manual Play Trigger for Mobile / Autoplay Restricted Browsers
  const handleManualStart = () => {
    setHasStartedUserPlayback(true);
    if (
      adDisplayContainerRef.current &&
      typeof (adDisplayContainerRef.current as { initialize: () => void }).initialize === "function"
    ) {
      try {
        (adDisplayContainerRef.current as { initialize: () => void }).initialize();
      } catch (err) {
        console.warn("[XoraVideoAd] AdDisplayContainer init error:", err);
      }
    }
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSkipClick = () => {
    finishAdOnce("skipped");
  };

  const handleCtaClick = () => {
    if (clickUrl) {
      window.open(clickUrl, "_blank", "noopener,noreferrer");
    } else {
      window.open("https://youradexchange.com", "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative w-full aspect-video overflow-hidden rounded-2xl bg-black shadow-2xl flex items-center justify-center select-none",
        className,
      )}
    >
      {/* HTML5 Video Element for Ad Playback */}
      <video
        ref={videoRef}
        playsInline
        webkit-playsinline="true"
        muted={isMuted}
        onEnded={() => finishAdOnce("completed")}
        onError={() => finishAdOnce("error")}
        onTimeUpdate={() => {
          if (videoRef.current && videoRef.current.duration) {
            const dur = videoRef.current.duration;
            const cur = videoRef.current.currentTime;
            setRemainingTime(Math.max(0, Math.ceil(dur - cur)));
          }
        }}
        className="h-full w-full object-contain pointer-events-auto"
      />

      {/* Top Header Badge */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex h-14 items-center justify-between bg-gradient-to-b from-black/95 via-black/60 to-transparent px-4">
        <div className="flex items-center gap-2">
          <span className="rounded bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 ring-1 ring-amber-500/40 shadow-sm">
            ADVERTISEMENT
          </span>
          <span className="truncate text-xs font-semibold text-white/90 drop-shadow">
            {title ? `Before: ${title}` : "Sponsor Video"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className="pointer-events-auto flex size-8 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-md transition hover:bg-black"
            aria-label={isMuted ? "Unmute advertisement" : "Mute advertisement"}
          >
            {isMuted ? (
              <VolumeX className="size-4 text-rose-400" />
            ) : (
              <Volume2 className="size-4" />
            )}
          </button>
        </div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 p-4 text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <span className="mt-3 text-xs font-semibold text-white/80">Loading advertisement...</span>
          <button
            type="button"
            onClick={() => finishAdOnce("no_fill")}
            className="mt-4 text-[11px] font-medium text-muted-foreground underline hover:text-white"
          >
            Skip ad and watch video
          </button>
        </div>
      )}

      {/* Mobile Autoplay Interaction Unlocker */}
      {!hasStartedUserPlayback && !isLoading && !isPlaying && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-center">
          <button
            type="button"
            onClick={handleManualStart}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-2xl transition transform active:scale-95 hover:bg-primary/90"
          >
            <Play className="size-4 fill-current" />
            <span>Play Ad to Continue</span>
          </button>
        </div>
      )}

      {/* Bottom Ad Controls Bar */}
      {isPlaying && (
        <div className="absolute bottom-3 inset-x-3 z-40 flex items-center justify-between">
          {/* Clickthrough Sponsor Link */}
          <button
            type="button"
            onClick={handleCtaClick}
            className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/80 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md transition hover:bg-black hover:border-primary/60 hover:text-primary active:scale-95"
          >
            <span>Visit Sponsor</span>
            <ExternalLink className="size-3" />
          </button>

          {/* Countdown & Skip Control */}
          <div className="flex items-center gap-2">
            {!canSkip ? (
              <span className="rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md">
                Skip in {skipTime}s
              </span>
            ) : (
              <button
                type="button"
                onClick={handleSkipClick}
                className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-xl transition transform active:scale-95 hover:bg-primary/90"
              >
                <span>Skip Ad</span>
                <SkipForward className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
