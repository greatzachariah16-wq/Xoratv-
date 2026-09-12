import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useSignedUrl } from "@/lib/media";
import { duration as fmtDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  mediaPath?: string | null;
  posterPath?: string | null;
  /** Direct https URL for externally hosted (discovered) videos. */
  externalUrl?: string | null;
  /** Direct https thumbnail URL for externally hosted videos. */
  externalPoster?: string | null;
  vertical?: boolean;
  title?: string;
  autoPlay?: boolean;
  loop?: boolean;
  className?: string;
};

export function VideoPlayer({
  mediaPath,
  posterPath,
  externalUrl,
  externalPoster,
  vertical = false,
  title = "Video",
  autoPlay = false,
  loop = false,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const signedSrc = useSignedUrl("videos", externalUrl ? null : mediaPath);
  const signedPoster = useSignedUrl("posters", externalUrl ? null : posterPath);
  const src = externalUrl ?? signedSrc;
  const poster = externalPoster ?? signedPoster;

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(autoPlay);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Reset transient state whenever the source video changes.
  useEffect(() => {
    setPlaying(false);
    setWaiting(false);
    setFailed(false);
    setCurrent(0);
    setTotal(0);
    setScrubbing(false);
  }, [mediaPath, externalUrl]);

  // Pause and release the element on unmount / source swap so audio never
  // keeps playing after navigating away.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (!video) return;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);

  // Keep the mute button in sync with imperative changes.
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted, src]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video || !src) return;
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
  }, [src]);

  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.min(Math.max(seconds, 0), video.duration);
    setCurrent(video.currentTime);
  }, []);

  // Autoplay-in-view (shorts): always muted, and paused when out of view.
  useEffect(() => {
    if (!autoPlay) return;
    const video = videoRef.current;
    if (!video || !src) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          video.muted = true;
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [autoPlay, src]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    if (container?.requestFullscreen) {
      void container.requestFullscreen().catch(() => {});
      return;
    }
    // iOS Safari only exposes native fullscreen on the video element.
    const legacy = video as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    legacy?.webkitEnterFullscreen?.();
  }, []);

  const aspect = vertical ? "aspect-[9/16]" : "aspect-video";

  if (!mediaPath && !externalUrl) {
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

  const progress = total > 0 ? (current / total) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative w-full max-w-full overflow-hidden rounded-xl bg-ink",
        isFullscreen ? "h-full rounded-none" : aspect,
        className,
      )}
    >
      {src ? (
        <video
          key={src}
          ref={videoRef}
          src={src}
          poster={poster ?? undefined}
          playsInline
          loop={loop}
          muted={muted}
          preload="metadata"
          controlsList="nodownload"
          aria-label={title}
          className="h-full w-full bg-ink object-contain"
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => {
            setWaiting(false);
            setFailed(false);
          }}
          onCanPlay={() => setWaiting(false)}
          onError={() => {
            setWaiting(false);
            setFailed(true);
          }}
          onLoadedMetadata={(event) => {
            const el = event.currentTarget;
            setTotal(Number.isFinite(el.duration) ? el.duration : 0);
          }}
          onDurationChange={(event) => {
            const el = event.currentTarget;
            setTotal(Number.isFinite(el.duration) ? el.duration : 0);
          }}
          onTimeUpdate={(event) => {
            if (scrubbing) return;
            setCurrent(event.currentTarget.currentTime);
          }}
          onEnded={() => setPlaying(false)}
        />
      ) : (
        <div className="shimmer h-full w-full" aria-hidden="true" />
      )}

      {failed ? (
        <div className="absolute inset-0 grid place-items-center bg-ink/85 px-6 text-center">
          <div>
            <p className="font-display text-sm font-semibold text-background">
              This video can&apos;t be played
            </p>
            <p className="mt-1 text-xs text-background/70">
              It may still be processing. Try again in a moment.
            </p>
          </div>
        </div>
      ) : null}

      {waiting && !failed ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader2 className="size-7 animate-spin text-background/90" aria-hidden="true" />
        </span>
      ) : null}

      {!playing && !failed ? (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play video"
          className="press absolute inset-0 grid place-items-center bg-ink/15"
        >
          <span className="grid size-14 place-items-center rounded-full bg-background/85 shadow-lift">
            <Play className="ml-0.5 size-6 fill-foreground text-foreground" aria-hidden="true" />
          </span>
        </button>
      ) : null}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-3 transition-opacity duration-200",
          playing && !scrubbing
            ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            : "opacity-100",
        )}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="press grid size-9 shrink-0 place-items-center rounded-full bg-background/20 text-background ring-1 ring-background/25"
          >
            {playing ? (
              <Pause className="size-4" aria-hidden="true" />
            ) : (
              <Play className="ml-px size-4" aria-hidden="true" />
            )}
          </button>

          <input
            type="range"
            min={0}
            max={total || 0}
            step={0.1}
            value={Math.min(current, total || 0)}
            aria-label="Seek"
            disabled={!total}
            onPointerDown={() => setScrubbing(true)}
            onPointerUp={() => setScrubbing(false)}
            onTouchStart={() => setScrubbing(true)}
            onTouchEnd={() => setScrubbing(false)}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              setCurrent(value);
              seekTo(value);
            }}
            className="h-6 min-w-0 flex-1 cursor-pointer touch-none appearance-none bg-transparent [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
            style={{
              backgroundImage: `linear-gradient(to right, var(--primary) ${progress}%, color-mix(in oklab, var(--background) 25%, transparent) ${progress}%)`,
              backgroundSize: "100% 4px",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              borderRadius: "9999px",
            }}
          />

          <span className="hidden shrink-0 font-mono text-[10px] tabular-nums text-background/85 sm:inline">
            {fmtDuration(current)} / {fmtDuration(total)}
          </span>

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
            className="press grid size-9 shrink-0 place-items-center rounded-full bg-background/20 text-background ring-1 ring-background/25"
          >
            {muted ? (
              <VolumeX className="size-4" aria-hidden="true" />
            ) : (
              <Volume2 className="size-4" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="press grid size-9 shrink-0 place-items-center rounded-full bg-background/20 text-background ring-1 ring-background/25"
          >
            {isFullscreen ? (
              <Minimize2 className="size-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
