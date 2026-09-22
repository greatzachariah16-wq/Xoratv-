import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  Film,
  Layers3,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  RotateCw,
  Sparkles,
} from "lucide-react";
import { VideoPlayer } from "@/components/xora/VideoPlayer";
import { LargeBannerPopupAd } from "@/components/ads/LargeBannerPopupAd";
import { AdcashPlacement } from "@/components/xora/AdcashPlacement";
import type { XTvSeriesItem } from "@/integrations/firebase/rtdb";
import { triggerAdcashRefresh } from "@/lib/adcash";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/watch")({
  head: () => ({
    meta: [
      { title: "Watch Full Movie — Xora Cinema" },
      {
        name: "description",
        content: "Watch full sovereign cinema and movies on Xora.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: WatchPage,
});

async function fetchAllMovies(): Promise<XTvSeriesItem[]> {
  try {
    const res = await fetch("/api/xtv-series/items");
    if (!res.ok) return [];
    const json = (await res.json()) as { ok: boolean; items?: XTvSeriesItem[] };
    return Array.isArray(json.items) ? json.items : [];
  } catch {
    return [];
  }
}

async function fetchMovieStream(id: string): Promise<{
  streamUrl: string;
  sourceType: string;
  title: string;
  originalUrl?: string;
}> {
  // 1. Try XTv Series stream resolver
  try {
    const res = await fetch(`/api/xtv-series/stream?id=${encodeURIComponent(id)}`);
    if (res.ok) {
      const data = (await res.json()) as {
        ok: boolean;
        streamUrl?: string;
        provider?: string;
        item?: { title?: string; videoUrl?: string };
      };
      if (data.ok && data.streamUrl) {
        return {
          streamUrl: data.streamUrl,
          sourceType: data.provider || "hls",
          title: data.item?.title || "Cinema Stream",
          originalUrl: data.item?.videoUrl,
        };
      }
    }
  } catch (error) {
    void error;
  }

  // 2. Try catalog playback resolution
  try {
    const res = await fetch(`/api/catalog/${encodeURIComponent(id)}/playback`);
    if (res.ok) {
      const data = (await res.json()) as {
        ok: boolean;
        playback?: { url?: string; provider?: string };
      };
      if (data.ok && data.playback?.url) {
        return {
          streamUrl: data.playback.url,
          sourceType: data.playback.provider || "embed",
          title: "Cinema Stream",
        };
      }
    }
  } catch (error) {
    void error;
  }

  // 3. Fallback to direct proxy embed
  return {
    streamUrl: `/api/stream/embed/${encodeURIComponent(id)}`,
    sourceType: "embed",
    title: "Cinema Stream",
  };
}

function WatchPage() {
  const navigate = useNavigate();
  const { id } = Route.useSearch();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [adTriggerKey, setAdTriggerKey] = useState(0);

  // Load all movies
  const { data: allMovies = [], isLoading: isLoadingMovies } = useQuery({
    queryKey: ["xtv-series-items-all"],
    queryFn: fetchAllMovies,
    staleTime: 5 * 60 * 1000,
  });

  // Target item from catalog if already loaded
  const activeMovie = useMemo(() => {
    if (!id && allMovies.length > 0) return allMovies[0];
    return allMovies.find((m) => m.id === id) || null;
  }, [allMovies, id]);

  const activeId = activeMovie?.id || id || "";

  // Stream Resolution Query
  const {
    data: streamData,
    isLoading: isStreamLoading,
    error: streamError,
    refetch: refetchStream,
  } = useQuery({
    queryKey: ["movie-stream-resolve", activeId],
    queryFn: () => fetchMovieStream(activeId),
    enabled: Boolean(activeId),
    retry: 2,
    staleTime: 10 * 60 * 1000,
  });

  const streamUrl =
    streamData?.streamUrl ||
    activeMovie?.streamUrl ||
    activeMovie?.videoUrl ||
    (activeId ? `/api/stream/embed/${encodeURIComponent(activeId)}` : "");

  // Other movies for "Up Next" shelf
  const upNextMovies = useMemo(() => {
    return allMovies.filter((m) => m.id !== activeId);
  }, [allMovies, activeId]);

  function toggleFullscreen() {
    triggerAdcashRefresh("aclib-slot-cinema-portrait-stage");
    setAdTriggerKey((prev) => prev + 1);

    const el = document.getElementById("cinema-stage-wrapper");
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen?.()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  }

  const title = activeMovie?.title || "Movie Theater";
  const durationMin = activeMovie?.durationSeconds
    ? Math.round(activeMovie.durationSeconds / 60)
    : 90;

  return (
    <div className="min-h-screen bg-[#07090e] text-[#f1f5f9] selection:bg-primary/30">
      {/* Top Cinema Bar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07090e]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              to="/xtv-series"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white/90 shadow-sm transition hover:border-white/30 hover:bg-white/15 hover:text-white"
              title="Return to X Series Collection"
            >
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">Back to X Series</span>
              <span className="sm:hidden">Back</span>
            </Link>

            <div className="h-4 w-px bg-white/15" />

            <div className="flex items-center gap-2 overflow-hidden">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                <Film className="size-3" /> Cinema
              </span>
              <h1 className="truncate text-sm font-semibold text-white sm:text-base">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {streamUrl ? (
              <a
                href={streamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white sm:inline-flex"
                title="Open stream in isolated window"
              >
                <ExternalLink className="size-3" />
                <span>Popout</span>
              </a>
            ) : null}

            <button
              type="button"
              onClick={toggleFullscreen}
              className="grid size-9 place-items-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Cinema Theater Stage - Large YouTube-Grade Viewport */}
      <main className="mx-auto max-w-[1680px] px-2 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8">
        <div
          id="cinema-stage-wrapper"
          className={cn(
            "relative mx-auto w-full overflow-hidden bg-black transition-all duration-300 shadow-2xl",
            isFullscreen
              ? "h-screen w-screen rounded-none border-none"
              : "aspect-video min-h-[380px] sm:min-h-[500px] md:min-h-[640px] lg:min-h-[740px] xl:min-h-[820px] max-h-[90vh] rounded-2xl md:rounded-3xl border border-white/15 ring-1 ring-white/10",
          )}
        >
          {isStreamLoading && !streamUrl ? (
            <div className="grid h-full w-full place-items-center bg-gradient-to-b from-[#0c0e17] to-black">
              <div className="text-center">
                <Loader2 className="mx-auto size-10 animate-spin text-primary" />
                <p className="mt-4 font-display text-base font-semibold tracking-tight text-white">
                  Preparing Full-Page Cinema Playback
                </p>
                <p className="mt-1 text-xs text-white/50">
                  Connecting to high-definition sovereign stream...
                </p>
              </div>
            </div>
          ) : streamError && !streamUrl ? (
            <div className="grid h-full w-full place-items-center bg-gradient-to-b from-[#140c0c] to-black px-6 text-center">
              <div className="max-w-md">
                <Film className="mx-auto size-10 text-primary" />
                <h3 className="mt-3 font-display text-lg font-semibold text-white">
                  Playback stream temporarily unavailable
                </h3>
                <p className="mt-2 text-xs text-white/60">
                  {streamError instanceof Error
                    ? streamError.message
                    : "The video stream could not be loaded."}
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => void refetchStream()}
                    className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                  >
                    Retry Stream
                  </button>
                  <Link
                    to="/xtv-series"
                    className="rounded-full border border-white/20 px-5 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                  >
                    Back to X Series
                  </Link>
                </div>
              </div>
            </div>
          ) : streamUrl ? (
            <VideoPlayer
              streamUrl={streamUrl}
              externalPoster={activeMovie?.thumbnailUrl}
              title={activeMovie?.title || "Cinema"}
              autoPlay
              vertical={false}
              className="h-full w-full"
              postId={activeId || "cinema-stream"}
              authorId={activeMovie?.director || "xora-cinema"}
              genre={activeMovie?.genre}
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-black text-center text-xs text-white/50">
              No stream configured for this title.
            </div>
          )}

          {/* Floating Exit Cinema Mode Pill on Fullscreen */}
          {isFullscreen && (
            <div className="absolute top-4 right-4 z-50">
              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex items-center gap-2 rounded-full border border-white/20 bg-black/80 px-4 py-2 text-xs font-semibold text-white shadow-2xl backdrop-blur-md transition hover:bg-black hover:border-primary/60 hover:text-primary active:scale-95"
              >
                <Minimize2 className="size-4 text-primary" />
                <span>Exit Fullscreen</span>
              </button>
            </div>
          )}
        </div>

        {/* Dedicated Adcash Ads placement container in Full Screen Portrait Theater mode */}
        <div className="mt-4 w-full">
          <AdcashPlacement
            slotId="cinema-portrait-stage"
            className="w-full max-w-4xl mx-auto my-3"
            fallbackPlacement="cinema_popup"
          />
        </div>

        {/* Dynamic Promotional Sponsor Ad Popup triggered on Full Screen Portrait toggle */}
        <LargeBannerPopupAd placement="cinema_popup" triggerKey={adTriggerKey} />

        {/* Movie Information & Details */}
        {activeMovie ? (
          <section className="mt-8 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md sm:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-primary/20 px-3 py-1 font-bold uppercase tracking-wider text-primary ring-1 ring-primary/30">
                    {activeMovie.genre || "Feature"}
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-white/75">
                    {activeMovie.year || "2026"}
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-white/75">
                    {durationMin} min
                  </span>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-medium text-emerald-400">
                    4K Ultra HD
                  </span>
                </div>

                <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
                  {activeMovie.title}
                </h2>

                <p className="mt-4 text-sm leading-7 text-white/70 sm:text-base">
                  {activeMovie.description ||
                    "Full-length cinematic experience streaming in sovereign high-definition master audio and video."}
                </p>

                {activeMovie.categories && activeMovie.categories.length > 0 ? (
                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                      Genres:
                    </span>
                    {activeMovie.categories.map((c) => (
                      <span
                        key={c}
                        className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="shrink-0">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:w-64">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                    Audio & Stream
                  </p>
                  <p className="mt-1 text-xs font-medium text-white/90">
                    Dolby 5.1 / Master Stereo
                  </p>

                  <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-white/50">
                    Sovereign Provider
                  </p>
                  <p className="mt-1 text-xs font-medium text-white/90">
                    {streamData?.sourceType === "youtube"
                      ? "YouTube HD Stream"
                      : streamData?.sourceType === "dailymotion"
                        ? "Dailymotion HD Stream"
                        : streamData?.sourceType === "vimeo"
                          ? "Vimeo Stream"
                          : "Xora Direct Edge CDN"}
                  </p>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* Up Next / Recommended Cinema Shelf */}
        <section className="mt-12">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold text-white sm:text-xl">
                More Feature Films
              </h3>
              <p className="mt-1 text-xs text-white/50">
                Continue watching from the sovereign collection
              </p>
            </div>
            <Link
              to="/xtv-series"
              className="text-xs font-semibold text-primary transition hover:underline"
            >
              View all ({allMovies.length})
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {upNextMovies.slice(0, 10).map((movie) => (
              <button
                key={movie.id}
                type="button"
                onClick={() => {
                  void navigate({ to: "/watch", search: { id: movie.id } });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="group flex flex-col text-left transition focus:outline-none"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg transition duration-300 group-hover:border-primary/50 group-hover:shadow-primary/10">
                  {movie.thumbnailUrl ? (
                    <img
                      src={movie.thumbnailUrl}
                      alt={movie.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-black/40 text-xs text-white/30">
                      <Film className="size-8" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 transition group-hover:opacity-80" />
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <span className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white/90 backdrop-blur-sm">
                      {movie.year || "2026"}
                    </span>
                    <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition group-hover:scale-110 sm:size-10">
                      <Play className="size-3.5 fill-current sm:size-4" />
                    </span>
                  </div>
                </div>
                <h4 className="mt-2.5 truncate font-display text-xs font-bold text-white group-hover:text-primary sm:text-sm">
                  {movie.title}
                </h4>
                <p className="truncate text-[11px] text-white/50">
                  {movie.genre || "Feature Film"}
                </p>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
