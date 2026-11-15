import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Clapperboard,
  Film,
  Maximize2,
  Minimize2,
  Play,
  RotateCw,
  Search,
  Sparkles,
} from "lucide-react";
import { VideoPlayer } from "@/components/xora/VideoPlayer";
import { LargeBannerPopupAd } from "@/components/ads/LargeBannerPopupAd";
import type { XTvSeriesItem } from "@/integrations/firebase/rtdb";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/watch")({
  head: () => ({
    meta: [
      { title: "Xora Cinema — Watch Movies & Series" },
      {
        name: "description",
        content: "Discover and watch movies and series in the Xora Cinema experience.",
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
}> {
  try {
    const res = await fetch(`/api/xtv-series/stream?id=${encodeURIComponent(id)}`);
    if (res.ok) {
      const data = (await res.json()) as {
        ok: boolean;
        streamUrl?: string;
        provider?: string;
      };
      if (data.ok && data.streamUrl) {
        return {
          streamUrl: data.streamUrl,
          sourceType: data.provider || "hls",
          title: "Xora Cinema",
        };
      }
    }
  } catch {
    // Continue to the catalog playback resolver.
  }

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
          title: "Xora Cinema",
        };
      }
    }
  } catch {
    // Use the existing stream proxy as the final fallback.
  }

  return {
    streamUrl: `/api/stream/embed/${encodeURIComponent(id)}`,
    sourceType: "embed",
    title: "Xora Cinema",
  };
}

function isSeriesTitle(item: XTvSeriesItem): boolean {
  const metadata = [item.tag, item.genre, ...(item.categories || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return Boolean(
    (item.seasons || 0) > 0 ||
      (item.episodesCount || 0) > 0 ||
      /\b(series|season|episodic|tv show|mini-series|docuseries)\b/.test(metadata),
  );
}

function WatchPage() {
  const navigate = useNavigate();
  const { id } = Route.useSearch();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [adTriggerKey, setAdTriggerKey] = useState(0);
  const [search, setSearch] = useState("");

  const { data: allMovies = [], isLoading: isLoadingMovies } = useQuery({
    queryKey: ["xtv-series-items-all"],
    queryFn: fetchAllMovies,
    staleTime: 5 * 60 * 1000,
  });

  const activeMovie = useMemo(
    () => allMovies.find((movie) => movie.id === id) || null,
    [allMovies, id],
  );
  const activeId = activeMovie?.id || id || "";

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
    "";

  const series = useMemo(() => allMovies.filter(isSeriesTitle), [allMovies]);
  const movies = useMemo(() => allMovies.filter((item) => !isSeriesTitle(item)), [allMovies]);
  const recommendations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allMovies
      .filter((item) => item.id !== activeId)
      .filter((item) =>
        !q ||
        [item.title, item.description, item.genre, item.tag, ...(item.categories || [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 18);
  }, [allMovies, activeId, search]);

  function selectTitle(nextId: string) {
    void navigate({ to: "/watch", search: { id: nextId } });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleFullscreen() {
    setAdTriggerKey((previous) => previous + 1);
    const stage = document.getElementById("xora-cinema-stage");
    if (!stage) return;
    if (!document.fullscreenElement) {
      const request = stage.requestFullscreen?.();
      if (request) void request.then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      const exit = document.exitFullscreen?.();
      if (exit) void exit.then(() => setIsFullscreen(false)).catch(() => {});
    }
  }

  const isSeries = activeMovie ? isSeriesTitle(activeMovie) : false;
  const titleKind = isSeries ? "Series" : "Movie";

  return (
    <div className="min-h-screen overflow-x-clip bg-[#100d0c] text-[#fffaf5] selection:bg-[#b65a3c]/30">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#100d0c]/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-[62px] max-w-[1480px] items-center justify-between gap-3 px-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/xtv-series"
              className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.055] text-white/80 transition hover:border-[#c8795b]/50 hover:bg-white/10"
              aria-label="Back to X-Series"
              title="Back to X-Series"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-[#d69a7c]">XORA ORIGINAL EXPERIENCE</p>
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">Xora Cinema</h1>
                <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-semibold text-white/45 sm:inline-flex">WATCH</span>
              </div>
            </div>
          </div>
          <Link
            to="/xtv-series"
            className="shrink-0 rounded-full border border-[#c8795b]/30 bg-[#b65a3c]/10 px-3.5 py-2 text-[11px] font-semibold text-[#e7b29a] transition hover:bg-[#b65a3c]/20"
          >
            Browse X-Series
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1480px] px-3 pb-16 pt-5 sm:px-7 sm:pt-8">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_310px] xl:items-start">
          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                <Clapperboard className="size-3.5 text-[#d18a69]" />
                Now showing
              </div>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-2 text-[10px] font-semibold text-white/75 transition hover:bg-white/10"
              >
                {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </button>
            </div>

            <div
              id="xora-cinema-stage"
              className={cn(
                "relative isolate aspect-video w-full overflow-hidden rounded-[18px] border border-white/[0.11] bg-black shadow-[0_28px_90px_rgba(0,0,0,0.5),0_4px_18px_rgba(173,91,61,0.10)] sm:rounded-[24px]",
                isFullscreen && "h-screen w-screen max-h-screen rounded-none",
              )}
            >
              {activeMovie && streamUrl ? (
                <VideoPlayer
                  key={activeId}
                  streamUrl={streamUrl}
                  externalPoster={activeMovie.thumbnailUrl}
                  title={activeMovie.title}
                  autoPlay={false}
                  cinemaMode
                  vertical={false}
                  className="h-full w-full !rounded-none"
                  postId={activeId}
                  authorId="xora-cinema"
                  genre={activeMovie.genre}
                />
              ) : isStreamLoading || isLoadingMovies ? (
                <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,rgba(177,91,60,0.16),transparent_58%),#090807] px-5 text-center">
                  <div>
                    <div className="mx-auto grid size-14 place-items-center rounded-full border border-[#c8795b]/25 bg-[#b65a3c]/10 text-[#e5a486]">
                      <Clapperboard className="size-6" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-white">Preparing your cinema</p>
                    <p className="mt-1 text-xs text-white/45">Loading the selected title and stream.</p>
                  </div>
                </div>
              ) : activeMovie && streamError ? (
                <div className="absolute inset-0 grid place-items-center px-5 text-center">
                  <div>
                    <Film className="mx-auto size-8 text-[#d18a69]" />
                    <p className="mt-3 text-sm font-semibold">This stream is taking a break</p>
                    <p className="mt-1 text-xs text-white/50">Try resolving the stream again.</p>
                    <button
                      type="button"
                      onClick={() => void refetchStream()}
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#b65a3c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#c66b4b]"
                    >
                      <RotateCw className="size-3.5" /> Retry playback
                    </button>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,rgba(177,91,60,0.16),transparent_58%),#090807] px-5 text-center">
                  <div className="max-w-sm">
                    <div className="mx-auto grid size-14 place-items-center rounded-full border border-[#c8795b]/25 bg-[#b65a3c]/10 text-[#e5a486]">
                      <Play className="ml-0.5 size-6 fill-current" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-white">Choose something to watch</p>
                    <p className="mt-1 text-xs leading-5 text-white/45">Select a movie or series below. Your video will load right here.</p>
                  </div>
                </div>
              )}
            </div>
            <LargeBannerPopupAd placement="cinema_popup" triggerKey={adTriggerKey} />

            {activeMovie ? (
              <section className="mt-5 rounded-[20px] border border-white/[0.09] bg-[linear-gradient(135deg,rgba(255,248,241,0.075),rgba(255,248,241,0.025))] p-4 shadow-[0_12px_35px_rgba(0,0,0,0.18)] sm:mt-6 sm:rounded-[24px] sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[#c8795b]/25 bg-[#b65a3c]/15 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-[#e5a486]">{titleKind}</span>
                  {activeMovie.genre ? <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-[10px] text-white/65">{activeMovie.genre}</span> : null}
                  {activeMovie.year ? <span className="text-[10px] text-white/45">{activeMovie.year}</span> : null}
                  {activeMovie.durationSeconds ? <span className="text-[10px] text-white/45">{Math.round(activeMovie.durationSeconds / 60)} min</span> : null}
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 max-w-3xl">
                    <h2 className="text-xl font-semibold tracking-tight text-[#fff8f1] sm:text-2xl">{activeMovie.title}</h2>
                    <p className="mt-2 text-xs leading-6 text-white/60 sm:text-sm">{activeMovie.description || "A curated Xora entertainment experience."}</p>
                  </div>
                  {isSeries ? (
                    <div className="flex shrink-0 gap-2">
                      {activeMovie.seasons ? <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"><p className="text-base font-semibold text-white">{activeMovie.seasons}</p><p className="text-[9px] uppercase tracking-wider text-white/40">Seasons</p></div> : null}
                      {activeMovie.episodesCount ? <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"><p className="text-base font-semibold text-white">{activeMovie.episodesCount}</p><p className="text-[9px] uppercase tracking-wider text-white/40">Episodes</p></div> : null}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="min-w-0 rounded-[20px] border border-white/[0.09] bg-white/[0.035] p-4 sm:p-5 xl:sticky xl:top-[82px]">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[#d18a69]" />
              <h2 className="text-sm font-semibold text-white">Your next watch</h2>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-white/45">A hand-picked path through the Xora collection.</p>
            <div className="mt-4 space-y-3">
              {allMovies.filter((item) => item.id !== activeId).slice(0, 5).map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTitle(item.id)}
                  className="group flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-white/[0.06]"
                >
                  <span className="w-4 shrink-0 text-xs tabular-nums text-white/25">{String(index + 1).padStart(2, "0")}</span>
                  <span className="relative aspect-video w-[104px] shrink-0 overflow-hidden rounded-lg bg-white/10">
                    {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <span className="grid h-full place-items-center"><Film className="size-4 text-white/30" /></span>}
                    <span className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition group-hover:opacity-100"><Play className="size-4 fill-current text-white" /></span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-white/85 group-hover:text-[#e5a486]">{item.title}</span>
                    <span className="mt-1 block truncate text-[10px] text-white/40">{isSeriesTitle(item) ? "Series" : item.genre || "Movie"}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>
        </section>

        <section className="mt-10 sm:mt-14">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#d69a7c]">DISCOVER YOUR NEXT STORY</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#fff8f1] sm:text-2xl">Explore the collection</h2>
            </div>
            <label className="flex h-10 w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 text-white/40 sm:max-w-[280px]">
              <Search className="size-4 shrink-0" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a movie or series" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/35" />
            </label>
          </div>

          {series.length > 0 ? (
            <div className="mb-9">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Series worth settling into</h3>
                <span className="text-[10px] text-white/35">{series.length} titles</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {series.filter((item) => item.id !== activeId && (!search || recommendations.some((candidate) => candidate.id === item.id))).slice(0, 10).map((item) => (
                  <TitleCard key={item.id} item={item} onSelect={selectTitle} />
                ))}
              </div>
            </div>
          ) : null}

          {movies.length > 0 ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Movies & more</h3>
                <span className="text-[10px] text-white/35">{movies.length} titles</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {recommendations.filter((item) => !isSeriesTitle(item)).slice(0, 10).map((item) => (
                  <TitleCard key={item.id} item={item} onSelect={selectTitle} />
                ))}
              </div>
            </div>
          ) : null}

          {!allMovies.length && !isLoadingMovies ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center text-xs text-white/45">The Xora collection is being prepared. Please check back soon.</div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function TitleCard({ item, onSelect }: { item: XTvSeriesItem; onSelect: (id: string) => void }) {
  const isSeries = isSeriesTitle(item);
  return (
    <button type="button" onClick={() => onSelect(item.id)} className="group min-w-0 text-left">
      <div className="relative aspect-[16/10] overflow-hidden rounded-[15px] border border-white/[0.09] bg-white/[0.06] shadow-[0_8px_22px_rgba(0,0,0,0.18)] transition duration-300 group-hover:-translate-y-0.5 group-hover:border-[#c8795b]/45 group-hover:shadow-[0_14px_30px_rgba(0,0,0,0.28)]">
        {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /> : <div className="grid h-full place-items-center"><Film className="size-7 text-white/25" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <span className="absolute bottom-2 left-2 rounded-full border border-white/15 bg-black/45 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-white/80 backdrop-blur">{isSeries ? "Series" : item.genre || "Movie"}</span>
        <span className="absolute right-2 top-2 grid size-8 place-items-center rounded-full border border-white/25 bg-black/35 text-white opacity-0 backdrop-blur transition group-hover:opacity-100"><Play className="ml-0.5 size-3 fill-current" /></span>
      </div>
      <span className="mt-2 block truncate text-xs font-semibold text-white/85 transition group-hover:text-[#e5a486]">{item.title}</span>
      <span className="mt-1 block truncate text-[10px] text-white/40">{item.year || (isSeries ? "Series" : "Xora collection")}</span>
    </button>
  );
}

export default WatchPage;
