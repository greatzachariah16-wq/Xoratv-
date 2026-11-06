import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
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
  return channel.categories.includes("series") ? "SERIES" : "MOVIES";
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
    <section
      className="relative isolate overflow-hidden rounded-[2rem] border border-[#b99160]/25 bg-[linear-gradient(145deg,#2a211b_0%,#1c1714_58%,#12100f_100%)] p-4 text-[#f7ead8] shadow-[0_24px_60px_rgba(39,25,16,0.18)] sm:p-6"
      aria-label="X-Series channels"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-[#d2a86b]/10 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <XSeriesMark size="md" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#d8b77f]">XORA</p>
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">X-Series Channels</h2>
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-full border border-[#d6b47a]/25 bg-black/20 px-2.5 py-1.5">
          <span className="size-1.5 rounded-full bg-[#d8b77f] shadow-[0_0_10px_rgba(216,183,127,0.75)]" />
          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#e9d3ad]">Live</span>
          <span className="border-l border-[#d6b47a]/25 pl-2 text-[10px] tabular-nums text-[#cbb89c]">
            {query.isLoading ? "—" : channels.length}
          </span>
        </div>
      </div>

      <div className="relative mt-5 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            aria-pressed={filter === item}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-[11px] font-semibold tracking-wide transition",
              filter === item
                ? "border-[#e1c18a] bg-[#d8b77f] text-[#24190f] shadow-[0_3px_12px_rgba(216,183,127,0.18)]"
                : "border-white/10 bg-white/[0.035] text-[#d8c8b3] hover:border-[#d8b77f]/45 hover:bg-white/[0.07]",
            )}
          >
            {item}
          </button>
        ))}
      </div>

      {selected ? (
        <div className="relative mt-5 space-y-3">
          <div className="overflow-hidden rounded-2xl border border-[#d5b47c]/20 bg-black shadow-[0_14px_36px_rgba(0,0,0,0.3)]">
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
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#fff5e8]">{selected.name}</p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#bca787]">
                {channelType(selected)}{selected.country ? ` · ${selected.country}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Close channel"
              className="grid size-9 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-[#e8d5b8] transition hover:border-[#d8b77f]/50 hover:bg-white/[0.1]"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <ChannelGuide channelId={selected.id} />
        </div>
      ) : null}

      <div className="relative mt-5">
        {query.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="aspect-[5/4] animate-pulse rounded-2xl border border-white/10 bg-white/[0.045]" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-8 text-center text-sm text-[#cbb89c]">
            Channels are temporarily unavailable.
          </div>
        ) : visible.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onClick={() => setSelectedId(channel.id)}
                aria-pressed={selectedId === channel.id}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.25)]",
                  selectedId === channel.id
                    ? "border-[#e1c18a] ring-2 ring-[#d8b77f]/20"
                    : "border-white/10 hover:border-[#d8b77f]/45",
                  "bg-[linear-gradient(145deg,#30251e,#191512)]",
                )}
              >
                <div className="relative grid aspect-[5/4] place-items-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,rgba(213,177,120,0.13),transparent_68%)] p-5">
                  {channel.logo ? (
                    <img
                      src={channel.logo}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="max-h-full max-w-full object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)] transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <span className="grid size-14 place-items-center rounded-2xl border border-[#d8b77f]/30 bg-[#d8b77f]/10 font-display text-2xl font-semibold text-[#e5c58e]">
                      {channel.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full border border-[#e8d1a7]/35 bg-[#d2ad72] text-[#24190f] shadow-lg transition group-hover:scale-105">
                    <Play className="ml-0.5 size-3 fill-current" />
                  </span>
                </div>
                <div className="flex min-h-[58px] items-center justify-between gap-2 border-t border-white/[0.07] px-3 py-2.5">
                  <p className="min-w-0 truncate text-xs font-semibold text-[#f7ead8]">{channel.name}</p>
                  <span className="shrink-0 text-[8px] font-bold tracking-[0.14em] text-[#c8a66f]">
                    {channelType(channel)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-8 text-center text-sm text-[#cbb89c]">
            Nothing to show yet.
          </div>
        )}
      </div>
    </section>
  );
}