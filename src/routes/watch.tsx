import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Film,
  Loader2,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { VideoPlayer } from "@/components/xora/VideoPlayer";
import type { XTvSeriesItem } from "@/integrations/firebase/rtdb";

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
  const res = await fetch("/api/xtv-series/stream?id=" + encodeURIComponent(id));
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
  const [showChrome, setShowChrome] = useState(true);

  const { data: allMovies = [] } = useQuery({
    queryKey: ["xtv-series-all"],
    queryFn: fetchAllMovies,
    staleTime: 30_000,
  });

  const matchedItem = useMemo(
    () => (movieId ? allMovies.find((m) => m.id === movieId) || null : null),
    [allMovies, movieId],
  );

  const {
    data: streamData,
    isLoading: isStreamLoading,
    error: streamError,
    refetch: refetchStream,
  } = useQuery({
    queryKey: ["watch-stream", movieId],
    queryFn: () => fetchStream(movieId as string),
    enabled: Boolean(movieId),
    retry: 1,
  });

  const activeMovie = matchedItem || streamData?.item || null;
  const streamUrl = streamData?.streamUrl || activeMovie?.videoUrl || null;

  const upNextMovies = useMemo(
    () => allMovies.filter((movie) => movie.id !== movieId).slice(0, 6),
    [allMovies, movieId],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void navigate({ to: "/xtv-series" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(document.fullscreenElement === document.getElementById("cinema-stage"));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!showChrome) return;
    const timer = window.setTimeout(() => setShowChrome(false), 3500);
    return () => window.clearTimeout(timer);
  }, [showChrome]);

  function toggleFullscreen() {
    const stage = document.getElementById("cinema-stage");
    if (!stage) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void stage.requestFullscreen?.().catch(() => {});
    }
  }

  return (
    <div
      id="cinema-stage"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      onMouseMove={() => setShowChrome(true)}
      onTouchStart={() => setShowChrome(true)}
    >
      <header
        className={
          "absolute inset-x-0 top-0 z-20 transition-opacity duration-300 " +
          (showChrome ? "opacity-100" : "pointer-events-none opacity-0")
        }
      >
        <div className="flex h-16 items-center justify-between bg-gradient-to-b from-black/90 via-black/55 to-transparent px-4 md:px-6">
          <Link
            to="/xtv-series"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-xl transition hover:bg-white/10"
          >
            <ArrowLeft className="size-3.5" />
            <span className="hidden sm:inline">Back to X Series</span>
            <span className="sm:hidden">Back</span>
          </Link>

          <div className="mx-3 min-w-0 flex-1 text-center">
            <div className="mx-auto flex max-w-[55vw] items-center justify-center gap-2">
              <Film className="hidden size-3.5 shrink-0 text-primary sm:block" />
              <h1 className="truncate text-sm font-semibold text-white drop-shadow md:text-base">
                {activeMovie?.title || "Xora Cinema"}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-xl transition hover:bg-white/10"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {isStreamLoading && !streamUrl ? (
          <div className="grid h-full w-full place-items-center bg-black px-6 text-center">
            <div>
              <Loader2 className="mx-auto size-9 animate-spin text-primary" />
              <p className="mt-4 font-display text-sm font-semibold text-white">
                Preparing Cinema
              </p>
              <p className="mt-1 text-xs text-white/50">
                Connecting to the playback stream...
              </p>
            </div>
          </div>
        ) : streamError && !streamUrl ? (
          <div className="grid h-full w-full place-items-center bg-black px-6 text-center">
            <div className="max-w-sm">
              <Film className="mx-auto size-9 text-primary" />
              <h2 className="mt-4 font-display text-lg font-semibold">Playback unavailable</h2>
              <p className="mt-2 text-xs leading-5 text-white/55">
                {streamError instanceof Error
                  ? streamError.message
                  : "The video stream could not be loaded."}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void refetchStream()}
                  className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  Retry
                </button>
                <Link
                  to="/xtv-series"
                  className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                >
                  Back
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
            className="h-full w-full rounded-none"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-black text-center text-xs text-white/50">
            {!movieId ? "No movie was selected." : "No stream configured for this title."}
          </div>
        )}
      </div>

      {upNextMovies.length > 0 && showChrome && !isStreamLoading && !streamError ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-black/75 via-black/20 to-transparent px-4 pb-4 pt-14">
          <div className="pointer-events-auto hidden max-w-xl items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-black/45 p-2 backdrop-blur-xl sm:flex">
            <span className="shrink-0 px-2 text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
              Up next
            </span>
            {upNextMovies.slice(0, 3).map((movie) => (
              <button
                key={movie.id}
                type="button"
                onClick={() => void navigate({ to: "/watch", search: { id: movie.id } })}
                className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/10"
              >
                <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/10">
                  {movie.thumbnailUrl ? (
                    <img
                      src={movie.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Play className="size-3 text-white/60" />
                  )}
                </span>
                <span className="max-w-32 truncate text-[11px] font-medium text-white/80">
                  {movie.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default WatchPage;
