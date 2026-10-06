import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radio, Search, Tv, Play, Heart, RefreshCw } from "lucide-react";
import { AppShell, FeedTabs } from "@/components/xora/AppShell";
import { NativeVideoPlayer } from "@/components/xora/VideoPlayer";
import { cn } from "@/lib/utils";

type Channel = {
  id: string;
  name: string;
  group?: string;
  logo?: string;
  latencyMs?: number;
};

type ChannelResponse = { ok: boolean; total: number; channels: Channel[]; error?: string };

async function fetchChannels(params: { q?: string; group?: string }): Promise<ChannelResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.group) search.set("group", params.group);
  search.set("limit", "60");
  const res = await fetch("/api/tv/channels?" + search.toString());
  if (!res.ok) throw new Error("Live TV channels could not be loaded.");
  return res.json();
}

async function resolveStream(channelId: string): Promise<string> {
  const res = await fetch("/api/xtv-series/stream?channelId=" + encodeURIComponent(channelId));
  const data = await res.json();
  if (!res.ok || !data?.streamUrl) throw new Error(data?.error || "Channel is temporarily unavailable.");
  return data.streamUrl;
}

export const Route = createFileRoute("/tv")({
  head: () => ({
    meta: [
      { title: "Live TV | XoraTV" },
      { name: "description", content: "Watch live channels on XoraTV." },
    ],
  }),
  component: LiveTvPage,
});

function LiveTvPage() {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [selected, setSelected] = useState<Channel | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loadingStream, setLoadingStream] = useState(false);
  const [streamError, setStreamError] = useState("");

  const query = useQuery({
    queryKey: ["live-tv-channels", search, group],
    queryFn: () => fetchChannels({ q: search, group }),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    retry: 5,
  });

  const channels = query.data?.channels ?? [];
  const groups = useMemo(() => {
    const seen = new Set<string>();
    for (const channel of channels) if (channel.group?.trim()) seen.add(channel.group.trim());
    return Array.from(seen).slice(0, 12);
  }, [channels]);

  const playChannel = async (channel: Channel) => {
    setSelected(channel);
    setStreamUrl(null);
    setStreamError("");
    setLoadingStream(true);
    try {
      setStreamUrl(await resolveStream(channel.id));
    } catch (error) {
      setStreamError(error instanceof Error ? error.message : "Channel unavailable.");
    } finally {
      setLoadingStream(false);
    }
  };

  useEffect(() => {
    if (!selected || streamUrl) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const url = await resolveStream(selected.id);
        if (!cancelled) {
          setStreamUrl(url);
          setStreamError("");
          setLoadingStream(false);
        }
      } catch (error) {
        if (!cancelled) {
          setStreamError(error instanceof Error ? error.message : "Waiting for a live stream…");
        }
      }
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selected, streamUrl]);

  return (
    <AppShell wide>
        <section className="relative overflow-hidden rounded-[1.8rem] border border-border/70 bg-surface shadow-sm">
          <div className="border-b border-border/50 bg-gradient-to-br from-clay-soft via-background to-secondary/30 p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-primary"><Radio className="size-4" /><span className="text-xs font-bold uppercase tracking-[0.18em]">Xora Live</span></div>
                <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">Television, <span className="text-primary">inside Xora.</span></h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">Browse live channels the same way you browse X Series: featured first, then curated shelves you can switch between instantly.</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-right backdrop-blur-sm">
                <p className="text-2xl font-bold">{query.data?.total ?? "—"}</p><p className="text-[11px] text-muted-foreground">live channels indexed</p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search channels..." className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary" />
              </div>
              <button type="button" onClick={() => query.refetch()} className="grid h-11 place-items-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-secondary" aria-label="Refresh channels"><RefreshCw className={cn("size-4", query.isFetching && "animate-spin")} /></button>
            </div>

            {groups.length > 0 && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                <button type="button" onClick={() => setGroup("")} className={cn("shrink-0 rounded-full px-4 py-2 text-xs font-semibold", !group ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>All</button>
                {groups.map((item) => <button key={item} type="button" onClick={() => setGroup(item)} className={cn("shrink-0 rounded-full px-4 py-2 text-xs font-semibold", group === item ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{item}</button>)}
              </div>
            )}

            {selected && (
              <section className="mt-5 overflow-hidden rounded-2xl border border-border/60 bg-black shadow-card">
                {streamUrl ? <NativeVideoPlayer streamUrl={streamUrl} title={selected.name} autoPlay className="aspect-video w-full" /> : <div className="grid aspect-video place-items-center text-center text-white">{loadingStream ? <div><div className="mx-auto size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" /><p className="mt-3 text-sm">Connecting to {selected.name}…</p></div> : <div><p className="font-semibold">Channel unavailable</p><p className="mt-1 text-xs text-white/60">{streamError}</p></div>}</div>}
                <div className="flex items-center gap-3 border-t border-white/10 p-3 text-white"><div className="grid size-10 place-items-center overflow-hidden rounded-lg bg-white/10">{selected.logo ? <img src={selected.logo} alt="" className="h-full w-full object-contain" /> : <Tv className="size-5" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{selected.name}</p><p className="text-xs text-white/50">{selected.group || "Live channel"}</p></div><Heart className="size-4 text-white/50" /></div>
              </section>
            )}

            <div className="mt-6">
              <div className="mb-3"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Channel guide</p><h2 className="font-display text-xl font-semibold tracking-tight">Explore live TV</h2></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {channels.map((channel) => (
                <button key={channel.id} type="button" onClick={() => void playChannel(channel)} className={cn("group overflow-hidden rounded-2xl border bg-background text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md", selected?.id === channel.id ? "border-primary" : "border-border/60")}>
                  <div className="relative grid aspect-video place-items-center bg-secondary/50 p-4">{channel.logo ? <img src={channel.logo} alt="" loading="lazy" className="max-h-14 max-w-[75%] object-contain transition group-hover:scale-105" /> : <Tv className="size-8 text-muted-foreground" />}<span className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-md transition group-hover:opacity-100"><Play className="size-3.5 fill-current" /></span></div>
                  <div className="p-3"><p className="line-clamp-1 text-xs font-semibold">{channel.name}</p><p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">{channel.group || "Live"}</p></div>
                </button>
              ))}
              </div>
            </div>

            {!query.isFetching && channels.length === 0 && <div className="py-16 text-center"><Tv className="mx-auto size-10 text-muted-foreground/40" /><p className="mt-3 font-semibold">No channels found</p><p className="mt-1 text-sm text-muted-foreground">Try another search or category.</p></div>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
