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
  Sparkles,
} from "lucide-react";
import { VideoPlayer } from "@/components/xora/VideoPlayer";
import { AdcashPlacement } from "@/components/xora/AdcashPlacement";
import { LargeBannerPopupAd } from "@/components/ads/LargeBannerPopupAd";
import type { XTvSeriesItem } from "@/integrations/firebase/rtdb";
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

async function fetchStream(id: string): Promise<{
  streamUrl: string;
  item?: XTvSeriesItem;
}> {
  const res = await fetch(`/api/xtv-series/stream?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Failed to load movie stream");
  const json = (await res.json()) as {
    ok: boolean;
    streamUrl?: string;
    item?: XTvSeriesItem;
    error?: string;
  };
  if (!json.ok || !json.streamUrl) {
    throw new Error(json.error || "The stream could not be resolved.");
  }
  return { streamUrl: json.streamUrl, item: json.item };
}

function WatchPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const movieId = search.id;

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fetch all published movies for the catalog and recommendation shelf
  const { data: allMovies = [], isLoading: isLoadingMovies } = useQuery({
    queryKey: ["xtv-series-all"],
    queryFn: fetchAllMovies,
    staleTime: 30_000,
  });

  // Target item from catalog if already loaded
  const matchedItem = useMemo(() => {
    if (!movieId) return allMovies[0] || null;
    return allMovies.find((m) => m.id === movieId) || null;
  }, [allMovies, movieId]);

  // Active movie ID (fallback to first movie if none provided)
  const activeId = movieId || matchedItem?.id || (allMovies[0]?.id ?? "");

  // Fetch direct playback stream for active movie
  const {
    data: streamData,
    isLoading: isStreamLoading,
    error: streamError,
    refetch: refetchStream,
  } = useQuery({
    queryKey: ["watch-stream", activeId],
    queryFn: () => fetchStream(activeId),
    enabled: Boolean(activeId),
    retry: 1,
  });

  const activeMovie: XTvSeriesItem | null =
    matchedItem || streamData?.item || allMovies.find((m) => m.id === activeId) || null;
  const streamUrl = streamData?.streamUrl || activeMovie?.videoUrl || null;

  // Other movies for "Up Next" shelf
  const upNextMovies = useMemo(() => {
    return allMovies.filter((m) => m.id !== activeId);
  }, [allMovies, activeId]);

  function toggleFullscreen() {
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

      {/* Main Cinema Theater Stage */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-8">
        <div
          id="cinema-stage-wrapper"
          className={cn(
            "relative mx-auto w-full overflow-hidden rounded-[1.5rem] border border-white/15 bg-black shadow-2xl transition duration-300",
            isFullscreen
              ? "h-screen w-screen rounded-none border-none"
              : "aspect-video max-h-[80vh]",
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
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-black text-center text-xs text-white/50">
              No stream configured for this title.
            </div>
          )}
        </div>

        {/* Adcash placement beneath video player */}
        <AdcashPlacement slotId={`cinema-${activeId}`} className="my-6" />

        {/* High-priority Large Banner Pop-Up for Cinema */}
        <LargeBannerPopupAd placement="cinema_popup" />

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
                  <p className="mt-1 text-xs font-semibold text-white">Stereo / Dolby Master</p>
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                      Platform
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      <Sparkles className="size-3" /> Xora Sovereign Player
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* Up Next Shelf */}
        {upNextMovies.length > 0 ? (
          <section className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                  Continue Watching
                </p>
                <h3 className="font-display text-xl font-bold tracking-tight text-white">
                  More on X Series
                </h3>
              </div>
              <Link
                to="/xtv-series"
                className="text-xs font-semibold text-white/60 hover:text-primary transition"
              >
                View all ({allMovies.length})
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 sm:gap-4">
              {upNextMovies.map((movie) => (
                <button
                  key={movie.id}
                  id={`btn-watch-next-${movie.id}`}
                  type="button"
                  onClick={() => {
                    navigate({ to: "/watch", search: { id: movie.id } });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-left transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white/[0.06] sm:rounded-2xl"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-black/60">
                    {movie.thumbnailUrl ? (
                      <img
                        src={movie.thumbnailUrl}
                        alt={movie.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : null}
                    <div className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition duration-200 group-hover:opacity-100">
                      <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition group-hover:scale-110 sm:size-10">
                        <Play className="ml-0.5 size-3.5 fill-current sm:size-4" />
                      </span>
                    </div>
                  </div>
                  <div className="p-2 sm:p-3">
                    <h4 className="line-clamp-1 text-xs font-semibold text-white transition group-hover:text-primary sm:text-sm">
                      {movie.title}
                    </h4>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-white/50 sm:text-xs">
                      {movie.description || "Stream on Xora"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default WatchPage;
