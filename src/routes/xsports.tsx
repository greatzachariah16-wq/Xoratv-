import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Radio, Play, X, Loader2, Tv, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { NativeVideoPlayer } from "@/components/xora/VideoPlayer";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChannelGuide } from "@/components/xora/ChannelGuide";

type SportsChannel = {
  id: string; name: string; logo?: string; country?: string;
  categories: string[]; streamUrl: string; quality?: string | null;
  labels: string[]; score?: number; provider?: "nexus" | "iptv-org";
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
  // ESPN and SuperSport are sports broadcasters whose channel metadata may
  // omit the sport name; classify these brand feeds as football for XSports.
  if (filter === "Football" && /espn|supersport/i.test(channel.name)) return true;
  const known = Object.values(SPORT_TERMS).flat();
  if (filter === "Other") return !known.some((term) => value.includes(term));
  return SPORT_TERMS[filter].some((term) => value.includes(term));
}
async function loadSportsChannels(): Promise<SportsChannel[]> {
  const response = await fetch("/api/tv/channels?category=sports&limit=10000");
  if (!response.ok) throw new Error("Unable to load sports channels right now.");
  const data = (await response.json()) as { channels?: SportsChannel[] };
  const channels = Array.isArray(data.channels) ? data.channels : [];
  // Free Samsung TV Plus WWE archive channel candidate, added for in-app playback testing.
  const wweCandidate: SportsChannel = {
    id: "wwe-superstar-central",
    name: "WWE Superstar Central",
    country: "United States",
    categories: ["Wrestling"],
    labels: ["WWE", "24/7", "Samsung TV Plus", "Archive"],
    quality: "1080p · 24/7 archive",
    provider: "iptv-org",
    streamUrl: "https://dpv6ceilvhyrw.cloudfront.net/playlist.m3u8",
  };
  const fixedCandidates = [wweCandidate];
  const fixedIds = new Set(fixedCandidates.map((channel) => channel.id));
  return [...fixedCandidates, ...channels.filter((channel) => !fixedIds.has(channel.id))];
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
            <section className="relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-[#100d17] shadow-[0_24px_70px_rgba(10,5,20,0.32)]">
              <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_46%,rgba(139,92,246,0.34),transparent_38%),radial-gradient(ellipse_at_12%_115%,rgba(222,68,104,0.18),transparent_42%),linear-gradient(115deg,#100d17_0%,#181020_54%,#25132e_100%)]" />
              <div aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:linear-gradient(118deg,transparent_0%,rgba(255,255,255,0.055)_48%,transparent_49%),linear-gradient(0deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:100%_100%,100%_34px]" />
              <div className="relative grid min-h-[238px] grid-cols-[minmax(0,1fr)_104px] items-center gap-3 p-4 sm:min-h-[286px] sm:grid-cols-[minmax(0,1fr)_210px] sm:gap-6 sm:p-8">
                <div className="relative z-10 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/75">
                      <span className="size-1.5 rounded-full bg-violet-300 shadow-[0_0_10px_rgba(196,181,253,0.9)]" />
                      Featured on XSports
                    </span>
                    {featured.id === "wwe-superstar-central" && (
                      <span className="rounded-full border border-amber-200/20 bg-amber-200/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-100/90">
                        24/7 archive
                      </span>
                    )}
                  </div>
                  <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-200/75">The action never leaves the screen</p>
                  <h2 className="mt-2 max-w-xl font-display text-[22px] font-bold leading-tight tracking-tight text-white sm:text-4xl">
                    {featured.name}
                  </h2>
                  <p className="mt-2 max-w-md text-[11px] leading-5 text-white/60 sm:text-sm">
                    {featured.id === "wwe-superstar-central"
                      ? "A dedicated home for wrestling fans, available around the clock."
                      : [featured.country || "International", featured.quality || "Sports channel"].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => chooseChannel(featured)} className="press inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-[#17101f] shadow-[0_8px_28px_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5 hover:bg-violet-50 sm:h-11 sm:px-5 sm:text-sm">
                      <Play className="size-4 fill-current" />
                      Watch channel
                    </button>
                    <span className="text-[10px] font-medium tracking-wide text-white/45"> {featured.quality || "Sports entertainment"} </span>
                  </div>
                </div>
                <div className="relative mx-auto grid aspect-square w-full max-w-[210px] place-items-center overflow-hidden rounded-[24px] border border-white/15 bg-white/[0.045] shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
                  <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(167,139,250,0.26),transparent_62%)]" />
                  {featured.logo ? (
                    <img src={featured.logo} alt={featured.name} loading="lazy" className="relative z-10 max-h-full max-w-full object-contain p-3" />
                  ) : featured.id === "wwe-superstar-central" ? (
                    <div aria-label="WWE" className="relative z-10 -rotate-6 select-none font-sans text-[48px] font-black italic leading-none tracking-[-0.12em] text-white drop-shadow-[0_8px_24px_rgba(255,255,255,0.18)] sm:text-[82px]">
                      WWE
                    </div>
                  ) : (
                    <div className="relative z-10 flex flex-col items-center gap-3 text-white/80">
                      <Tv className="size-10 sm:size-14" />
                      <span className="max-w-[130px] text-center text-[10px] font-bold uppercase tracking-[0.16em]">{featured.name}</span>
                    </div>
                  )}
                  <div aria-hidden="true" className="absolute inset-x-5 bottom-3 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
                  <div aria-hidden="true" className="absolute -right-8 -top-8 size-24 rounded-full border border-white/10" />
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
                <NativeVideoPlayer key={selected.id} streamUrl={selected.streamUrl} nativeStreamUrl={selected.id === "wwe-superstar-central" ? `/api/tv/stream?provider=iptv-org&channel=${encodeURIComponent(selected.id)}` : `/api/tv/stream?provider=${selected.provider || "nexus"}&channel=${encodeURIComponent(selected.id)}`} externalPoster={selected.logo} title={selected.name} liveTv className="aspect-video w-full rounded-none" />
              </div>
              <ChannelGuide channelId={selected.id} />
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
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setFilter("All Sports"); setSearch("ESPN"); }} className={cn("press h-8 rounded-full border px-3 text-[11px] font-semibold", search.toLowerCase() === "espn" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground")}>ESPN</button>
              <button type="button" onClick={() => { setFilter("All Sports"); setSearch("SuperSport"); }} className={cn("press h-8 rounded-full border px-3 text-[11px] font-semibold", search.toLowerCase() === "supersport" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground")}>SuperSport</button>
            </div>

            {channelsQuery.isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="overflow-hidden rounded-2xl border border-border bg-card"><div className="aspect-video animate-pulse bg-secondary" /><div className="space-y-2 p-3"><div className="h-3 w-3/4 animate-pulse rounded bg-secondary" /><div className="h-2.5 w-1/2 animate-pulse rounded bg-secondary" /></div></div>)}</div>
            ) : channelsQuery.isError ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-center"><Radio className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-semibold">Sports channels couldn't load</p><p className="mt-1 text-xs text-muted-foreground">{channelsQuery.error instanceof Error ? channelsQuery.error.message : "Please try again."}</p><button type="button" onClick={() => void channelsQuery.refetch()} className="press mt-4 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Try again</button></div>
            ) : channels.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {channels.map((channel) => {
                  const active = selectedId === channel.id;
                  const isWwe = channel.id === "wwe-superstar-central";
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => chooseChannel(channel)}
                      aria-pressed={active}
                      className={cn(
                        "group relative overflow-hidden rounded-[22px] border bg-[#130f1a] text-left shadow-[0_10px_28px_rgba(9,5,16,0.16)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(9,5,16,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        active ? "border-primary/70 ring-2 ring-primary/25" : "border-white/[0.08] hover:border-violet-300/35"
                      )}
                    >
                      <div className="relative aspect-[16/11] overflow-hidden bg-[radial-gradient(ellipse_at_70%_30%,rgba(139,92,246,0.22),transparent_45%),linear-gradient(145deg,#21182c_0%,#100d17_78%)]">
                        <div aria-hidden="true" className="absolute inset-0 opacity-50 [background-image:linear-gradient(135deg,transparent_42%,rgba(255,255,255,0.07)_43%,transparent_44%),radial-gradient(circle_at_18%_82%,rgba(220,70,110,0.13),transparent_38%)]" />
                        {channel.logo ? (
                          <img src={channel.logo} alt="" loading="lazy" className="relative z-10 size-full object-contain p-5 transition-transform duration-500 group-hover:scale-105" />
                        ) : isWwe ? (
                          <div className="relative z-10 grid size-full place-items-center">
                            <span className="select-none -rotate-6 font-sans text-[42px] font-black italic leading-none tracking-[-0.13em] text-white drop-shadow-[0_8px_22px_rgba(255,255,255,0.15)] transition-transform duration-500 group-hover:scale-110 sm:text-5xl">WWE</span>
                          </div>
                        ) : (
                          <div className="relative z-10 flex size-full flex-col items-center justify-center gap-2 text-white/75">
                            <Tv className="size-8" />
                            <span className="max-w-[80%] text-center text-[10px] font-semibold tracking-wide">{channel.name}</span>
                          </div>
                        )}
                        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#130f1a] via-[#130f1a]/40 to-transparent" />
                        <div className="absolute left-3 top-3 inline-flex items-center rounded-full border border-white/15 bg-[#100d17]/75 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.16em] text-white/85 backdrop-blur-md">
                          {isWwe ? "24/7 archive" : channel.categories?.[0] || "Sports"}
                        </div>
                        <span className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-full border border-white/15 bg-white text-[#17101f] shadow-lg transition duration-300 group-hover:scale-110 group-hover:rotate-[-6deg]">
                          <Play className="size-3.5 fill-current" />
                        </span>
                      </div>
                      <div className="space-y-3 p-3.5">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold tracking-tight text-white sm:text-sm">{channel.name}</p>
                          <p className="mt-1 truncate text-[10px] text-white/45 sm:text-[11px]">
                            {[channel.country || "International", channel.quality || "Sports channel"].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="flex items-center justify-between border-t border-white/[0.08] pt-2.5">
                          <span className="text-[10px] font-semibold text-violet-200/90">{active ? "Playing above" : "Watch channel"}</span>
                          <span className="grid size-6 place-items-center rounded-full bg-white/[0.07] text-white/70 transition group-hover:bg-violet-300 group-hover:text-[#17101f]">
                            <ChevronRight className="size-3.5" />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card/60 px-5 py-10 text-center"><Radio className="mx-auto size-8 text-muted-foreground/60" /><p className="mt-3 text-sm font-semibold">No matching sports channels</p><p className="mt-1 text-xs text-muted-foreground">Try another sport or clear your search.</p><button type="button" onClick={() => { setFilter("All Sports"); setSearch(""); }} className="press mt-4 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold hover:bg-secondary">Show all sports channels</button></div>
            )}
          </section>
      </div>
    </AppShell>
  );
}
