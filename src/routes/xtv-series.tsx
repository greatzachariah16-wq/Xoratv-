import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Film, Play, Search, X } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import type { XTvSeriesItem } from "@/integrations/firebase/rtdb";
import { XoraInHouseAd } from "@/components/ads/XoraInHouseAd";
import { cn } from "@/lib/utils";
import { XSeriesChannelShelf } from "@/components/xora/XSeriesChannelShelf";
import "./xseries-premium.css";

export const Route = createFileRoute("/xtv-series")({
  head: () => ({
    meta: [
      { title: "X-Series — Movies | Xora" },
      { name: "description", content: "A curated collection of popular live-action movies." },
    ],
  }),
  component: XTvSeriesPage,
});

const CATEGORY_ORDER = ["Action", "Drama", "Comedy", "Thriller", "Crime", "Adventure", "Romance", "Horror", "Sci-Fi", "Fantasy", "Mystery", "Documentary", "War", "Western", "More"];

interface XSeriesCatalogueResponse {
  items: XTvSeriesItem[];
  catalogTotal: number;
  seedComplete: boolean;
  seedNextPage: number;
}
async function fetchXTvSeries(genre: string): Promise<XSeriesCatalogueResponse> {
  const url = genre && genre !== "All" ? "/api/xtv-series/items?genre=" + encodeURIComponent(genre) : "/api/xtv-series/items";
  const res = await fetch(url);
  if (!res.ok) throw new Error("The X Series catalogue could not be reached.");
  const json = (await res.json()) as { ok: boolean; items?: XTvSeriesItem[]; catalogTotal?: number; seedComplete?: boolean; seedNextPage?: number };
  if (json.ok === false) throw new Error("The X Series catalogue returned an error.");
  return {
    items: Array.isArray(json.items) ? json.items : [],
    catalogTotal: json.catalogTotal || 0,
    seedComplete: json.seedComplete === true,
    seedNextPage: json.seedNextPage || 1,
  };
}

interface TmdbSearchResponse {
  results: XTvSeriesItem[];
  page: number;
  totalPages: number;
  totalResults: number;
}
async function searchTmdbTitles(query: string, page: number): Promise<TmdbSearchResponse> {
  const params = new URLSearchParams({ q: query, page: String(page) });
  const response = await fetch("/api/xtv-series/search?" + params.toString());
  if (!response.ok) throw new Error("TMDB search is temporarily unavailable.");
  const data = await response.json() as { ok?: boolean; results?: XTvSeriesItem[]; page?: number; totalPages?: number; totalResults?: number; error?: string };
  if (!data.ok) throw new Error(data.error || "TMDB search failed.");
  return { results: data.results || [], page: data.page || page, totalPages: data.totalPages || 0, totalResults: data.totalResults || 0 };
}

function primaryCategory(item: XTvSeriesItem): string {
  const raw = item.genre || item.categories?.[0] || item.tag || "More";
  const label = raw.trim();
  if (!label || label.toLowerCase() === "other") return "More";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function rankAndShuffleXSeries(items: XTvSeriesItem[]): XTvSeriesItem[] {
  return [...items];
}

function cleanTitle(value: string): string {
  return value
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s*(?:\||[-–—])\s*(?:CLIP|4K|8K|HD|UHD|FULL\s*HD|OFFICIAL(?:\s+(?:VIDEO|MUSIC\s*VIDEO))?|MUSIC\s*VIDEO|TRAILER|TEASER)\b.*$/i, "")
    .replace(/\s*\((?:OFFICIAL(?:\s+(?:VIDEO|MUSIC\s*VIDEO))?|MUSIC\s*VIDEO|4K|8K|HD|UHD|CLIP|TRAILER|TEASER)[^)]*\)|\s*\[(?:OFFICIAL(?:\s+(?:VIDEO|MUSIC\s*VIDEO))?|MUSIC\s*VIDEO|4K|8K|HD|UHD|CLIP|TRAILER|TEASER)[^\]]*\]/gi, "")
    .replace(/\b(?:4K|8K)\b/gi, "")
    .replace(/(?:\.{2,}|…)+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[\s|·:–—-]+$/g, "")
    .trim();
}

function channelName(item: XTvSeriesItem): string {
  return item.tag || "Xora Cinema";
}

function SeriesThumbnail({ item, eager = false }: { item: XTvSeriesItem; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed || !item.thumbnailUrl) return <div className="xsp-thumb-fallback" aria-hidden="true"><Film size={22} /></div>;
  return (
    <img className="xsp-thumb-image" src={item.thumbnailUrl} alt=""
      loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"}
      decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}

function SeriesCard({ item, grid = false, onSelect }: { item: XTvSeriesItem; grid?: boolean; onSelect?: (item: XTvSeriesItem) => void }) {
  const title = cleanTitle(item.title) || "Untitled";
  const minutes = item.durationSeconds ? Math.max(1, Math.round(item.durationSeconds / 60)) : null;
  return (
    <article className={cn("xsp-card", grid && "xsp-card-grid")}>
      {onSelect ? (
        <button type="button" className="xsp-card-link" onClick={() => onSelect(item)} aria-label={"Play " + title} title={"Play " + title}>
          <div className="xsp-card-image">
            <SeriesThumbnail item={item} />
            <span className="xsp-card-play-overlay"><Play size={18} fill="currentColor" /></span>
            {minutes ? <span className="xsp-duration">{minutes} min</span> : null}
          </div>
          <div className="xsp-card-copy">
            <h3 className="xsp-card-title">{title}</h3>
            <p className="xsp-card-channel">{channelName(item)}</p>
          </div>
        </button>
      ) : (
        <Link to="/watch" search={{ id: item.id }} className="xsp-card-link" aria-label={"Open " + title} title={title}>
          <div className="xsp-card-image">
            <SeriesThumbnail item={item} />
            {minutes ? <span className="xsp-duration">{minutes} min</span> : null}
          </div>
          <div className="xsp-card-copy">
            <h3 className="xsp-card-title">{title}</h3>
            <p className="xsp-card-channel">{channelName(item)}</p>
          </div>
        </Link>
      )}
    </article>
  );
}

function XTvSeriesPage() {
  const navigate = useNavigate();
  const [selectingMovieId, setSelectingMovieId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [genre, setGenre] = useState("All");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<XTvSeriesItem[]>([]);
  const [activeSection, setActiveSection] = useState<"library" | "cinema">("library");
  const [activeGridCategory, setActiveGridCategory] = useState<string | null>(null);
  const [libraryAdAvailable, setLibraryAdAvailable] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: catalogueData, isFetching, error: seriesError, refetch: refetchSeries } = useQuery({
    queryKey: ["xtv-series-all"],
    queryFn: () => fetchXTvSeries("All"),
    staleTime: 2_000,
    refetchInterval: (query) => {
      const data = query.state.data as XSeriesCatalogueResponse | undefined;
      return data && (data.seedComplete || data.catalogTotal >= 1000) ? false : 3_500;
    },
  });
  const rawAllItems = catalogueData?.items || [];

  const { data: tmdbSearchData, isFetching: isSearching, error: searchError } = useQuery({
    queryKey: ["xtv-tmdb-search", debouncedSearch, searchPage],
    queryFn: () => searchTmdbTitles(debouncedSearch, searchPage),
    enabled: searchOpen && debouncedSearch.length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    setSearchResults([]);
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!tmdbSearchData) return;
    setSearchResults((current) => searchPage === 1
      ? tmdbSearchData.results
      : [...current, ...tmdbSearchData.results.filter((item) => !current.some((existing) => existing.id === item.id))]);
  }, [tmdbSearchData, searchPage]);

  const allItems = useMemo(() => {
    const seen = new Set<string>();
    return rawAllItems.filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [rawAllItems]);

  const categories = useMemo(() => {
    const found = new Set(allItems.map(primaryCategory));
    return ["All", ...Array.from(found).sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a), bi = CATEGORY_ORDER.indexOf(b);
      if (ai < 0 && bi < 0) return a.localeCompare(b);
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      return ai - bi;
    })];
  }, [allItems]);

  const filtered = useMemo(() => {
    let list = allItems;
    if (genre !== "All") list = list.filter((item) => primaryCategory(item).toLowerCase() === genre.toLowerCase());
    return rankAndShuffleXSeries(list);
  }, [allItems, genre]);

  const isSearchPending = isSearching || search.trim() !== debouncedSearch;
  const hasMoreSearchResults = tmdbSearchData ? tmdbSearchData.page < tmdbSearchData.totalPages : isSearchPending;
  const featured = filtered[0];
  const shelves = filtered.slice(featured ? 1 : 0);
  const categoryRows = useMemo(() => {
    const grouped = new Map<string, XTvSeriesItem[]>();
    shelves.forEach((item) => {
      const category = primaryCategory(item);
      grouped.set(category, [...(grouped.get(category) || []), item]);
    });
    return Array.from(grouped.entries()).sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a), bi = CATEGORY_ORDER.indexOf(b);
      if (ai < 0 && bi < 0) return a.localeCompare(b);
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      return ai - bi;
    });
  }, [shelves]);
  const gridItems = activeGridCategory ? filtered.filter((item) => primaryCategory(item) === activeGridCategory) : [];

  useEffect(() => {
    if (!searchOpen) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSearchOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("keydown", onKey); };
  }, [searchOpen]);

  const openSearch = () => { setSearchOpen(true); setSearchPage(1); setActiveGridCategory(null); };

  const selectSearchMovie = async (item: XTvSeriesItem) => {
    if (selectingMovieId) return;
    setSelectingMovieId(item.id);
    setSelectionError("");
    try {
      const response = await fetch("/api/xtv-series/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: Number(item.id.replace(/^movie_/, "")), mediaType: "movie" }),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "This movie could not be added to XSeries.");
      await navigate({ to: "/watch", search: { id: item.id } });
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "This movie could not be prepared.");
      setSelectingMovieId(null);
    }
  };

  return (
    <AppShell wide extraWide immersive={activeSection === "cinema"} onSearchClick={openSearch}>
      <div className="xseries-page" style={{ paddingBottom: "calc(104px + env(safe-area-inset-bottom, 0px))" }}>
        {activeSection === "library" ? (
          <>
            <header className="xsp-page-header">
              <div className="xsp-heading-group"><p className="xsp-kicker">XORA CINEMA</p><h1>X-Series</h1></div>
              <div className="xsp-section-switch" role="group" aria-label="X Series sections">
                <button type="button" className="is-active" aria-pressed="true" onClick={() => setActiveSection("library")}>Movies</button>
                <button type="button" aria-pressed="false" onClick={() => setActiveSection("cinema")}>Cinema Live TV</button>
              </div>
            </header>

            {searchOpen ? (
              <div className="xsp-search-overlay" role="search">
                <Search size={18} aria-hidden="true" />
                <input ref={searchRef} value={search} onChange={(event) => { setSearch(event.target.value); setSearchPage(1); setActiveGridCategory(null); }} placeholder="Search movies by title" aria-label="Search movies" />
                <button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={18} /></button>
              </div>
            ) : null}

            {catalogueData && !catalogueData.seedComplete && catalogueData.catalogTotal < 1000 ? (
              <p className="xsp-muted" role="status">
                Building your movie library automatically · {catalogueData.catalogTotal.toLocaleString()} movies imported so far.
              </p>
            ) : null}
            <nav className="xsp-category-rail" aria-label="Filter by category">
              {categories.map((category) => (
                <button key={category} type="button" aria-pressed={genre === category} className={cn("xsp-category-chip", genre === category && "is-active")} onClick={() => { setGenre(category); setActiveGridCategory(null); }}>
                  {category}
                </button>
              ))}
            </nav>

            {search.trim().length >= 2 ? (
              <section className="xsp-grid-view" aria-label="TMDB movie search results">
                <div className="xsp-section-heading">
                  <div><h2>Search results</h2><span className="xsp-muted">{tmdbSearchData?.totalResults ? tmdbSearchData.totalResults.toLocaleString() + " matching titles on TMDB" : "Searching the TMDB catalogue"}</span></div>
                  {isSearchPending ? <span className="xsp-muted">Searching…</span> : null}
                </div>
                {searchError ? <p className="xsp-empty-state" role="alert">TMDB search is temporarily unavailable. Try again.</p> : null}
                {selectionError ? <p className="xsp-empty-state" role="alert">{selectionError}</p> : null}
                {selectingMovieId ? <p className="xsp-muted" role="status">Saving movie to XSeries…</p> : null}
                {searchResults.length ? (
                  <>
                    <div className="xsp-grid">{searchResults.map((item) => <SeriesCard key={item.id} item={item} grid onSelect={selectSearchMovie} />)}</div>
                    {hasMoreSearchResults ? (
                      <button type="button" className="xsp-load-more" disabled={isSearchPending} onClick={() => setSearchPage((value) => value + 1)}>Load more results</button>
                    ) : <p className="xsp-muted">You’re all caught up with TMDB results.</p>}
                  </>
                ) : !isSearchPending && !searchError ? <p className="xsp-empty-state">No matching movies found. Try another title.</p> : null}
              </section>
            ) : activeGridCategory ? (
              <section className="xsp-grid-view" aria-label={activeGridCategory + " titles"}>
                <div className="xsp-section-heading">
                  <button type="button" className="xsp-back-link" onClick={() => setActiveGridCategory(null)}><ArrowLeft size={16} /> Back to X-Series</button>
                  <span>{gridItems.length} titles</span>
                </div>
                <h2>{activeGridCategory}</h2>
                <div className="xsp-grid">{gridItems.map((item) => <SeriesCard key={item.id} item={item} grid />)}</div>
              </section>
            ) : (
              <>
                {featured ? (
                  <section className="xsp-featured" aria-label="Featured tonight">
                    <div className="xsp-section-heading"><h2>Featured tonight</h2>{isFetching ? <span className="xsp-muted">Updating</span> : null}</div>
                    <div className="xsp-hero">
                      <SeriesThumbnail key={featured.id} item={featured} eager />
                      <div className="xsp-hero-scrim" />
                      <div className="xsp-hero-copy">
                        <span className="xsp-editor-label">Editor's pick</span>
                        <h3 title={featured.title}>{cleanTitle(featured.title) || "Untitled"}</h3>
                        <p>{channelName(featured)} <span aria-hidden="true">·</span> {primaryCategory(featured)}</p>
                        <div className="xsp-hero-actions">
                          <span className="xsp-watch-button" aria-disabled="true"><Play size={17} fill="currentColor" /> Supplier coming soon</span>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : seriesError ? (
                  <section className="xsp-empty-state" role="alert">
                    <Film size={22} /><h2>Series temporarily unavailable</h2><p>We couldn’t load the catalogue. Please try again.</p>
                    <button type="button" onClick={() => void refetchSeries()}>Try again</button>
                  </section>
                ) : isFetching ? (
                  <section className="xsp-hero-skeleton" aria-label="Loading featured titles"><div className="xsp-skeleton-copy"><span /><span /><span /></div></section>
                ) : null}

                <div className={cn("xsp-sponsored", !libraryAdAvailable && "is-empty")}>
                  {libraryAdAvailable ? <span>Sponsored</span> : null}
                  <XoraInHouseAd placement="xseries_feed" variant="banner" className="xsp-sponsored-ad" collapseWhenEmpty onAvailabilityChange={setLibraryAdAvailable} />
                </div>

                {categoryRows.length ? (
                  <section className="xsp-rows" aria-label="More to watch">
                    <div className="xsp-rows-title"><h2>More to watch</h2></div>
                    {categoryRows.map(([category, items]) => (
                      <section className="xsp-category-section" key={category} aria-label={category + " titles"}>
                        <div className="xsp-row-heading">
                          <h2>{category}</h2>
                          <button type="button" onClick={() => setActiveGridCategory(category)}>See all <ChevronRight size={15} /></button>
                        </div>
                        <div className="xsp-card-rail">{items.slice(0, 10).map((item) => <SeriesCard key={item.id} item={item} />)}</div>
                      </section>
                    ))}
                  </section>
                ) : !featured ? (
                  <section className="xsp-empty-state">
                    <Film size={22} /><h2>No movies found</h2><p>Try another category or search.</p>
                    <button type="button" onClick={() => { setGenre("All"); setSearch(""); setDebouncedSearch(""); setSearchResults([]); setSearchPage(1); setSearchOpen(false); }}>Show all titles</button>
                  </section>
                ) : null}
              </>
            )}
          </>
        ) : <XSeriesChannelShelf onBackToLibrary={() => setActiveSection("library")} />}
      </div>
    </AppShell>
  );
}

export default XTvSeriesPage;
