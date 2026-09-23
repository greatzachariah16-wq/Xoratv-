import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  Film,
  Layers3,
  Play,
  PlusCircle,
  Search,
  Shuffle,
  Sparkles,
  X,
} from "lucide-react";
import { AppShell, FeedTabs } from "@/components/xora/AppShell";
import type { XTvSeriesItem } from "@/integrations/firebase/rtdb";
import { useAuth } from "@/hooks/useAuth";
import { loadUserSignals, trackEvent } from "@/lib/events";
import { getOrCreateSessionId } from "@/lib/ranking";
import type { UserSignals } from "@/integrations/firebase/types";
import { AdcashPlacement } from "@/components/xora/AdcashPlacement";
import { XoraInHouseAd } from "@/components/ads/XoraInHouseAd";
import { ExoClickNativeAd } from "@/components/ads/ExoClickNativeAd";
import { cn } from "@/lib/utils";

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

function toneClass(tone?: string) {
  if (tone === "clay") return "from-[#9a6248] via-[#704437] to-[#241c19]";
  if (tone === "sage") return "from-[#667461] via-[#39463e] to-[#202825]";
  if (tone === "sand") return "from-[#756d5f] via-[#454039] to-[#24211e]";
  return "from-[#343534] via-[#202322] to-[#111312]";
}

/**
 * Same provider-agnostic recommendation and shuffle algorithm as homepage/shorts.
 * Balances user genre learning with exploration jitter to mix every available genre.
 */
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

    // 1. User Genre Affinity from tracked signals
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

    // 2. Recency boost
    const yr = item.year || 2026;
    score += (yr - 2000) * 0.2;

    // 3. Seeded Exploration Noise Jitter (-8 to +8) for genre diversity
    const jitter = (prng() - 0.5) * 16;
    score += jitter;

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
    <div className="flex flex-col">
      <article
        id={`card-${item.id}`}
        className="group relative overflow-hidden rounded-xl border border-border/60 bg-surface shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-md sm:rounded-2xl"
      >
        <Link
          id={`btn-play-card-${item.id}`}
          to="/watch"
          search={{ id: item.id }}
          onClick={handleInteraction}
          className="block w-full text-left"
          aria-label={`Play ${item.title}`}
        >
          <div
            className={cn(
              "relative aspect-video overflow-hidden bg-gradient-to-br",
              toneClass(item.tone),
            )}
          >
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt={item.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
            ) : null}
            <div className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition duration-200 group-hover:opacity-100">
              <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition group-hover:scale-110 sm:size-10">
                <Play className="ml-0.5 size-3.5 fill-current sm:size-4" />
              </span>
            </div>
            {item.genre ? (
              <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white/90 backdrop-blur-xs sm:text-[10px]">
                {item.genre}
              </span>
            ) : null}
          </div>
        </Link>
        <div className="p-2 sm:p-3">
          <h3 className="line-clamp-1 font-display text-xs font-semibold tracking-tight transition group-hover:text-primary sm:text-sm">
            {item.title}
          </h3>
          {item.description ? (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground sm:text-xs">
              {item.description}
            </p>
          ) : null}
        </div>
      </article>
      <ExoClickNativeAd className="mt-2 mb-1" />
      <AdcashPlacement slotId={`xtv-${item.id}`} compact />
    </div>
  );
}

function XTvSeriesPage() {
  const { user } = useAuth();
  const [genre, setGenre] = useState<string>("All");
  const [search, setSearch] = useState("");

  // Fetch user interaction signals for learning preferences
  const { data: userSignals } = useQuery({
    queryKey: ["user-signals", user?.id],
    queryFn: () => loadUserSignals(user?.id),
    staleTime: 10_000,
  });

  // Fetch all published titles
  const {
    data: rawAllItems = [],
    isFetching,
    refetch,
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

  // Calculate categories dynamically from published items and defaults
  const availableCategories = useMemo(() => {
    const cats = new Set<string>(["All"]);
    allItems.forEach((item) => {
      if (item.genre) cats.add(item.genre);
      if (Array.isArray(item.categories)) {
        item.categories.forEach((c) => {
          if (c) cats.add(c);
        });
      }
    });
    DEFAULT_CATEGORIES.forEach((c) => cats.add(c));
    return Array.from(cats);
  }, [allItems]);

  // Filter items based on active category button and search term, then apply ranking & shuffling
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
    <AppShell wide>
      <div className="space-y-7 pb-10 max-w-full overflow-x-hidden">
        <FeedTabs active="xtv-series" />

        <section className="relative overflow-hidden rounded-[1.8rem] border border-border/70 bg-surface px-5 py-7 shadow-sm md:px-8 md:py-9">
          <div className="pointer-events-none absolute right-0 top-0 size-72 -translate-y-1/3 translate-x-1/3 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                <Sparkles className="size-3" /> X Series Cinema
              </div>
              <h1 className="font-display text-3xl font-semibold tracking-[-0.03em] md:text-5xl">
                Stories worth <span className="text-primary">staying for.</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
                Curated cinema and exclusive productions published directly by Xora. Full-page
                sovereign streaming in high definition.
              </p>
            </div>
            <div className="flex w-full max-w-sm items-center gap-2 rounded-2xl border border-border/70 bg-background/70 px-3 py-2.5 shadow-inner">
              <Search className="size-4 text-muted-foreground" />
              <input
                id="xseries-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search titles, genres, stories..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                aria-label="Search X Series"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Category Filter Buttons */}
          <div
            className="mt-7 flex gap-2 overflow-x-auto pb-1 max-w-full touch-pan-x no-scrollbar"
            style={{ touchAction: "pan-x" }}
            role="tablist"
            aria-label="Filter by category"
          >
            {availableCategories.map((cat) => {
              const isActive = genre === cat;
              const count =
                cat === "All"
                  ? allItems.length
                  : allItems.filter((m) => {
                      const g = cat.toLowerCase();
                      return (
                        m.genre?.toLowerCase() === g ||
                        m.tag?.toLowerCase() === g ||
                        (Array.isArray(m.categories) &&
                          m.categories.some(
                            (c) => c.toLowerCase() === g || c.toLowerCase().includes(g),
                          ))
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
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  <span>{cat}</span>
                  {allItems.length > 0 && count > 0 ? (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                        isActive ? "bg-white/25 text-white" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        {/* Xora In-House Ad Campaign Placement */}
        <XoraInHouseAd placement="xseries_feed" variant="banner" className="my-2" />

        {/* Featured Section */}
        {featured ? (
          <section id="featured-movie-section">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  Featured Title
                </p>
                <h2 className="font-display text-xl font-semibold tracking-tight">
                  Now Playing on X Series
                </h2>
              </div>
              <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                <CalendarDays className="size-3.5" />{" "}
                {isFetching ? "Refreshing..." : "Curated sovereign stream"}
              </span>
            </div>
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              <XTvCard item={featured} userId={user?.id} />
              <div className="flex flex-col justify-between rounded-xl border border-border/60 bg-surface p-4 shadow-xs sm:rounded-2xl sm:p-5">
                <div>
                  <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-10">
                    <Sparkles className="size-4 sm:size-5" />
                  </div>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                    Full-Page Cinema
                  </p>
                  <h3 className="mt-1 font-display text-lg font-semibold tracking-tight sm:text-xl">
                    {featured.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {featured.description ||
                      "Click to launch full-page cinema playback in high definition."}
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Link
                    id="btn-watch-featured"
                    to="/watch"
                    search={{ id: featured.id }}
                    onClick={() => {
                      trackEvent({
                        type: "open_video",
                        postId: featured.id,
                        genre: featured.genre,
                        feed: "xtv-series",
                        userId: user?.id,
                      });
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90"
                  >
                    Watch full movie <ArrowRight className="size-3.5" />
                  </Link>
                  <span className="text-xs text-muted-foreground">{featured.genre}</span>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* All Titles Shelf */}
        <section id="xseries-catalog-shelf">
          <div className="mb-3.5 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                {genre === "All" ? "Full Collection" : `${genre} Titles`}
              </p>
              <h2 className="font-display text-lg font-semibold tracking-tight sm:text-xl">
                {genre === "All" ? "All Available Titles" : `${genre} on X Series`}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => refetch()}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition"
                title="Reshuffle feed"
              >
                <Shuffle className="size-3.5" />
                <span>
                  {filtered.length} {filtered.length === 1 ? "title" : "titles"}
                </span>
              </button>
            </div>
          </div>

          {shelves.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-4">
              {shelves.map((item, index) => (
                <XTvCard key={`${item.id}-${index}`} item={item} userId={user?.id} />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
              Showing the 1 featured title available in this view.
            </div>
          ) : allItems.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-surface/40 p-12 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Film className="size-6" />
              </div>
              <h3 className="mt-4 font-display text-xl font-semibold">No titles published yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                All media in X Series is published directly from the sovereign Admin Studio. Import
                and approve your titles in the admin panel to display them here instantly.
              </p>
              <Link
                to="/admin/xseris"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
              >
                <PlusCircle className="size-4" /> Publish in Admin Studio
              </Link>
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-surface/40 p-10 text-center">
              <div className="mx-auto grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <Film className="size-5" />
              </div>
              <h3 className="mt-3 font-display text-lg font-semibold">No titles in "{genre}"</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                There are no published titles matching this category.
              </p>
              <button
                id="btn-reset-category-filter"
                type="button"
                onClick={() => {
                  setGenre("All");
                  setSearch("");
                }}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold hover:border-primary/40"
              >
                Show all available movies ({allItems.length})
              </button>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

export default XTvSeriesPage;
