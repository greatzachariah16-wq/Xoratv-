import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Film, Play, Search, X } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import type { XTvSeriesItem } from "@/integrations/firebase/rtdb";
import { useAuth } from "@/hooks/useAuth";
import { loadUserSignals } from "@/lib/events";
import { getOrCreateSessionId } from "@/lib/ranking";
import type { UserSignals } from "@/integrations/firebase/types";
import { XoraInHouseAd } from "@/components/ads/XoraInHouseAd";
import { cn } from "@/lib/utils";
import { XSeriesChannelShelf } from "@/components/xora/XSeriesChannelShelf";
import "./xseries-premium.css";

export const Route = createFileRoute("/xtv-series")({
  head: () => ({
    meta: [
      { title: "X Series — Movies, Series & Cinema | Xora" },
      { name: "description", content: "Curated movies and series published directly from the sovereign Xora Studio." },
    ],
  }),
  component: XTvSeriesPage,
});

const CATEGORY_ORDER = ["Drama", "Action", "Comedy", "Romance", "Thriller", "Horror", "Sci-Fi", "Crime", "Adventure", "Fantasy", "Documentary", "Animation", "Kids", "More"];

async function fetchXTvSeries(genre: string): Promise<XTvSeriesItem[]> {
  const url = genre && genre !== "All" ? "/api/xtv-series/items?genre=" + encodeURIComponent(genre) : "/api/xtv-series/items";
  const res = await fetch(url);
  if (!res.ok) throw new Error("The X Series catalogue could not be reached.");
  const json = (await res.json()) as { ok: boolean; items?: XTvSeriesItem[] };
  if (json.ok === false) throw new Error("The X Series catalogue returned an error.");
  return Array.isArray(json.items) ? json.items : [];
}

function primaryCategory(item: XTvSeriesItem): string {
  const raw = item.genre || item.categories?.[0] || item.tag || "More";
  const label = raw.trim();
  if (!label || label.toLowerCase() === "other") return "More";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function rankAndShuffleXSeries(
  items: XTvSeriesItem[],
  signals?: UserSignals | null,
  userId?: string | null,
): XTvSeriesItem[] {
  if (!items || items.length <= 1) return items;
  const sessionId = getOrCreateSessionId();
  const utcDate = new Date().toISOString().slice(0, 10);
  const seedString = "xseries_" + (userId || "anon") + "_" + sessionId + "_" + utcDate;
  let hash = 2166136261;
  for (let i = 0; i < seedString.length; i++) {
    hash ^= seedString.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  const prng = () => {
    let t = (state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const scored = items.map((item) => {
    let score = 50;
    if (signals?.genres) {
      const primaryGenre = item.genre?.toLowerCase() || "";
      if (primaryGenre && signals.genres[primaryGenre]) score += (signals.genres[primaryGenre] || 0) * 4;
      if (Array.isArray(item.categories)) {
        item.categories.forEach((category) => {
          const lower = category.toLowerCase();
          if (signals.genres?.[lower]) score += (signals.genres[lower] || 0) * 2;
        });
      }
    }
    const year = item.year || 2026;
    score += (year - 2000) * 0.2;
    score += (prng() - 0.5) * 16;
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.item);
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

function SeriesCard({ item, grid = false }: { item: XTvSeriesItem; grid?: boolean }) {
  const title = cleanTitle(item.title) || "Untitled";
  const minutes = item.durationSeconds ? Math.max(1, Math.round(item.durationSeconds / 60)) : null;
  return (
    <article className={cn("xsp-card", grid && "xsp-card-grid")}>
      <div className="xsp-card-link" aria-label={item.title} title={item.title}>
        <div className="xsp-card-image">
          <SeriesThumbnail item={item} />
          {minutes ? <span className="xsp-duration">{minutes} min</span> : null}
        </div>
        <div className="xsp-card-copy">
          <h3 className="xsp-card-title">{title}</h3>
          <p className="xsp-card-channel">{channelName(item)}</p>
        </div>
      </div>
    </article>
  );
}

function XTvSeriesPage() {
  const { user } = useAuth();
  const [genre, setGenre] = useState("All");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<"library" | "cinema">("library");
  const [activeGridCategory, setActiveGridCategory] = useState<string | null>(null);
  const [libraryAdAvailable, setLibraryAdAvailable] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: userSignals } = useQuery({ queryKey: ["user-signals", user?.id], queryFn: () => loadUserSignals(user?.id), staleTime: 10_000 });
  const { data: rawAllItems = [], isFetching, error: seriesError, refetch: refetchSeries } = useQuery({ queryKey: ["xtv-series-all"], queryFn: () => fetchXTvSeries("All"), staleTime: 30_000 });

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
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((item) => [item.title, item.description, item.genre, item.tag, ...(item.categories || [])].filter(Boolean).join(" ").toLowerCase().includes(q));
    return rankAndShuffleXSeries(list, userSignals, user?.id);
  }, [allItems, genre, search, userSignals, user?.id]);

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

  const openSearch = () => { setSearchOpen(true); setActiveGridCategory(null); };

  return (
    <AppShell wide extraWide immersive={activeSection === "cinema"} onSearchClick={openSearch}>
      <div className="xseries-page">
        {activeSection === "library" ? (
          <>
            <header className="xsp-page-header">
              <div className="xsp-heading-group"><p className="xsp-kicker">XORA CINEMA</p><h1>Series</h1></div>
              <div className="xsp-section-switch" role="group" aria-label="X Series sections">
                <button type="button" className="is-active" aria-pressed="true" onClick={() => setActiveSection("library")}>Movies &amp; Series</button>
                <button type="button" aria-pressed="false" onClick={() => setActiveSection("cinema")}>Cinema Live TV</button>
              </div>
            </header>

            {searchOpen ? (
              <div className="xsp-search-overlay" role="search">
                <Search size={18} aria-hidden="true" />
                <input ref={searchRef} value={search} onChange={(event) => { setSearch(event.target.value); setActiveGridCategory(null); }} placeholder="Find a story, genre or title" aria-label="Search series" />
                {search ? <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={17} /></button> : null}
                <button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={18} /></button>
              </div>
            ) : null}

            <nav className="xsp-category-rail" aria-label="Filter by category">
              {categories.map((category) => (
                <button key={category} type="button" aria-pressed={genre === category} className={cn("xsp-category-chip", genre === category && "is-active")} onClick={() => { setGenre(category); setActiveGridCategory(null); }}>
                  {category}
                </button>
              ))}
            </nav>

            {activeGridCategory ? (
              <section className="xsp-grid-view" aria-label={activeGridCategory + " titles"}>
                <div className="xsp-section-heading">
                  <button type="button" className="xsp-back-link" onClick={() => setActiveGridCategory(null)}><ArrowLeft size={16} /> Back to Series</button>
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
                    <Film size={22} /><h2>No titles found</h2><p>Try another category or search.</p>
                    <button type="button" onClick={() => { setGenre("All"); setSearch(""); setSearchOpen(false); }}>Show all titles</button>
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
