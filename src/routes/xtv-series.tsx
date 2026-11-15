import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Film,
  Play,
  Search,
  X,
} from "lucide-react";
import { AppShell, FeedTabs } from "@/components/xora/AppShell";
import type { XTvSeriesItem } from "@/integrations/firebase/rtdb";
import { useAuth } from "@/hooks/useAuth";
import { loadUserSignals, trackEvent } from "@/lib/events";
import { getOrCreateSessionId } from "@/lib/ranking";
import type { UserSignals } from "@/integrations/firebase/types";
import { XoraInHouseAd } from "@/components/ads/XoraInHouseAd";
import { cn } from "@/lib/utils";
import { ContentLockGate } from "@/components/commerce/ContentLockGate";
import { XSeriesChannelShelf } from "@/components/xora/XSeriesChannelShelf";
import { XSeriesMark } from "@/components/xora/XSeriesMark";

export const Route = createFileRoute("/xtv-series")({
  head: () => ({
    meta: [
      { title: "X Series — Movies, Series & Cinema | Xora" },
      {
        name: "description",
        content: "Curated movies and series published directly from the sovereign Xora Studio.",
      },
    ],
  }),
  component: XTvSeriesPage,
});

const DEFAULT_CATEGORIES = [
  "All",
  "Movies",
  "Series",
  "Action",
  "Drama",
  "Comedy",
  "Sci-Fi",
  "Thriller",
  "Horror",
  "Documentary",
  "Romance",
  "Crime",
  "Adventure",
  "Fantasy",
  "Animation",
  "Kids",
  "Other",
] as const;

async function fetchXTvSeries(genre: string): Promise<XTvSeriesItem[]> {
  try {
    const url =
      genre && genre !== "All"
        ? `/api/xtv-series/items?genre=${encodeURIComponent(genre)}`
        : "/api/xtv-series/items";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch X Series titles");
    const json = (await res.json()) as { ok: boolean; items?: XTvSeriesItem[] };
    return Array.isArray(json.items) ? json.items : [];
  } catch (error) {
    console.warn("[X Series] Error fetching items:", error);
    return [];
  }
}

function rankAndShuffleXSeries(
  items: XTvSeriesItem[],
  signals?: UserSignals | null,
  userId?: string | null,
): XTvSeriesItem[] {
  if (!items || items.length <= 1) return items;

  const sessionId = getOrCreateSessionId();
  const utcDate = new Date().toISOString().slice(0, 10);
  const seedString = `xseries_${userId || "anon"}_${sessionId}_${utcDate}`;

  let hash = 2166136261;
  for (let i = 0; i < seedString.length; i++) {
    hash ^= seedString.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let s = hash >>> 0;

  const prng = () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const scored = items.map((item) => {
    let score = 50;
    if (signals?.genres) {
      const primaryGenre = item.genre?.toLowerCase() || "";
      if (primaryGenre && signals.genres[primaryGenre]) {
        score += (signals.genres[primaryGenre] || 0) * 4;
      }
      if (Array.isArray(item.categories)) {
        item.categories.forEach((c) => {
          const lower = c.toLowerCase();
          if (signals.genres[lower]) {
            score += (signals.genres[lower] || 0) * 2;
          }
        });
      }
    }

    const yr = item.year || 2026;
    score += (yr - 2000) * 0.2;
    score += (prng() - 0.5) * 16;
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

function XTvCard({
  item,
  userId,
}: {
  item: XTvSeriesItem;
  featured?: boolean;
  userId?: string | null;
}) {
  const handleInteraction = () => {
    trackEvent({
      type: "open_video",
      postId: item.id,
      genre: item.genre,
      feed: "xtv-series",
      userId,
    });
  };

  return (
    <div className="xsl-card-wrap">
      <article id={`card-${item.id}`} className="xsl-card group">
        <Link
          id={`btn-play-card-${item.id}`}
          to="/watch"
          search={{ id: item.id }}
          onClick={handleInteraction}
          className="block w-full text-left"
          aria-label={`Play ${item.title}`}
        >
          <div
            className="xsl-poster"
          >
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt={item.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="xsl-poster-image"
              />
            ) : null}
            <div className="xsl-poster-shade" />
            <div className="xsl-poster-play"><span><Play className="size-3.5 fill-current" /></span></div>
            {item.genre ? <span className="xsl-genre-chip">{item.genre}</span> : null}
          </div>
        </Link>
        <div className="xsl-card-copy">
          <h3 className="xsl-card-title">{item.title}</h3>
          {item.description ? <p className="xsl-card-description">{item.description}</p> : null}
        </div>
      </article>
    </div>
  );
}

function XTvSeriesPage() {
  const { user } = useAuth();
  const [genre, setGenre] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<"library" | "cinema">("library");
  const [libraryAdAvailable, setLibraryAdAvailable] = useState(false);

  const { data: userSignals } = useQuery({
    queryKey: ["user-signals", user?.id],
    queryFn: () => loadUserSignals(user?.id),
    staleTime: 10_000,
  });

  const {
    data: rawAllItems = [],
    isFetching,
  } = useQuery({
    queryKey: ["xtv-series-all"],
    queryFn: () => fetchXTvSeries("All"),
    staleTime: 30_000,
  });

  const allItems = useMemo(() => {
    const seen = new Set<string>();
    return rawAllItems.filter((item) => {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [rawAllItems]);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>(["All"]);
    allItems.forEach((item) => {
      if (item.genre) cats.add(item.genre);
      if (Array.isArray(item.categories)) item.categories.forEach((c) => c && cats.add(c));
    });
    DEFAULT_CATEGORIES.forEach((c) => cats.add(c));
    return Array.from(cats);
  }, [allItems]);

  const filtered = useMemo(() => {
    let list = allItems;
    if (genre && genre !== "All") {
      const g = genre.toLowerCase();
      list = list.filter((item) => {
        const primaryMatch =
          item.genre?.toLowerCase() === g || item.genre?.toLowerCase().includes(g);
        const tagMatch = item.tag?.toLowerCase() === g || item.tag?.toLowerCase().includes(g);
        const catMatch =
          Array.isArray(item.categories) &&
          item.categories.some((c) => c.toLowerCase() === g || c.toLowerCase().includes(g));
        const isMovieCategory = g === "movies" || g === "movie";
        const movieMatch =
          isMovieCategory &&
          (item.tag?.toLowerCase().includes("movie") ||
            item.tag?.toLowerCase().includes("feature") ||
            item.genre?.toLowerCase().includes("movie"));
        const isSeriesCategory = g === "series";
        const seriesMatch =
          isSeriesCategory &&
          (item.tag?.toLowerCase().includes("series") ||
            item.genre?.toLowerCase().includes("series") ||
            (item.seasons && item.seasons > 0));
        return primaryMatch || tagMatch || catMatch || movieMatch || seriesMatch;
      });
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((item) =>
        [item.title, item.description, item.genre, item.tag, ...(item.categories || [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }

    return rankAndShuffleXSeries(list, userSignals, user?.id);
  }, [allItems, genre, search, userSignals, user?.id]);

  const featured = filtered[0];
  const shelves = filtered.slice(featured ? 1 : 0);

  return (
    <AppShell wide extraWide immersive={activeSection === "cinema"}>
      <div className={cn("w-full max-w-full", activeSection === "library" ? "xseries-library space-y-6 pb-10" : "overflow-x-clip space-y-0 pb-0")}>
        {activeSection === "library" ? (
          <>
            <FeedTabs />
            <nav aria-label="X-Series sections" className="xsl-section-switch">
          <button type="button" onClick={() => setActiveSection("library")} aria-pressed={activeSection === "library"} className={cn("xsl-section-tab", activeSection === "library" && "is-active")}>
            Movies &amp; Series
          </button>
          <button type="button" onClick={() => setActiveSection("cinema")} aria-pressed={activeSection === "cinema"} className={cn("xsl-section-tab", activeSection === "cinema" && "is-active")}>
            Cinema Live TV
          </button>
            </nav>
          </>
        ) : null}

        {activeSection === "library" ? (
          <>
        <section className="xsl-library-hero">
          <div className="xsl-hero-content">
            <div className="flex items-center gap-3">
              <XSeriesMark size="lg" className="xsc-brand-mark" />
              <div className="min-w-0">
                <p className="xsl-eyebrow">XORA ENTERTAINMENT</p>
                <h1 className="xsl-page-title">X Series</h1>
                <p className="xsl-page-subtitle">Movies, series and live channels.</p>
              </div>
            </div>

            <div className="xsl-search">
              <Search className="xsl-search-icon size-4 shrink-0" />
              <input
                id="xseries-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search movies and series"
                className="xsl-search-input"
                aria-label="Search X Series"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="xsl-search-clear"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            <div
              className="xsl-category-rail"
              style={{ touchAction: "pan-x" }}
              role="tablist"
              aria-label="Filter by category"
            >
              {availableCategories.map((cat) => {
                const isActive = genre === cat;
                const count =
                  cat === "All"
                    ? allItems.length
                    : allItems.filter((item) => {
                        const g = cat.toLowerCase();
                        return (
                          item.genre?.toLowerCase() === g ||
                          item.tag?.toLowerCase() === g ||
                          (Array.isArray(item.categories) &&
                            item.categories.some((c) => c.toLowerCase() === g || c.toLowerCase().includes(g)))
                        );
                      }).length;

                return (
                  <button
                    key={cat}
                    id={`cat-btn-${cat.toLowerCase().replace(/\s+/g, "-")}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setGenre(cat)}
                    className={cn(
                      "xsl-category-chip", isActive && "is-active",
                    )}
                  >
                    <span>{cat}</span>
                    {allItems.length > 0 && count > 0 ? (
                      <span
                        className={cn(
                          "xsl-category-count",
                        )}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <div className={cn("xsl-sponsored", !libraryAdAvailable && "is-empty")}>{libraryAdAvailable ? <span>Sponsored</span> : null}<XoraInHouseAd placement="xseries_feed" variant="banner" className="xsl-sponsored-ad" collapseWhenEmpty onAvailabilityChange={setLibraryAdAvailable} /></div>

        {featured ? (
          <section id="featured-movie-section">
            <div className="xsl-section-heading"><div><p className="xsl-eyebrow">PICKED FOR YOU</p><h2>Featured</h2></div>{isFetching ? <span className="xsl-updating">Updating</span> : null}</div>
            <div className="xsl-featured-grid">
              <XTvCard item={featured} userId={user?.id} />
              <div className="xsl-featured-details">
                <div>
                  <div className="flex items-center gap-3">
                    <XSeriesMark size="sm" className="xsc-brand-mark" />
                    <p className="xsl-eyebrow">X SERIES SELECTION</p>
                  </div>
                  <h3 className="xsl-featured-title">
                    {featured.title}
                  </h3>
                  <p className="xsl-featured-description">
                    {featured.description || ""}
                  </p>
                </div>
                <div className="xsl-featured-actions">
                  <Link
                    id="btn-watch-featured"
                    to="/watch"
                    search={{ id: featured.id }}
                    onClick={() =>
                      trackEvent({
                        type: "open_video",
                        postId: featured.id,
                        genre: featured.genre,
                        feed: "xtv-series",
                        userId: user?.id,
                      })
                    }
                    className="xsl-watch-button"
                  >
                    Watch now <ArrowRight className="size-3.5" />
                  </Link>
                  <span className="xsl-featured-genre">{featured.genre}</span>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {shelves.length > 0 ? (
          <section aria-label="More movies and series">
            <div className="xsl-section-heading"><div><p className="xsl-eyebrow">THE COLLECTION</p><h2>More to watch</h2></div><span className="xsl-updating">{shelves.length + (featured ? 1 : 0)} titles</span></div>
            <div className="xsl-video-grid">
              {shelves.map((item) => (
                <div key={item.id} className="xsl-grid-item">
                  <XTvCard item={item} userId={user?.id} />
                </div>
              ))}
            </div>
          </section>
        ) : !featured ? (
          <section className="xsl-empty-state">
            <span className="xsl-empty-icon"><Film className="size-4" /></span>
            <h3>Nothing here yet.</h3>
            <button
              id="btn-reset-category-filter"
              type="button"
              onClick={() => {
                setGenre("All");
                setSearch("");
              }}
              className="xsl-watch-button"
            >
              Show all titles
            </button>
          </section>
        ) : null}
          </>
        ) : (
          <XSeriesChannelShelf onBackToLibrary={() => setActiveSection("library")} />
        )}
      </div>
    </AppShell>
  );
}

export default XTvSeriesPage;
