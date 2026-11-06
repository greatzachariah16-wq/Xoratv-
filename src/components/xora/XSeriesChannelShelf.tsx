import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Film, Play, Radio, Tv } from "lucide-react";
import { NativeVideoPlayer } from "@/components/xora/VideoPlayer";
import { ChannelGuide } from "@/components/xora/ChannelGuide";
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
  if (!movies.ok || !series.ok) throw new Error("The movie-channel catalogue could not be loaded.");
  const [movieData, seriesData] = await Promise.all([
    movies.json() as Promise<ChannelResponse>,
    series.json() as Promise<ChannelResponse>,
  ]);
  return [...(movieData.channels || []), ...(seriesData.channels || [])];
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
  const visible = useMemo(() => channels.filter((channel) => {
    const tags = [channel.name, ...(channel.categories || [])].join(" ").toLowerCase();
    if (filter === "Movies") return channel.categories.includes("movies");
    if (filter === "Series") return channel.categories.includes("series");
    if (filter === "Action" || filter === "Romance") return tags.includes(filter.toLowerCase());
    return true;
  }), [channels, filter]);
  const selected = channels.find((channel) => channel.id === selectedId) || null;

  return (
    <section className="space-y-4 rounded-3xl border border-border/70 bg-card/70 p-4 shadow-sm sm:p-5" aria-label="X-Series live movie and series channels">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Film className="size-5" /></span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Live cinema</p>
          <h2 className="font-display text-lg font-semibold">Movie & Series Channels</h2>
          <p className="text-xs text-muted-foreground">Live channels from the dedicated public movie and series playlists.</p>
        </div>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{query.isLoading ? "Loading…" : channels.length}</span>
      </div>

      <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-1">
        {(["All", "Movies", "Series", "Action", "Romance"] as ShelfFilter[]).map((item) => (
          <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item}
            className={cn("shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition", filter === item ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/40")}>
            {item === "All" ? "All channels" : item}
          </button>
        ))}
      </div>

      {selected ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-border bg-black">
            <NativeVideoPlayer key={selected.id} streamUrl={selected.streamUrl}
              nativeStreamUrl={`/api/tv/stream?provider=iptv-org&channel=${encodeURIComponent(selected.id)}`}
              externalPoster={selected.logo} title={selected.name} liveTv className="aspect-video w-full" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{selected.name}</p><p className="text-[11px] text-muted-foreground">{selected.country || "International"} · Live channel</p></div>
            <button type="button" onClick={() => setSelectedId(null)} className="rounded-full border border-border px-3 py-1.5 text-xs">Close</button>
          </div>
          <ChannelGuide channelId={selected.id} />
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-video animate-pulse rounded-xl bg-secondary" />)}</div>
      ) : query.isError ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{query.error instanceof Error ? query.error.message : "Movie channels are temporarily unavailable."}</div>
      ) : visible.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visible.map((channel) => (
            <button key={channel.id} type="button" onClick={() => setSelectedId(channel.id)} aria-pressed={selectedId === channel.id}
              className={cn("group overflow-hidden rounded-xl border bg-background text-left transition hover:border-primary/50", selectedId === channel.id ? "border-primary ring-2 ring-primary/20" : "border-border/70")}>
              <div className="relative grid aspect-video place-items-center bg-secondary/60 p-4">
                {channel.logo ? <img src={channel.logo} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Tv className="size-8 text-muted-foreground" />}
                <span className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-black/75 text-white"><Play className="size-3 fill-current" /></span>
              </div>
              <div className="p-2.5"><p className="truncate text-xs font-semibold">{channel.name}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{channel.categories.includes("series") ? "Series channel" : "Movie channel"} · {channel.country || "International"}</p></div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {filter === "Action" || filter === "Romance" ? `No channel is explicitly tagged ${filter.toLowerCase()} in the source metadata yet.` : "No playable channels were returned by these playlists."}
        </div>
      )}
      <p className="text-[10px] leading-4 text-muted-foreground">Action and Romance filters use channel names and source metadata only; channels are not assigned invented genres. EPG appears when a matching programme schedule is available.</p>
    </section>
  );
}
