import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Radio, Play, X, Loader2, Tv, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { NativeVideoPlayer } from "@/components/xora/VideoPlayer";
import { CpxLiveTvGate } from "@/components/commerce/CpxLiveTvGate";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SportsChannel = {
  id: string; name: string; logo?: string; country?: string;
  categories: string[]; streamUrl: string; quality?: string | null;
  labels: string[]; score?: number;
};

const FILTERS = ["All Sports", "Football", "Basketball", "Tennis", "Motorsport", "Rugby", "Cricket", "Boxing", "Other"] as const;
type SportFilter = (typeof FILTERS)[number];
const SPORT_TERMS: Record<Exclude<SportFilter, "All Sports" | "Other">, string[]> = {
  Football: ["football", "soccer", "futbol"], Basketball: ["basketball", "nba", "fiba"],
  Tennis: ["tennis"], Motorsport: ["motorsport", "motor sport", "racing", "formula 1", "formula one", "f1", "motogp"],
  Rugby: ["rugby"], Cricket: ["cricket"], Boxing: ["boxing", "mma", "ufc", "wrestling", "combat"],
};
function channelText(channel: SportsChannel) {
  return [channel.name, channel.country, ...(channel.categories || []), ...(channel.labels || [])].filter(Boolean).join(" ").toLowerCase();
}
function matchesSport(channel: SportsChannel, filter: SportFilter) {
  if (filter === "All Sports") return true;
  const value = channelText(channel);
  const known = Object.values(SPORT_TERMS).flat();
  if (filter === "Other") return !known.some((term) => value.includes(term));
  return SPORT_TERMS[filter].some((term) => value.includes(term));
}
async function loadSportsChannels(): Promise<SportsChannel[]> {
  const response = await fetch("/api/tv/channels?category=sports&limit=1000");
  if (!response.ok) throw new Error("Unable to load sports channels right now.");
  const data = (await response.json()) as { channels?: SportsChannel[] };
  return Array.isArray(data.channels) ? data.channels : [];
}

export const Route = createFileRoute("/xsports")({
  head: () => ({ meta: [
    { title: "XSports | XoraTV" },
    { name: "description", content: "Browse sports channels on XoraTV and watch in the dedicated player." },
  ] }),
  component: XSportsPage,
});

function XSportsPage() {
  const [filter, setFilter] = useState<SportFilter>("All Sports");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const playerRef = useRef<HTMLElement | null>(null);
  const channelsQuery = useQuery({
    queryKey: ["xora-xsports-channels"], queryFn: loadSportsChannels,
    staleTime: 60_000, refetchInterval: 5 * 60_000, refetchOnWindowFocus: true, retry: 2,
  });
  const channels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (channelsQuery.data || []).filter((channel) => matchesSport(channel, filter) && (!query || channelText(channel).includes(query)));
  }, [channelsQuery.data, filter, search]);
  const selected = channels.find((channel) => channel.id === selectedId)
    || channelsQuery.data?.find((channel) => channel.id === selectedId) || null;
  const featured = selected || channels[0] || null;
  const chooseChannel = (channel: SportsChannel) => {
    setSelectedId(channel.id);
    requestAnimationFrame(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <AppShell wide>
      <CpxLiveTvGate>
        <div className="space-y-6">
          <header className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Radio className="size-5" /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">XoraTV Sports</p>
                <h1 className="font-display text-2xl font-semibold tracking-tight">XSports</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">Your sports channels, all in one place.</p>
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sports channels..." aria-label="Search sports channels" className="h-11 rounded-xl border-border bg-card pl-9 pr-10" />
              {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-secondary"><X className="size-4" /></button>}
            </div>
          </header>

          {featured && (
            <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
              <div className="relative grid min-h-[190px] grid-cols-[1fr_120px] items-center gap-3 overflow-hidden bg-gradient-to-br from-primary/15 via-card to-secondary/70 p-5 sm:grid-cols-[1fr_180px] sm:p-7">
                <div className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative z-10 min-w-0">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-background/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary"><span className="size-1.5 rounded-full bg-primary" /> Featured channel</span>
                  <h2 className="mt-3 line-clamp-2 font-display text-xl font-semibold sm:text-2xl">{featured.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{featured.country || "International"} · {featured.quality || "Sports channel"}</p>
                  <button type="button" onClick={() => chooseChannel(featured)} className="press mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-card hover:brightness-105"><Play className="size-4 fill-current" /> Watch channel</button>
                </div>
                <div className="relative z-10 grid aspect-square place-items-center overflow-hidden rounded-2xl border border-border/70 bg-background/75 p-3 shadow-sm">
                  {featured.logo ? <img src={featured.logo} alt={featured.name} loading="lazy" className="h-full w-full object-contain" /> : <div className="flex flex-col items-center gap-2 text-primary"><Tv className="size-10" /><span className="line-clamp-2 text-center text-xs font-semibold">{featured.name}</span></div>}
                </div>
              </div>
            </section>
          )}

          {selected && (
            <section ref={playerRef} className="scroll-mt-20 space-y-3" aria-label="Sports channel player">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Now selected</p><h2 className="truncate font-display text-lg font-semibold">{selected.name}</h2></div>
                <button type="button" onClick={() => setSelectedId(null)} className="press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"><X className="size-3.5" /> Close player</button>
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-ink shadow-card">
                <NativeVideoPlayer key={selected.id} streamUrl={selected.streamUrl} nativeStreamUrl={`/api/tv/stream?provider=nexus&channel=${encodeURIComponent(selected.id)}`} externalPoster={selected.logo} title={selected.name} liveTv className="aspect-video w-full rounded-none" />
              </div>
            </section>
          )}

          <section className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div><h2 className="font-display text-lg font-semibold">Sports channels</h2><p className="mt-0.5 text-xs text-muted-foreground">{channelsQuery.isLoading ? "Finding available channels..." : channels.length + (channels.length === 1 ? " channel available" : " channels available")}</p></div>
              {channelsQuery.isFetching && !channelsQuery.isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {FILTERS.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item} className={cn("press h-9 shrink-0 rounded-full border px-4 text-xs font-semibold transition-colors", filter === item ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground")}>{item}</button>)}
            </div>

            {channelsQuery.isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="overflow-hidden rounded-2xl border border-border bg-card"><div className="aspect-video animate-pulse bg-secondary" /><div className="space-y-2 p-3"><div className="h-3 w-3/4 animate-pulse rounded bg-secondary" /><div className="h-2.5 w-1/2 animate-pulse rounded bg-secondary" /></div></div>)}</div>
            ) : channelsQuery.isError ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-center"><Radio className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-semibold">Sports channels couldn't load</p><p className="mt-1 text-xs text-muted-foreground">{channelsQuery.error instanceof Error ? channelsQuery.error.message : "Please try again."}</p><button type="button" onClick={() => void channelsQuery.refetch()} className="press mt-4 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Try again</button></div>
            ) : channels.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {channels.map((channel) => {
                  const active = selectedId === channel.id;
                  return <button key={channel.id} type="button" onClick={() => chooseChannel(channel)} aria-pressed={active} className={cn("group overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-card", active ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40")}>
                    <div className="relative grid aspect-video place-items-center overflow-hidden bg-gradient-to-br from-secondary via-surface to-primary/10 p-4">
                      {channel.logo ? <img src={channel.logo} alt="" loading="lazy" className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105" /> : <div className="flex flex-col items-center gap-2 text-primary"><Radio className="size-7" /><span className="line-clamp-2 text-center text-xs font-semibold">{channel.name}</span></div>}
                      <span className="absolute left-2 top-2 rounded-full border border-border/70 bg-background/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">Sports</span>
                      <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-110"><Play className="size-3.5 fill-current" /></span>
                    </div>
                    <div className="space-y-1 p-3"><p className="truncate text-sm font-semibold">{channel.name}</p><p className="truncate text-[11px] text-muted-foreground">{channel.country || "International"} · {channel.quality || "Live channel"}</p><span className="inline-flex items-center gap-1 pt-1 text-[11px] font-semibold text-primary">{active ? "Playing above" : "Watch"} <ChevronRight className="size-3.5" /></span></div>
                  </button>;
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card/60 px-5 py-10 text-center"><Radio className="mx-auto size-8 text-muted-foreground/60" /><p className="mt-3 text-sm font-semibold">No matching sports channels</p><p className="mt-1 text-xs text-muted-foreground">Try another sport or clear your search.</p><button type="button" onClick={() => { setFilter("All Sports"); setSearch(""); }} className="press mt-4 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold hover:bg-secondary">Show all sports channels</button></div>
            )}
          </section>
        </div>
      </CpxLiveTvGate>
    </AppShell>
  );
}
