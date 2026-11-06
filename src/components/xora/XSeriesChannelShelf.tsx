import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, Tv } from "lucide-react";
import { NativeVideoPlayer } from "@/components/xora/VideoPlayer";
import { ChannelGuide } from "@/components/xora/ChannelGuide";
import { XSeriesMark } from "@/components/xora/XSeriesMark";
import { cn } from "@/lib/utils";

type XSeriesLiveChannel = {
  id: string;
  name: string;
  logo?: string;
  country?: string;
  categories: string[];
  streamUrl: string;
  quality?: string | null;
  provider?: "iptv-org";
};

type ChannelResponse = { ok?: boolean; total?: number; channels?: XSeriesLiveChannel[]; error?: string };
type ShelfFilter = "All" | "Movies" | "Series" | "Action" | "Romance";

async function loadXSeriesChannels(): Promise<XSeriesLiveChannel[]> {
  const [movies, series] = await Promise.all([
    fetch("/api/tv/channels?category=movies&limit=100"),
    fetch("/api/tv/channels?category=series&limit=100"),
  ]);
  if (!movies.ok || !series.ok) throw new Error("Channel catalogue unavailable");
  const [movieData, seriesData] = await Promise.all([
    movies.json() as Promise<ChannelResponse>,
    series.json() as Promise<ChannelResponse>,
  ]);
  return [...(movieData.channels || []), ...(seriesData.channels || [])];
}

const FILTERS: ShelfFilter[] = ["All", "Movies", "Series", "Action", "Romance"];

function channelType(channel: XSeriesLiveChannel) {
  return (channel.categories || []).includes("series") ? "SERIES" : "MOVIES";
}

export function XSeriesChannelShelf() {
  const [filter, setFilter] = useState<ShelfFilter>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["xseries-iptv-movie-series-channels"],
    queryFn: loadXSeriesChannels,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  const channels = query.data || [];
  const visible = useMemo(
    () =>
      channels.filter((channel) => {
        const categories = channel.categories || [];
        const tags = [channel.name, ...categories].join(" ").toLowerCase();
        if (filter === "Movies") return categories.includes("movies");
        if (filter === "Series") return categories.includes("series");
        if (filter === "Action" || filter === "Romance") return tags.includes(filter.toLowerCase());
        return true;
      }),
    [channels, filter],
  );
  const selected = channels.find((channel) => channel.id === selectedId) || null;

  return (
    <section className="w-full min-w-0 space-y-7 text-foreground" aria-label="X-Series live channels">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <XSeriesMark size="md" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">XORA</p>
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">X-Series Channels</h2>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-live shadow-[0_0_9px_rgba(220,70,55,0.65)]" />
              Live television · {query.isLoading ? "Loading channels" : `${channels.length} channels`}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Live TV
        </span>
      </header>

      <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label="Filter channels">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            aria-pressed={filter === item}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors sm:text-sm",
              filter === item
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-transparent text-secondary-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {item}
          </button>
        ))}
        {filter !== "All" ? (
          <button type="button" onClick={() => setFilter("All")} className="shrink-0 px-3 py-2 text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
            Reset
          </button>
        ) : null}
      </nav>

      <section className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {selected ? (
            <div className="overflow-hidden rounded-xl bg-black shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
              <NativeVideoPlayer
                key={selected.id}
                streamUrl={selected.streamUrl}
                nativeStreamUrl={`/api/tv/stream?provider=iptv-org&channel=${encodeURIComponent(selected.id)}`}
                externalPoster={selected.logo}
                title={selected.name}
                liveTv
                className="aspect-video w-full"
              />
            </div>
          ) : (
            <div className="relative grid aspect-video w-full place-items-center overflow-hidden rounded-xl bg-[radial-gradient(70%_80%_at_50%_40%,rgba(164,116,64,0.22),transparent_72%),linear-gradient(145deg,#29211b,#100e0c)] shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
              <div className="px-5 text-center text-[#f7ead8]">
                <span className="mx-auto grid size-14 place-items-center rounded-full border border-[#d8b77f]/40 text-[#d8b77f] sm:size-16">
                  <Tv className="size-6 sm:size-7" />
                </span>
                <p className="mt-4 font-display text-xl font-semibold sm:text-3xl">Choose a channel to start watching</p>
                <p className="mt-1 text-xs text-[#bcae9c] sm:text-sm">Select any channel below</p>
              </div>
            </div>
          )}
          {selected ? (
            <div className="mt-3 flex min-w-0 items-center gap-3">
              {selected.logo ? (
                <img src={selected.logo} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-lg bg-card object-contain p-1" />
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{selected.name}</p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {channelType(selected)}{selected.country ? ` · ${selected.country}` : ""}
                </p>
              </div>
              <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-live/20 bg-live/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-live">
                <span className="size-1.5 rounded-full bg-live" /> Live
              </span>
            </div>
          ) : null}
        </div>

        <aside className="min-w-0 lg:border-l lg:border-border lg:pl-5">
          {selected ? (
            <ChannelGuide channelId={selected.id} />
          ) : (
            <div className="flex h-full min-h-36 flex-col justify-center border-t border-border pt-5 lg:border-l-0 lg:border-t-0 lg:pt-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Programme guide</p>
              <p className="mt-2 text-sm text-muted-foreground">Now playing and upcoming programmes will appear here when you choose a channel.</p>
            </div>
          )}
        </aside>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent" />

      <section aria-label="Browse channels">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Explore the lineup</p>
            <h3 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">Browse channels</h3>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{query.isLoading ? "…" : `${visible.length} shown`}</span>
        </div>

        {query.isLoading ? (
          <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="aspect-[16/10] animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="mt-5 rounded-xl border border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Channels are temporarily unavailable.
          </div>
        ) : visible.length ? (
          <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {visible.map((channel) => {
              const isSelected = selectedId === channel.id;
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(channel.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  aria-pressed={isSelected}
                  className="group min-w-0 text-left"
                >
                  <div className={cn(
                    "relative grid aspect-[16/10] place-items-center overflow-hidden rounded-xl border bg-[radial-gradient(ellipse_at_50%_40%,rgba(213,177,120,0.13),transparent_68%),linear-gradient(145deg,#30251e,#191512)] p-5 transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_12px_28px_rgba(0,0,0,0.25)]",
                    isSelected ? "border-primary ring-2 ring-primary/35" : "border-white/10 group-hover:border-primary/50",
                  )}>
                    {channel.logo ? (
                      <img src={channel.logo} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)] transition duration-300 group-hover:scale-105" />
                    ) : (
                      <span className="grid size-14 place-items-center rounded-2xl border border-[#d8b77f]/30 bg-[#d8b77f]/10 font-display text-2xl font-semibold text-[#e5c58e]">
                        {channel.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/85 backdrop-blur-sm">
                      {channelType(channel)}
                    </span>
                    <span className="absolute bottom-2 right-2 grid size-9 place-items-center rounded-full border border-[#e8d1a7]/35 bg-[#d2ad72] text-[#24190f] shadow-lg transition group-hover:scale-105">
                      <Play className="ml-0.5 size-3.5 fill-current" />
                    </span>
                  </div>
                  <p className={cn("mt-2 truncate text-sm font-semibold", isSelected ? "text-primary" : "text-foreground")}>{channel.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{channel.country || "Live channel"}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            No channels match this filter.
          </div>
        )}
      </section>
    </section>
  );
}
