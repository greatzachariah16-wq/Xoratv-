import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/events";
import { useDataSaver } from "@/lib/data-saver";
import { useAuth } from "@/hooks/useAuth";
import { generateDeviceFingerprint } from "@/lib/fraud/fingerprint";
import type { FeedType } from "@/integrations/firebase/types";

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
  onClose?: () => void;
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
  onClose,
}: ProviderEmbedPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(Boolean(autoPlay));
  const [hasStarted, setHasStarted] = useState<boolean>(Boolean(autoPlay));
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [isClient, setIsClient] = useState<boolean>(false);
  const [playerClosed, setPlayerClosed] = useState(false);
  const { user } = useAuth();

  const embedSessionRef = useRef<{ sessionId: string; nonce: string; devId: string } | null>(null);
  const embedActiveSecondsRef = useRef<number>(0);
  const embedLastClaimedSecondsRef = useRef<number>(0);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    setPlayerClosed(false);
    setHasStarted(Boolean(autoPlay));
    setIsPlaying(Boolean(autoPlay));
    setThumbnailFailed(false);
  }, [embedUrl, autoPlay]);

  useEffect(() => {
    if (!isClient) return;

    const handleEmbedMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data && data.event === "onStateChange") {
          if (data.info === 1) {
            setIsPlaying(true);
          } else if (data.info === 2 || data.info === 0) {
            setIsPlaying(false);
          }
        }
      } catch {
        // ignore non-json messages from other extensions or iframes
      }
    };
    window.addEventListener("message", handleEmbedMessage);
    return () => window.removeEventListener("message", handleEmbedMessage);
  }, [isClient]);

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
            window.dispatchEvent(new CustomEvent("xora:engagement-updated"));
          }
        }

        secondsTicker = setInterval(() => {
          embedActiveSecondsRef.current += 1;
        }, 1000);

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

  const youtubeVideoId = embedUrl.includes("youtube") ? embedUrl.match(/\/embed\/([\w-]{11})/)?.[1] : null;
  const { config: dataSaver } = useDataSaver();
  let embedSrc = embedUrl;
  const currentOrigin =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
  if (!embedSrc.includes("enablejsapi=1") && !embedSrc.includes("/api/stream/embed/")) {
    embedSrc += (embedSrc.includes("?") ? "&" : "?") + "enablejsapi=1";
  }
  if (currentOrigin && !embedSrc.includes("origin=") && !embedSrc.includes("/api/stream/embed/")) {
    embedSrc += `&origin=${encodeURIComponent(currentOrigin)}`;
  }
  if (dataSaver.maxBitrateKbps <= 667) {
    if (embedSrc.includes("youtube.com") || embedSrc.includes("youtube-nocookie.com")) {
      if (!embedSrc.includes("vq="))
        embedSrc +=
          (embedSrc.includes("?") ? "&" : "?") + "vq=medium&playsinline=1&modestbranding=1";
    } else if (embedSrc.includes("vimeo.com")) {
      if (!embedSrc.includes("quality="))
        embedSrc += (embedSrc.includes("?") ? "&" : "?") + "quality=360p&dnt=1";
    }
  }
  if (hasStarted) {
    if (embedSrc.includes("autoplay=0")) {
      embedSrc = embedSrc.replace("autoplay=0", "autoplay=1");
    } else if (!embedSrc.includes("autoplay=1")) {
      embedSrc += (embedSrc.includes("?") ? "&" : "?") + "autoplay=1";
    }
  } else {
    if (embedSrc.includes("autoplay=1")) {
      embedSrc = embedSrc.replace("autoplay=1", "autoplay=0");
    } else if (!embedSrc.includes("autoplay=0")) {
      embedSrc += (embedSrc.includes("?") ? "&" : "?") + "autoplay=0";
    }
  }

  const togglePlayState = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) return;

      const nextPlaying = !isPlaying;
      setIsPlaying(nextPlaying);

      try {
        const targetWindow = iframe.contentWindow;
        const ytCommand = nextPlaying ? "playVideo" : "pauseVideo";
        targetWindow.postMessage(
          JSON.stringify({ event: "command", func: ytCommand, args: [] }),
          "*",
        );
        targetWindow.postMessage(
          JSON.stringify({ type: "xora_player_cmd", action: nextPlaying ? "play" : "pause" }),
          "*",
        );
        const vimeoAction = nextPlaying ? "play" : "pause";
        targetWindow.postMessage(JSON.stringify({ method: vimeoAction }), "*");
      } catch (err) {
        console.warn("[EmbedPlayer] PostMessage playback dispatch notice:", err);
      }
    },
    [isPlaying],
  );

  return (
    <div
      className={cn(
        "group relative overflow-hidden bg-black flex items-center justify-center select-none transition-all duration-300",
        vertical
          ? "aspect-[9/16] max-h-[85vh] mx-auto w-full max-w-sm rounded-2xl"
          : "aspect-video w-full h-full rounded-2xl md:rounded-3xl",
        className,
      )}
    >
      <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[calc(100%-4.5rem)]">
        <span className="block max-w-full truncate rounded-full border border-white/25 bg-black/65 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white backdrop-blur-md">
          4K HD
        </span>
      </div>

      {!playerClosed ? (
        <button type="button" onClick={() => { setIsPlaying(false); setPlayerClosed(true); onClose?.(); }} aria-label="Close player" title="Close player" className="absolute right-3 top-3 z-40 grid size-11 place-items-center rounded-full border border-white/20 bg-black/80 text-white shadow-lg backdrop-blur-md transition hover:bg-black"><X className="size-4" aria-hidden="true" /></button>
      ) : null}
      {playerClosed ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black p-4 text-center text-white"><div><p className="font-semibold">Player closed</p><button type="button" onClick={() => setPlayerClosed(false)} className="mt-3 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/15">Reopen player</button></div></div>
      ) : !hasStarted ? (
        <div className="absolute inset-0 overflow-hidden bg-[#2A1F1A]">
          {youtubeVideoId && !thumbnailFailed ? (
            <img
              src={`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`}
              alt=""
              width={1280}
              height={720}
              loading="lazy"
              onError={() => setThumbnailFailed(true)}
              className="h-full w-full object-cover"
              style={{ aspectRatio: "16 / 9" }}
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[#5A382B] via-[#2A1F1A] to-[#17120F]" />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent" />
          <button
            type="button"
            onClick={() => { setHasStarted(true); setIsPlaying(true); }}
            aria-label="Play video"
            className="press absolute inset-0 grid place-items-center"
          >
            <span className="grid size-16 place-items-center rounded-full border border-white/45 bg-white/20 text-white shadow-xl backdrop-blur-xl">
              <Play className="ml-1 size-7 fill-current" aria-hidden="true" />
            </span>
          </button>
        </div>
      ) : isClient ? (
        <iframe
          ref={iframeRef}
          src={embedSrc}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className={cn(
            "h-full w-full border-0 pointer-events-auto",
            "rounded-2xl",
          )}
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center bg-black/90 text-xs text-white/40">
          Loading Cinema Player...
        </div>
      )}

      {!playerClosed && hasStarted && !isPlaying ? (
        <button
          type="button"
          onClick={togglePlayState}
          aria-label="Play video"
          className="press absolute inset-0 z-30 grid place-items-center bg-black/10"
        >
          <span className="grid size-14 place-items-center rounded-full border border-white/40 bg-[rgba(255,253,250,0.25)] text-white shadow-lg backdrop-blur-[12px]">
            <Play className="ml-0.5 size-6 fill-current" aria-hidden="true" />
          </span>
        </button>
      ) : null}

    </div>
  );
}
