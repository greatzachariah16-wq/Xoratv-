import React, { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Pause, Play, RotateCw, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/events";
import { getActiveDataSaverConfig } from "@/lib/data-saver";
import { useAuth } from "@/hooks/useAuth";
import { generateDeviceFingerprint } from "@/lib/fraud/fingerprint";
import { useOrientation } from "@/hooks/useOrientation";
import { triggerAdcashRefresh } from "@/lib/adcash";
import type { FeedType } from "@/integrations/types";

export interface ProviderEmbedPlayerProps {
  embedUrl: string;
  title: string;
  vertical?: boolean;
  autoPlay?: boolean;
  className?: string;
  postId?: string | null;
  authorId?: string | null;
  genre?: string | null;
  feed?: FeedType;
}

export function ProviderEmbedPlayer({
  embedUrl,
  title,
  vertical,
  autoPlay,
  className,
  postId,
  authorId,
  genre,
  feed,
}: ProviderEmbedPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(Boolean(autoPlay));
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isClient, setIsClient] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { user } = useAuth();
  const { isLandscape, lockLandscape, unlockOrientation } = useOrientation();

  // Watch session integrity refs for embed players
  const embedSessionRef = useRef<{ sessionId: string; nonce: string; devId: string } | null>(null);
  const embedActiveSecondsRef = useRef<number>(0);
  const embedLastClaimedSecondsRef = useRef<number>(0);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Listen to fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement === containerRef.current));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Auto-hide controls in fullscreen / landscape
  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (isPlaying) {
        setControlsVisible(false);
      }
    }, 3500);
  }, [isPlaying]);

  // Listen for iframe postMessage playback state changes from YouTube embeds
  useEffect(() => {
    if (!isClient) return;

    const handleEmbedMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data && data.event === "onStateChange") {
          // 1 = playing, 2 = paused, 0 = ended
          if (data.info === 1) {
            setIsPlaying(true);
          } else if (data.info === 2 || data.info === 0) {
            setIsPlaying(false);
            setControlsVisible(true);
          }
        }
      } catch {
        // ignore non-json messages from other extensions or iframes
      }
    };
    window.addEventListener("message", handleEmbedMessage);
    return () => window.removeEventListener("message", handleEmbedMessage);
  }, [isClient]);

  // View start & 3s view analytics
  useEffect(() => {
    if (postId && isClient) {
      trackEvent({
        type: "view_start",
        postId,
        authorId,
        genre,
        feed,
      });
      const timer = setTimeout(() => {
        trackEvent({
          type: "view_3s",
          postId,
          authorId,
          genre,
          feed,
        });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [postId, authorId, genre, feed, isClient]);

  // Active watch time tracking and immediate pause-marking for Provider Embeds
  useEffect(() => {
    if (!isClient || !isPlaying || !user || !postId) {
      return;
    }

    let isCancelled = false;
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let secondsTicker: NodeJS.Timeout | null = null;

    const initEmbedSession = async () => {
      try {
        const fp = await generateDeviceFingerprint();
        const devId = fp.fingerprintId;

        // Initialize active session
        const startRes = await fetch("/api/engagement/start-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            videoId: postId,
            deviceFingerprintId: devId,
          }),
        });

        if (startRes.ok && !isCancelled) {
          const sData = await startRes.json();
          if (sData?.ok && sData?.sessionId) {
            embedSessionRef.current = {
              sessionId: sData.sessionId,
              nonce: sData.nonce,
              devId,
            };
            // Broadcast immediate watch started event so dashboard reflects active streaming
            window.dispatchEvent(new CustomEvent("xora:engagement-updated"));
          }
        }

        // Tick active elapsed playing seconds (prevents fast-forward fraud)
        secondsTicker = setInterval(() => {
          embedActiveSecondsRef.current += 1;
        }, 1000);

        // Periodic heartbeat every 10 seconds of verified active playback
        heartbeatInterval = setInterval(async () => {
          if (!embedSessionRef.current || isCancelled) return;
          const currentPlayed = embedActiveSecondsRef.current;
          const delta = currentPlayed - embedLastClaimedSecondsRef.current;

          if (delta >= 10) {
            const session = embedSessionRef.current;
            try {
              const res = await fetch("/api/engagement/heartbeat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sessionId: session.sessionId,
                  nonce: session.nonce,
                  accountId: user.id,
                  deviceFingerprintId: session.devId,
                  currentPlaybackSeconds: currentPlayed,
                  claimedDeltaSeconds: delta,
                  videoDurationSeconds: 7200,
                }),
              });
              if (res.ok) {
                const json = await res.json();
                if (json?.ok && json?.validationResult?.isValid) {
                  session.nonce = json.validationResult.nextNonce;
                  embedLastClaimedSecondsRef.current = currentPlayed;
                  window.dispatchEvent(new CustomEvent("xora:engagement-updated"));
                }
              }
            } catch {
              // ignore transient network error
            }
          }
        }, 10000);
      } catch (err) {
        console.warn("[EmbedPlayer] Engagement tracking init warning:", err);
      }
    };

    initEmbedSession();

    return () => {
      isCancelled = true;
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (secondsTicker) clearInterval(secondsTicker);

      // Immediately flush and mark watch time when paused or stopped!
      const session = embedSessionRef.current;
      const currentPlayed = embedActiveSecondsRef.current;
      const delta = currentPlayed - embedLastClaimedSecondsRef.current;

      if (session && delta >= 2 && user) {
        fetch("/api/engagement/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            nonce: session.nonce,
            accountId: user.id,
            deviceFingerprintId: session.devId,
            currentPlaybackSeconds: currentPlayed,
            claimedDeltaSeconds: delta,
            videoDurationSeconds: 7200,
            isPause: true,
          }),
        })
          .then((res) => {
            if (res.ok) {
              embedLastClaimedSecondsRef.current = currentPlayed;
              window.dispatchEvent(new CustomEvent("xora:engagement-updated"));
            }
          })
          .catch(() => {});
      }
    };
  }, [isClient, isPlaying, user, postId]);

  // Ensure origin is always accurately set in embed URL and apply 300MB/hr mobile data saver params
  const dataSaver = getActiveDataSaverConfig();
  let embedSrc = embedUrl;
  const currentOrigin =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
  if (!embedSrc.includes("enablejsapi=1") && !embedSrc.includes("/api/stream/embed/")) {
    embedSrc += (embedSrc.includes("?") ? "&" : "?") + "enablejsapi=1";
  }
  if (currentOrigin && !embedSrc.includes("origin=") && !embedSrc.includes("/api/stream/embed/")) {
    embedSrc += `&origin=${encodeURIComponent(currentOrigin)}`;
  }
  // Mobile Data Saver: apply 360p / 300MB/hr bandwidth constraints to embeds
  if (dataSaver.maxBitrateKbps <= 667) {
    if (embedSrc.includes("youtube.com") || embedSrc.includes("youtube-nocookie.com")) {
      if (!embedSrc.includes("vq="))
        embedSrc +=
          (embedSrc.includes("?") ? "&" : "?") + "vq=medium&playsinline=1&modestbranding=1";
    } else if (embedSrc.includes("vimeo.com")) {
      if (!embedSrc.includes("quality="))
        embedSrc += (embedSrc.includes("?") ? "&" : "?") + "quality=360p&dnt=1";
    } else if (embedSrc.includes("dailymotion.com")) {
      if (!embedSrc.includes("quality="))
        embedSrc += (embedSrc.includes("?") ? "&" : "?") + "quality=360";
    }
  }
  if (autoPlay) {
    if (embedSrc.includes("autoplay=0")) {
      embedSrc = embedSrc.replace("autoplay=0", "autoplay=1");
    } else if (!embedSrc.includes("autoplay=1")) {
      embedSrc += (embedSrc.includes("?") ? "&" : "?") + "autoplay=1";
    }
  }

  const togglePlayState = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) return;

      const nextPlaying = !isPlaying;
      setIsPlaying(nextPlaying);
      bumpControls();

      try {
        const targetWindow = iframe.contentWindow;

        // 1. YouTube postMessage standard format
        const ytCommand = nextPlaying ? "playVideo" : "pauseVideo";
        targetWindow.postMessage(
          JSON.stringify({ event: "command", func: ytCommand, args: [] }),
          "*",
        );

        // 2. Custom internal stream-proxy player postMessage protocol
        targetWindow.postMessage(
          JSON.stringify({ type: "xora_player_cmd", action: nextPlaying ? "play" : "pause" }),
          "*",
        );

        // 3. Vimeo postMessage standard format
        const vimeoAction = nextPlaying ? "play" : "pause";
        targetWindow.postMessage(JSON.stringify({ method: vimeoAction }), "*");

        // 4. Dailymotion postMessage format
        targetWindow.postMessage(JSON.stringify({ command: nextPlaying ? "play" : "pause" }), "*");
      } catch (err) {
        console.warn("[EmbedPlayer] PostMessage playback dispatch notice:", err);
      }
    },
    [isPlaying, bumpControls],
  );

  // Fullscreen and Landscape Orientation Handler
  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    } else if (container.requestFullscreen) {
      triggerAdcashRefresh();
      await container.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    }
    bumpControls();
  }, [bumpControls]);

  return (
    <div
      ref={containerRef}
      onMouseMove={bumpControls}
      onTouchStart={bumpControls}
      className={cn(
        "group relative overflow-hidden bg-black flex items-center justify-center select-none transition-all duration-300",
        isFullscreen
          ? "fixed inset-0 z-50 h-screen w-screen rounded-none bg-black"
          : vertical
            ? "aspect-[9/16] max-h-[85vh] mx-auto w-full max-w-sm rounded-2xl"
            : "aspect-video w-full h-full rounded-2xl md:rounded-3xl",
        className,
      )}
    >
      {/* Top Cinema Mask Overlay: covers title, channel avatar, and branding */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between bg-gradient-to-b from-black/95 via-black/60 to-transparent px-4 transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="flex max-w-[70%] items-center gap-2">
          <span className="rounded bg-primary/20 px-2 py-0.5 text-[9px] font-bold tracking-wider text-primary ring-1 ring-primary/40">
            XORA CINEMA
          </span>
          <span className="truncate text-xs font-semibold text-white drop-shadow">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {isLandscape && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/20 px-2 py-0.5 text-[9px] font-semibold text-primary">
              <RotateCw className="size-2.5" /> Landscape Active
            </span>
          )}
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[10px] font-medium text-white/80 backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            4K HD Master
          </div>
        </div>
      </div>

      {isClient ? (
        <iframe
          ref={iframeRef}
          src={embedSrc}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className={cn(
            "h-full w-full border-0 pointer-events-auto",
            isFullscreen ? "rounded-none" : "rounded-2xl",
          )}
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center bg-black/90 text-xs text-white/40">
          Loading Cinema Player...
        </div>
      )}

      {/* Bottom right watermark shield: covers external embed branding */}
      <div className="pointer-events-none absolute bottom-2 right-2.5 z-20 flex select-none items-center gap-1.5 rounded-full border border-white/15 bg-black/90 px-2.5 py-1 text-[10px] font-bold tracking-wider text-white shadow-xl backdrop-blur-md">
        <span className="size-1.5 rounded-full bg-primary" />
        <span>XORA CINEMA</span>
      </div>

      {/* Floating interactive control bar on bottom for Play/Pause, Landscape & Fullscreen */}
      <div
        className={cn(
          "absolute bottom-3 left-3 z-30 flex items-center gap-2 transition-opacity duration-300",
          controlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
      >
        <button
          type="button"
          onClick={togglePlayState}
          aria-label={isPlaying ? "Pause Cinema" : "Play Cinema"}
          className="flex items-center gap-2 rounded-full border border-white/20 bg-black/85 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md transition hover:bg-black hover:border-primary/60 hover:text-primary active:scale-95"
        >
          {isPlaying ? (
            <>
              <Pause className="size-3.5 fill-current" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="size-3.5 fill-current text-primary" />
              <span>Play</span>
            </>
          )}
        </button>

        {/* Fullscreen Button */}
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/85 px-3 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md transition hover:bg-black hover:border-primary/60 hover:text-primary active:scale-95"
        >
          {isFullscreen ? (
            <Minimize2 className="size-3.5 text-primary" />
          ) : (
            <Maximize2 className="size-3.5" />
          )}
          <span className="hidden sm:inline">
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </span>
        </button>
      </div>
    </div>
  );
}
