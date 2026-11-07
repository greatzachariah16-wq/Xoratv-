import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Play, RefreshCw, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { NativeVideoPlayer } from "@/components/xora/VideoPlayer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CategoryChips, ChannelCard, SectionHeader, getChannelCountryCode, getChannelLanguage, getCountryFlag, getCountryName, getChannelDisplayName } from "@/components/xora/XSportsComponents";
import { type AgeFilter, ChannelGridSkeleton, getChannelAgeLabel, KidsEmptyState, KidsHeader, SegmentedControl, ShowCard, ShowGridSkeleton, sortKidsChannels } from "@/components/xora/KidsComponents";

type Channel = { id: string; name: string; logo?: string; country?: string; categories: string[]; streamUrl: string; quality?: string | null; labels: string[]; language?: string; languages?: string[]; ageLabel?: string };
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
  const params = new URLSearchParams({ category: "kids", limit: "10000" });
  if (query.trim()) params.set("q", query.trim());
  const res = await fetch("/api/tv/channels?" + params.toString());
  if (!res.ok) throw new Error("Unable to load kids channels");
  const data = (await res.json()) as { channels?: Channel[] };
  return Array.isArray(data.channels) ? data.channels : [];
}

function KidsPage() {
  const navigate = useNavigate();
  const { channel: requestedChannel } = Route.useSearch();
  const [activeSection, setActiveSection] = useState<"cartoons" | "live">("cartoons");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("All");
  const [favoriteChannels, setFavoriteChannels] = useState<string[]>([]);
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
  const catalogQuery = useQuery({
    queryKey: ["kids-animation-catalog", submittedCartoonSearch, catalogSort, catalogPage],
    queryFn: () => loadAnimatedCatalog(submittedCartoonSearch, catalogSort, catalogPage),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const filteredCartoons = useMemo(() => {
    const staticItems = submittedCartoonSearch
      ? KIDS_CARTOONS.filter((item) => item.title.toLowerCase().includes(submittedCartoonSearch.toLowerCase()))
      : KIDS_CARTOONS;
    const byTitle = new Map<string, CartoonSeries>();
    [...staticItems, ...(catalogQuery.data?.items || [])].forEach((item) => byTitle.set(item.title.toLowerCase(), item));
    return [...byTitle.values()];
  }, [catalogQuery.data, submittedCartoonSearch]);
  const filteredShows = useMemo(
    () => filteredCartoons.filter((cartoon) => ageFilter === "All" || cartoon.ageLabel.toLowerCase() === ageFilter.toLowerCase()),
    [filteredCartoons, ageFilter],
  );
  const channelsByAge = useMemo(() => {
    const current = (query.data || []).filter((channel) => ageFilter === "All" || getChannelAgeLabel(channel) === ageFilter);
    return sortKidsChannels(current, getChannelCountryCode, getChannelLanguage);
  }, [query.data, ageFilter]);
  const visibleSelected = channelsByAge.find((channel) => channel.id === requestedChannel) || channelsByAge[0] || null;
  const toggleChannelFavorite = (channel: Channel) => setFavoriteChannels((current) =>
    current.includes(channel.id) ? current.filter((id) => id !== channel.id) : [...current, channel.id],
  );
  const cartoonPlayerUrl = selectedCartoon
    ? selectedCartoon.provider === "anilist"
      ? `https://embed.vidrift.net/embed/anilist/${selectedCartoon.id}/${episode}?brand=XoraTV&brandColor=%237C5CFC&showTitle=1&exit=1&autoplay=0`
      : `https://embed.vidrift.net/embed/tv/${selectedCartoon.id}/${season}/${episode}?brand=XoraTV&brandColor=%237C5CFC&showTitle=1&exit=1&autoplay=0`
    : "";

  return (
    <AppShell wide>
      <div className="min-h-full space-y-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-1">
        <KidsHeader />

        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-40 -mx-4 space-y-2 border-b border-border/70 bg-background/90 px-4 pb-2 pt-1 backdrop-blur-xl">
          <SegmentedControl value={activeSection} onChange={setActiveSection} />
          <CategoryChips
            options={[
              { label: "All", value: "All" },
              { label: "Preschool", value: "Preschool" },
              { label: "Family", value: "Family" },
              { label: "Older kids", value: "Older kids" },
            ]}
            value={ageFilter}
            onChange={(value) => setAgeFilter(value as AgeFilter)}
            ariaLabel="Filter by age group"
          />
        </div>

        <main key={activeSection + "-" + ageFilter} className="kids-panel-enter space-y-5">
          {activeSection === "cartoons" ? (
            <section className="space-y-4" aria-label="Kids shows">
              <div className="flex flex-col gap-3">
                <SectionHeader title="Shows" subtitle="Stories and animated worlds to explore" />
                <form className="flex w-full gap-2" onSubmit={(event) => { event.preventDefault(); setCatalogPage(1); setSubmittedCartoonSearch(cartoonSearch.trim()); }}>
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#6B5F57]" />
                    <Input value={cartoonSearch} onChange={(event) => setCartoonSearch(event.target.value)} placeholder="Search animated titles..." aria-label="Search shows"
                      className="h-11 rounded-full border-border/80 bg-card pl-11 pr-4 text-sm shadow-[0_5px_18px_rgba(66,43,29,0.045)] placeholder:text-[#81736a] focus-visible:ring-primary/20" />
                  </div>
                  <Button type="submit" className="h-11 min-w-11 rounded-full px-4 active:scale-[0.97]"><Search className="size-4" /><span className="sr-only">Search</span></Button>
                </form>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {[{ value: "TRENDING_DESC", label: "Trending" }, { value: "POPULARITY_DESC", label: "Popular" }, { value: "START_DATE_DESC", label: "Newest" }].map((option) => (
                      <Button key={option.value} type="button" size="sm" variant={catalogSort === option.value ? "default" : "outline"}
                        className="min-h-10 rounded-full px-3 text-[11px] active:scale-[0.97]"
                        onClick={() => { setCatalogSort(option.value); setCatalogPage(1); }}>{option.label}</Button>
                    ))}
                    {submittedCartoonSearch ? <Button type="button" size="sm" variant="ghost" className="min-h-10 rounded-full px-3 text-[11px]"
                      onClick={() => { setCartoonSearch(""); setSubmittedCartoonSearch(""); setCatalogPage(1); }}>Clear</Button> : null}
                  </div>
                  <span className="shrink-0 text-[10px] font-medium text-[#6B5F57] dark:text-[#bcb0a6]">{catalogQuery.isFetching ? "Updating…" : "Page " + catalogPage}</span>
                </div>
              </div>

              {selectedCartoon ? (
                <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card shadow-[0_14px_32px_-24px_rgba(54,38,28,0.5)]" aria-label="Selected show details">
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-semibold text-foreground">{selectedCartoon.title}</p>
                      <p className="mt-1 text-xs text-[#6B5F57] dark:text-muted-foreground">{selectedCartoon.year || "Animated title"} · {selectedCartoon.ageLabel}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="size-11 shrink-0 rounded-full" onClick={() => setSelectedCartoon(null)} aria-label="Close cartoon player"><X className="size-4" /></Button>
                  </div>
                  <div className="relative aspect-video w-full overflow-hidden rounded-b-[20px] bg-black">
                    <iframe key={cartoonPlayerUrl} src={cartoonPlayerUrl} title={"XoraTV Kids — " + selectedCartoon.title}
                      className="absolute inset-0 h-full w-full border-0" allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                      allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    {selectedCartoon.provider === "tmdb" ? <label className="flex min-h-11 items-center gap-2 text-xs text-[#6B5F57] dark:text-muted-foreground">Season
                      <input type="number" min={1} max={30} value={draftSeason} onChange={(event) => setDraftSeason(Math.min(30, Math.max(1, Number(event.target.value) || 1)))}
                        className="h-9 w-16 rounded-lg border border-border bg-background px-2 text-sm text-foreground" />
                    </label> : null}
                    <label className="flex min-h-11 items-center gap-2 text-xs text-[#6B5F57] dark:text-muted-foreground">Episode
                      <input type="number" min={1} max={500} value={draftEpisode} onChange={(event) => setDraftEpisode(Math.min(500, Math.max(1, Number(event.target.value) || 1)))}
                        className="h-9 w-16 rounded-lg border border-border bg-background px-2 text-sm text-foreground" />
                    </label>
                    <Button variant="outline" className="h-11 rounded-full" onClick={() => { setSeason(draftSeason); setEpisode(draftEpisode); }}><Play className="mr-2 size-3.5 fill-current" /> Load episode</Button>
                  </div>
                  <p className="px-4 pb-4 text-[11px] leading-5 text-[#6B5F57] dark:text-muted-foreground">{selectedCartoon.description || "An animated adventure."}</p>
                </section>
              ) : null}

              {catalogQuery.isLoading ? <ShowGridSkeleton /> : catalogQuery.isError ? (
                <div className="rounded-[22px] border border-dashed border-border p-8 text-center">
                  <p className="text-sm font-semibold text-foreground">The animated library could not load.</p>
                  <p className="mt-2 text-xs text-[#6B5F57] dark:text-muted-foreground">Check your connection and try again.</p>
                  <Button type="button" variant="outline" className="mt-4 min-h-11 rounded-full" onClick={() => void catalogQuery.refetch()}><RefreshCw className="mr-2 size-4" /> Retry</Button>
                </div>
              ) : filteredShows.length ? (
                <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
                  {filteredShows.map((cartoon, index) => (
                    <ShowCard key={cartoon.provider + "-" + cartoon.id} cartoon={cartoon} index={index}
                      onSelect={(item) => { void navigate({ to: "/kids/watch", search: { id: item.id, provider: item.provider, title: item.title, year: String(item.year || 0), description: item.description || "", ageLabel: item.ageLabel, format: item.format || "", episodes: String(item.episodes || 0), posterUrl: item.posterUrl || "" } as never }); }} />
                  ))}
                </div>
              ) : <KidsEmptyState message="No shows found for this age group." />}

              {!catalogQuery.isError ? (
                <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <Button type="button" variant="outline" className="min-h-11 rounded-full" disabled={catalogPage <= 1 || catalogQuery.isFetching}
                    onClick={() => setCatalogPage((page) => Math.max(1, page - 1))}><ChevronLeft className="mr-1 size-4" /> Previous</Button>
                  <span className="text-xs text-[#6B5F57] dark:text-muted-foreground">Page {catalogPage}</span>
                  <Button type="button" variant="outline" className="min-h-11 rounded-full" disabled={!catalogQuery.data?.hasNextPage || catalogQuery.isFetching}
                    onClick={() => setCatalogPage((page) => page + 1)}>Next <ChevronRight className="ml-1 size-4" /></Button>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="space-y-4" aria-label="Live kids channels">
              <div className="flex flex-col gap-3">
                <div className="flex items-end justify-between gap-3">
                  <SectionHeader title="Live Kids Channels" subtitle="Kids TV from around the world" />
                  <button type="button" onClick={() => void query.refetch()} aria-label="Refresh kids channels" disabled={query.isFetching}
                    className="press grid size-11 shrink-0 place-items-center rounded-full border border-border bg-card text-[#6B5F57] shadow-sm transition active:scale-[0.97] disabled:opacity-60">
                    <RefreshCw className={"size-4 " + (query.isFetching ? "animate-spin motion-reduce:animate-none" : "")} />
                  </button>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-[#6B5F57]" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a kids channel..." aria-label="Search kids channels"
                    className="h-11 rounded-full border-border/80 bg-card pl-11 pr-12 text-sm shadow-[0_5px_18px_rgba(66,43,29,0.045)] placeholder:text-[#81736a] focus-visible:ring-primary/20" />
                  {search ? <button type="button" onClick={() => setSearch("")} aria-label="Clear channel search"
                    className="press absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-[#6B5F57] hover:bg-secondary"><X className="size-4" /></button> : null}
                </div>
              </div>

              {query.isLoading ? (
                <>
                  <div className="shimmer aspect-video w-full rounded-[20px]" />
                  <ChannelGridSkeleton />
                </>
              ) : query.isError ? (
                <KidsEmptyState message="Kids channels could not load. Please try again." />
              ) : visibleSelected ? (
                <section className="space-y-3" aria-label="Now playing">
                  <SectionHeader title="Now playing" subtitle={getChannelDisplayName(visibleSelected)} />
                  <div className="overflow-hidden rounded-[20px] border border-border/70 bg-card shadow-[0_14px_32px_-24px_rgba(54,38,28,0.55)]">
                    <div className="relative overflow-hidden rounded-[20px] bg-[#1d1916]">
                      <NativeVideoPlayer streamUrl={"/api/tv/stream?provider=nexus&channel=" + encodeURIComponent(visibleSelected.id)}
                        externalPoster={visibleSelected.logo} title={visibleSelected.name} autoPlay liveTv
                        className="aspect-video w-full rounded-[20px]" />
                    </div>
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-primary">NOW PLAYING</p>
                        <p className="mt-1 truncate font-display text-sm font-semibold text-foreground">{getChannelDisplayName(visibleSelected)}</p>
                        <p className="mt-1 text-[11px] text-[#6B5F57] dark:text-muted-foreground">{getCountryFlag(visibleSelected.country)} {getCountryName(visibleSelected.country)}{getChannelLanguage(visibleSelected) ? " · " + getChannelLanguage(visibleSelected) : ""}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#a9342c] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white"><span className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" /> Live</span>
                    </div>
                  </div>
                </section>
              ) : null}

              {channelsByAge.filter((channel) => channel.id !== visibleSelected?.id).length ? (
                <section className="space-y-3" aria-label="More kids channels">
                  <SectionHeader title="More to explore" subtitle={channelsByAge.filter((channel) => channel.id !== visibleSelected?.id).length + " more channels"} />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {channelsByAge.filter((channel) => channel.id !== visibleSelected?.id).map((channel, index) => (
                      <ChannelCard key={channel.id} channel={channel} active={false} index={index}
                        onSelect={(item) => { window.history.replaceState({}, "", "/kids?channel=" + encodeURIComponent(item.id)); window.dispatchEvent(new PopStateEvent("popstate")); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                        favorite={favoriteChannels.includes(channel.id)} onFavorite={toggleChannelFavorite}
                        statusMode="live" metaMode="language" />
                    ))}
                  </div>
                </section>
              ) : !query.isLoading && !query.isError && !visibleSelected ? <KidsEmptyState message="No kids channels match this age group." /> : null}
            </section>
          )}
        </main>
      </div>
    </AppShell>
  );
}
