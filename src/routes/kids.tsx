import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Baby, Heart, Play, RefreshCw, Search, Sparkles, Tv, Film, X, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { NativeVideoPlayer } from "@/components/xora/VideoPlayer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Channel = { id: string; name: string; logo?: string; country?: string; categories: string[]; streamUrl: string; quality?: string | null; labels: string[] };
type CartoonSeries = { id: string; title: string; year: number; description: string; ageLabel: string; artClass: string; provider: "tmdb" | "anilist"; posterUrl?: string; format?: string; episodes?: number | null; genres?: string[] };
type AniListMedia = { id: number; title: { english?: string | null; romaji: string }; description?: string | null; coverImage?: { large?: string | null; medium?: string | null } | null; seasonYear?: number | null; format?: string | null; episodes?: number | null; genres?: string[] };
type AniListResponse = { data?: { Page?: { pageInfo?: { currentPage: number; hasNextPage: boolean }; media?: AniListMedia[] } }; errors?: Array<{ message?: string }> };

const KIDS_CARTOONS: CartoonSeries[] = [
  { id: "82728", title: "Bluey", year: 2018, description: "Everyday family adventures and imaginative play.", ageLabel: "Preschool", artClass: "from-sky-200 via-cyan-100 to-emerald-100", provider: "tmdb" },
  { id: "82456", title: "Hilda", year: 2018, description: "A curious girl explores a magical world.", ageLabel: "Family", artClass: "from-indigo-200 via-violet-100 to-sky-100", provider: "tmdb" },
  { id: "88893", title: "Amphibia", year: 2019, description: "A girl discovers a lively world of talking frogs.", ageLabel: "Family", artClass: "from-lime-200 via-green-100 to-yellow-100", provider: "tmdb" },
  { id: "92685", title: "The Owl House", year: 2020, description: "A teenager finds friendship and magic in another world.", ageLabel: "Older kids", artClass: "from-purple-200 via-fuchsia-100 to-amber-100", provider: "tmdb" },
  { id: "81046", title: "The Dragon Prince", year: 2018, description: "A fantasy adventure about friendship and peace.", ageLabel: "Older kids", artClass: "from-teal-200 via-cyan-100 to-blue-100", provider: "tmdb" },
];

const ANILIST_QUERY = `query ($page: Int, $sort: [MediaSort], $search: String) {
  Page(page: $page, perPage: 24) {
    pageInfo { currentPage hasNextPage }
    media(type: ANIME, sort: $sort, search: $search, isAdult: false, format_in: [TV, TV_SHORT, OVA, ONA, MOVIE, SPECIAL]) {
      id title { english romaji } description(asHtml: false) coverImage { large medium }
      seasonYear format episodes genres
    }
  }
}`;

async function loadAnimatedCatalog(search: string, sort: string, page: number): Promise<{ items: CartoonSeries[]; page: number; hasNextPage: boolean }> {
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: ANILIST_QUERY, variables: { page, sort: [sort], search: search.trim() || null } }),
  });
  if (!response.ok) throw new Error("The animation catalogue is temporarily unavailable.");
  const payload = (await response.json()) as AniListResponse;
  if (payload.errors?.length) throw new Error(payload.errors[0]?.message || "Unable to load animation titles.");
  const pageData = payload.data?.Page;
  const items = (pageData?.media || []).map((media): CartoonSeries => ({
    id: String(media.id),
    title: media.title.english || media.title.romaji,
    year: media.seasonYear || 0,
    description: (media.description || "Animated series or movie.").replace(/<[^>]*>/g, "").replace(/&#039;/g, "'").replace(/&quot;/g, '"').slice(0, 240),
    ageLabel: "Animation",
    artClass: "from-violet-200 via-sky-100 to-emerald-100",
    provider: "anilist",
    posterUrl: media.coverImage?.large || media.coverImage?.medium || undefined,
    format: media.format || undefined,
    episodes: media.episodes,
    genres: media.genres || [],
  }));
  return { items, page: pageData?.pageInfo?.currentPage || page, hasNextPage: Boolean(pageData?.pageInfo?.hasNextPage) };
}

export const Route = createFileRoute("/kids")({
  validateSearch: (search: Record<string, unknown>) => ({ channel: typeof search.channel === "string" ? search.channel : undefined }),
  head: () => ({ meta: [
    { title: "Xora Kids — Cartoons & Kids TV" },
    { name: "description", content: "A dedicated XoraTV space for kids entertainment, cartoons and kids TV." },
  ]}),
  component: KidsPage,
});

async function loadKidsChannels(query: string): Promise<Channel[]> {
  const params = new URLSearchParams({ category: "kids", limit: "100" });
  if (query.trim()) params.set("q", query.trim());
  const res = await fetch("/api/tv/channels?" + params.toString());
  if (!res.ok) throw new Error("Unable to load kids channels");
  const data = (await res.json()) as { channels?: Channel[] };
  return Array.isArray(data.channels) ? data.channels : [];
}

function KidsPage() {
  const { channel: requestedChannel } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [cartoonSearch, setCartoonSearch] = useState("");
  const [submittedCartoonSearch, setSubmittedCartoonSearch] = useState("");
  const [catalogSort, setCatalogSort] = useState("TRENDING_DESC");
  const [catalogPage, setCatalogPage] = useState(1);
  const [selectedCartoon, setSelectedCartoon] = useState<CartoonSeries | null>(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [draftSeason, setDraftSeason] = useState(1);
  const [draftEpisode, setDraftEpisode] = useState(1);
  const query = useQuery({
    queryKey: ["iptv-org-kids-page", search],
    queryFn: () => loadKidsChannels(search),
    staleTime: 60_000, refetchInterval: 5 * 60_000, refetchOnWindowFocus: true, retry: 3,
  });
  const selected = useMemo(() => query.data?.find((item) => item.id === requestedChannel) || query.data?.[0] || null, [query.data, requestedChannel]);
  const catalogQuery = useQuery({
    queryKey: ["kids-animation-catalog", submittedCartoonSearch, catalogSort, catalogPage],
    queryFn: () => loadAnimatedCatalog(submittedCartoonSearch, catalogSort, catalogPage),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const filteredCartoons = useMemo(() => {
    const byTitle = new Map<string, CartoonSeries>();
    [...KIDS_CARTOONS, ...(catalogQuery.data?.items || [])].forEach((item) => byTitle.set(item.title.toLowerCase(), item));
    return [...byTitle.values()];
  }, [catalogQuery.data]);
  const cartoonPlayerUrl = selectedCartoon
    ? selectedCartoon.provider === "anilist"
      ? `https://embed.vidrift.net/embed/anilist/${selectedCartoon.id}/${episode}?brand=XoraTV&brandColor=%237C5CFC&showTitle=1&exit=1&autoplay=0`
      : `https://embed.vidrift.net/embed/tv/${selectedCartoon.id}/${season}/${episode}?brand=XoraTV&brandColor=%237C5CFC&showTitle=1&exit=1&autoplay=0`
    : "";

  return (
    <AppShell wide>
      <div className="space-y-6 pb-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-primary/15 bg-gradient-to-br from-[#fff8ed] via-[#f6efff] to-[#eaf8f1] px-5 py-7 shadow-sm sm:px-7 sm:py-9">
          <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-5rem] left-[38%] size-56 rounded-full bg-pink-200/25 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary backdrop-blur"><Sparkles className="size-3" /> Xora Kids</span>
              <span className="rounded-full bg-white/65 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground backdrop-blur">Cartoons & live entertainment</span>
            </div>
            <div className="mt-5 max-w-2xl">
              <h1 className="font-display text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">A little corner for <span className="text-primary">big imaginations.</span></h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">Explore animated adventures, family favourites and kids TV in a calmer XoraTV experience designed especially for younger viewers.</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#fff0d7] px-3 py-1.5 text-[11px] font-semibold">Cartoons</span>
              <span className="rounded-full bg-[#eee5ff] px-3 py-1.5 text-[11px] font-semibold">Animation</span>
              <span className="rounded-full bg-[#e4f6ed] px-3 py-1.5 text-[11px] font-semibold">Kids TV</span>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-[1.75rem] border border-primary/15 bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><Film className="size-4 text-primary" /><h2 className="font-display text-xl font-semibold">Animated library</h2></div>
              <p className="mt-1 text-xs text-muted-foreground">A live, searchable animation catalogue. VidRift handles playback; unavailable titles may not play.</p>
            </div>
            <form className="flex w-full gap-2 sm:max-w-md" onSubmit={(event) => { event.preventDefault(); setCatalogPage(1); setSubmittedCartoonSearch(cartoonSearch.trim()); }}>
              <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={cartoonSearch} onChange={(event) => setCartoonSearch(event.target.value)} placeholder="Search animated titles..." className="h-10 rounded-xl border-border/70 bg-background/70 pl-9" /></div>
              <Button type="submit" className="h-10 rounded-xl"><Search className="mr-2 size-4" /> Search</Button>
            </form>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {[{ value: "TRENDING_DESC", label: "Trending" }, { value: "POPULARITY_DESC", label: "Popular" }, { value: "START_DATE_DESC", label: "Newest" }].map((option) => (
                <Button key={option.value} type="button" size="sm" variant={catalogSort === option.value ? "default" : "outline"} className="rounded-full" onClick={() => { setCatalogSort(option.value); setCatalogPage(1); }}>{option.label}</Button>
              ))}
              {submittedCartoonSearch && <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => { setCartoonSearch(""); setSubmittedCartoonSearch(""); setCatalogPage(1); }}>Clear search</Button>}
            </div>
            <span className="text-xs text-muted-foreground">{catalogQuery.isFetching ? "Updating library…" : `Page ${catalogPage} · 24 titles per page`}</span>
          </div>

          {selectedCartoon && (
            <div className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-black shadow-lg">
              <div className="flex items-center justify-between gap-3 bg-card px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-semibold">{selectedCartoon.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedCartoon.year || "Animated title"} · {selectedCartoon.format || "Series"}{selectedCartoon.episodes ? ` · ${selectedCartoon.episodes} episodes listed` : ""}</p>
                </div>
                <Button variant="ghost" size="icon" className="size-9 shrink-0 rounded-full" onClick={() => setSelectedCartoon(null)} aria-label="Close cartoon player"><X className="size-4" /></Button>
              </div>
              <div className="relative aspect-video w-full bg-black">
                <iframe
                  key={cartoonPlayerUrl}
                  src={cartoonPlayerUrl}
                  title={`XoraTV Kids — ${selectedCartoon.title}`}
                  className="absolute inset-0 h-full w-full border-0"
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 bg-card px-4 py-3">
                {selectedCartoon.provider === "tmdb" && <label className="flex items-center gap-2 text-xs text-muted-foreground">Season
                  <input type="number" min={1} max={30} value={draftSeason} onChange={(event) => setDraftSeason(Math.min(30, Math.max(1, Number(event.target.value) || 1)))} className="h-9 w-16 rounded-lg border border-border bg-background px-2 text-sm text-foreground" />
                </label>}
                <label className="flex items-center gap-2 text-xs text-muted-foreground">Episode
                  <input type="number" min={1} max={500} value={draftEpisode} onChange={(event) => setDraftEpisode(Math.min(500, Math.max(1, Number(event.target.value) || 1)))} className="h-9 w-16 rounded-lg border border-border bg-background px-2 text-sm text-foreground" />
                </label>
                <Button variant="outline" className="h-9 rounded-lg" onClick={() => { setSeason(draftSeason); setEpisode(draftEpisode); }}><Play className="mr-2 size-3.5 fill-current" /> Load episode</Button>
              </div>
              <p className="bg-card px-4 pb-4 text-[11px] leading-5 text-muted-foreground">Playback depends on the external source being available. If an episode does not load, try another episode or cartoon.</p>
            </div>
          )}

          {catalogQuery.isLoading ? (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-10 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> Loading animated library…</div>
          ) : catalogQuery.isError ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <p className="text-sm font-semibold">The animated library could not load.</p>
              <p className="mt-2 text-xs text-muted-foreground">Check your connection and try again. The Live TV player is separate and remains unchanged.</p>
              <Button type="button" variant="outline" className="mt-4 rounded-xl" onClick={() => void catalogQuery.refetch()}><RefreshCw className="mr-2 size-4" /> Retry</Button>
            </div>
          ) : filteredCartoons.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {filteredCartoons.map((cartoon) => (
                <button key={`${cartoon.provider}-${cartoon.id}`} type="button" onClick={() => { setSelectedCartoon(cartoon); setSeason(1); setEpisode(1); setDraftSeason(1); setDraftEpisode(1); }} className={`group overflow-hidden rounded-2xl border text-left transition hover:-translate-y-0.5 hover:shadow-md ${selectedCartoon?.id === cartoon.id ? "border-primary ring-2 ring-primary/15" : "border-border/70"}`}>
                  <div className={`relative aspect-[3/4] overflow-hidden bg-gradient-to-br ${cartoon.artClass}`}>
                    {cartoon.posterUrl ? <img src={cartoon.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <div className="grid h-full place-items-center p-4"><span className="grid size-14 place-items-center rounded-2xl border border-white/70 bg-white/65 text-primary shadow-sm backdrop-blur"><Baby className="size-7" /></span></div>}
                    <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-md transition group-hover:opacity-100 group-focus-visible:opacity-100"><Play className="size-3.5 fill-current" /></span>
                  </div>
                  <div className="p-3">
                    <p className="truncate font-display text-sm font-semibold">{cartoon.title}</p>
                    <p className="mt-1 text-[10px] font-medium text-primary">{cartoon.year || "Year unknown"} · {cartoon.format || cartoon.ageLabel}</p>
                    <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{cartoon.description || "Animated adventure."}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No animated titles found. Try another search or sort.</div>}
          {!catalogQuery.isError && (
            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
              <Button type="button" variant="outline" className="rounded-xl" disabled={catalogPage <= 1 || catalogQuery.isFetching} onClick={() => setCatalogPage((page) => Math.max(1, page - 1))}><ChevronLeft className="mr-1 size-4" /> Previous</Button>
              <span className="text-xs text-muted-foreground">Page {catalogPage}</span>
              <Button type="button" variant="outline" className="rounded-xl" disabled={!catalogQuery.data?.hasNextPage || catalogQuery.isFetching} onClick={() => setCatalogPage((page) => page + 1)}>Next <ChevronRight className="ml-1 size-4" /></Button>
            </div>
          )}
          <p className="text-[11px] leading-5 text-muted-foreground">The catalogue uses public animation metadata; VidRift handles playback. Availability depends on the external player. AniList titles use episode numbers; the original TV-series entries use season and episode numbers.</p>
        </section>

        <section className="rounded-[1.75rem] border border-border/70 bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="flex items-center gap-2"><Tv className="size-4 text-primary" /><h2 className="font-display text-xl font-semibold">Kids channels</h2></div><p className="mt-1 text-xs text-muted-foreground">Playable channels from IPTV-org's Kids catalogue.</p></div>
            <div className="flex w-full gap-2 sm:max-w-md">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a kids channel..." className="h-10 rounded-xl border-border/70 bg-background/70 pl-9" /></div>
              <Button variant="outline" className="h-10 rounded-xl" onClick={() => void query.refetch()} aria-label="Refresh kids channels"><RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} /></Button>
            </div>
          </div>

          {selected ? (
            <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-border/60 bg-black shadow-lg">
              <NativeVideoPlayer streamUrl={`/api/tv/stream/${encodeURIComponent(selected.id)}/index.m3u8?channel=${encodeURIComponent(selected.id)}`} externalPoster={selected.logo} title={selected.name} autoPlay className="aspect-video w-full" />
              <div className="flex items-center justify-between gap-3 bg-card px-4 py-3">
                <div className="min-w-0"><h3 className="truncate font-display text-sm font-semibold">{selected.name}</h3><p className="mt-1 text-xs text-muted-foreground">{selected.country || "International"} · {selected.quality || "Live"}</p></div>
                <span className="hidden shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary sm:inline-flex"><Heart className="size-3" /> Kids</span>
              </div>
            </div>
          ) : <div className="mt-5 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{query.isLoading ? "Finding playable kids channels..." : "No playable kids channels found."}</div>}
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Choose a channel</p><h2 className="font-display text-xl font-semibold tracking-tight">More to explore</h2></div><span className="hidden text-xs text-muted-foreground sm:block">{query.data?.length || 0} playable channels</span></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(query.data || []).map((channel) => (
              <button key={channel.id} type="button" onClick={() => { window.history.replaceState({}, "", `/kids?channel=${encodeURIComponent(channel.id)}`); window.dispatchEvent(new PopStateEvent("popstate")); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`group overflow-hidden rounded-2xl border bg-surface text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-md ${selected?.id === channel.id ? "border-primary ring-2 ring-primary/10" : "border-border/60"}`}>
                <div className="relative aspect-video bg-muted/40 p-4">
                  {channel.logo ? <img src={channel.logo} alt="" loading="lazy" className="h-full w-full object-contain transition group-hover:scale-105" /> : <div className="grid h-full place-items-center px-2 text-center text-xs font-semibold">{channel.name}</div>}
                  <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-md transition group-hover:opacity-100"><Play className="size-3.5 fill-current" /></span>
                </div>
                <div className="p-3"><p className="truncate font-display text-xs font-semibold">{channel.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{channel.country || "International"} · {channel.quality || "Live"}</p></div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
