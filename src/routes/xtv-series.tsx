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

function toneClass(tone?: string) {
  if (tone === "clay") return "from-[#9a6248] via-[#704437] to-[#241c19]";
  if (tone === "sage") return "from-[#667461] via-[#39463e] to-[#202825]";
  if (tone === "sand") return "from-[#756d5f] via-[#454039] to-[#24211e]";
  return "from-[#343534] via-[#202322] to-[#111312]";
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
    <div className="flex flex-col">
      <article
        id={`card-${item.id}`}
        className="group relative overflow-hidden rounded-[1.35rem] border border-[#9b7959]/20 bg-[#201a16] shadow-[0_12px_28px_rgba(39,25,16,0.12)] transition duration-200 hover:-translate-y-1 hover:border-[#c79d65]/50 hover:shadow-[0_18px_38px_rgba(39,25,16,0.2)]"
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
              "relative aspect-[3/4] overflow-hidden bg-gradient-to-br",
              toneClass(item.tone),
            )}
          >
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt={item.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
              />
            ) : null}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />
            <div className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition duration-200 group-hover:opacity-100">
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
        <div className="border-t border-white/[0.06] bg-[linear-gradient(145deg,#2b211a,#1b1613)] p-3 sm:p-3.5">
          <h3 className="line-clamp-1 font-display text-sm font-semibold tracking-tight text-[#f8ecdc] transition group-hover:text-[#e3c18e]">
            {item.title}
          </h3>
          {item.description ? (
            <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#bcae9c] sm:text-[11px]">
              {item.description}
            </p>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function XTvSeriesPage() {
  const { user } = useAuth();
  const [genre, setGenre] = useState<string>("All");
  const [search, setSearch] = useState("");

  const { data: userSignals } = useQuery({
    queryKey: ["user-signals", user?.id],
    queryFn: () => loadUserSignals(user?.id),
    staleTime: 10_000,
  });

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
    <AppShell wide>
      <div className="space-y-7 pb-10 max-w-full overflow-x-hidden">
        <FeedTabs active="xtv-series" />

        <section className="relative isolate overflow-hidden rounded-[2rem] border border-[#8a6749]/25 bg-[linear-gradient(145deg,#2a211b_0%,#1d1714_58%,#120f0d_100%)] px-4 py-5 text-[#f7ead8] shadow-[0_22px_55px_rgba(39,25,16,0.16)] sm:px-6 sm:py-7">
          <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full bg-[#d4aa6d]/10 blur-3xl" />
          <div className="relative flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <XSeriesMark size="lg" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#d6b47c]">XORA</p>
                <h1 className="font-display text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">X Series</h1>
                <p className="mt-0.5 text-xs text-[#cbb99e] sm:text-sm">Movies, series and live channels.</p>
              </div>
            </div>

            <div className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3.5 py-3 shadow-inner sm:max-w-md">
              <Search className="size-4 shrink-0 text-[#d1b78d]" />
              <input
                id="xseries-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search movies and series"
                className="min-w-0 flex-1 bg-transparent text-sm text-[#fff7eb] outline-none placeholder:text-[#a9967f]"
                aria-label="Search X Series"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="rounded-full p-1 text-[#cbb99e] hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            <div
              className="flex max-w-full gap-2 overflow-x-auto pb-1 no-scrollbar touch-pan-x"
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
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-semibold transition",
                      isActive
                        ? "border-[#e4c58f] bg-[#d8b77f] text-[#24190f] shadow-[0_3px_12px_rgba(216,183,127,0.18)]"
                        : "border-white/10 bg-white/[0.035] text-[#d8c8b3] hover:border-[#d8b77f]/45 hover:bg-white/[0.07]",
                    )}
                  >
                    <span>{cat}</span>
                    {allItems.length > 0 && count > 0 ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none",
                          isActive ? "bg-black/10 text-[#24190f]" : "bg-white/10 text-[#cbb99e]",
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

        <XoraInHouseAd placement="xseries_feed" variant="banner" className="my-2" />

        {featured ? (
          <section id="featured-movie-section">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold tracking-tight">Featured</h2>
              {isFetching ? <span className="text-[10px] text-muted-foreground">Updating</span> : null}
            </div>
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              <XTvCard item={featured} userId={user?.id} />
              <div className="flex flex-col justify-between rounded-[1.35rem] border border-[#b99160]/25 bg-[linear-gradient(150deg,#2a211b,#181310)] p-4 text-[#f7ead8] shadow-[0_16px_38px_rgba(39,25,16,0.14)] sm:p-5">
                <div>
                  <div className="flex items-center gap-3">
                    <XSeriesMark size="sm" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d6b47c]">X Series</p>
                  </div>
                  <h3 className="mt-1 font-display text-lg font-semibold tracking-tight sm:text-xl">
                    {featured.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {featured.description || ""}
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-3">
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
                    className="inline-flex items-center gap-2 rounded-full border border-[#e1c18a]/30 bg-[#d8b77f] px-4 py-2 text-xs font-bold text-[#24190f] shadow-sm transition hover:bg-[#e6c993]"
                  >
                    Watch now <ArrowRight className="size-3.5" />
                  </Link>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-[#bca787]">{featured.genre}</span>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {shelves.length > 0 ? (
          <section aria-label="More movies and series">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-display text-lg font-semibold">More to watch</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {shelves.map((item) => (
                <div key={item.id} className="space-y-3">
                  <XTvCard item={item} userId={user?.id} />
                </div>
              ))}
            </div>
          </section>
        ) : !featured ? (
          <section className="rounded-2xl border border-dashed border-border p-8 text-center">
            <Film className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-lg font-semibold">Nothing here yet.</h3>
            <button
              id="btn-reset-category-filter"
              type="button"
              onClick={() => {
                setGenre("All");
                setSearch("");
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold hover:border-primary/40"
            >
              Show all titles
            </button>
          </section>
        ) : null}
        <XSeriesChannelShelf />
      </div>
    </AppShell>
  );
}

export default XTvSeriesPage;
