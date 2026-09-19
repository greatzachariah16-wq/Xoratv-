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
  Sparkles,
  X,
} from "lucide-react";
import { AppShell, FeedTabs } from "@/components/xora/AppShell";
import type { XTvSeriesItem } from "@/integrations/firebase/rtdb";
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

function XTvCard({ item, featured = false }: { item: XTvSeriesItem; featured?: boolean }) {
  return (
    <article
      id={`card-${item.id}`}
      className={cn(
        "group relative overflow-hidden rounded-[1.35rem] border border-border/60 bg-surface shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/45 hover:shadow-xl",
        featured ? "md:col-span-2" : "",
      )}
    >
      <Link
        id={`btn-play-card-${item.id}`}
        to="/watch"
        search={{ id: item.id }}
        className="block w-full text-left"
        aria-label={`Play ${item.title}`}
      >
        <div
          className={cn(
            "relative overflow-hidden bg-gradient-to-br",
            toneClass(item.tone),
            featured ? "aspect-[16/8]" : "aspect-[16/10]",
          )}
        >
          {item.thumbnailUrl ? (
            <img
              src={item.thumbnailUrl}
              alt={item.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover opacity-80 transition duration-700 group-hover:scale-105 group-hover:opacity-95"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-white backdrop-blur-md">
              {item.tag || "X SERIES"}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
              <Film className="size-3" /> {item.genre || "FEATURE"}
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5">
            <div className="max-w-[78%]">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/65">
                {item.genre || "Cinema"}
              </p>
              <h2
                className={cn(
                  "font-display font-semibold tracking-tight text-white",
                  featured ? "text-2xl md:text-4xl" : "text-lg",
                )}
              >
                {item.title}
              </h2>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition group-hover:scale-110">
              <Play className="ml-0.5 size-4 fill-current" />
            </span>
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-[11px] text-muted-foreground">
        <span className="line-clamp-1">{item.description}</span>
        <span className="flex shrink-0 items-center gap-1">
          <Layers3 className="size-3.5" />
          {item.seasons && item.seasons > 1
            ? `${item.seasons} seasons`
            : item.durationSeconds && item.durationSeconds > 0
              ? `${Math.round(item.durationSeconds / 60)} min`
              : "Feature"}
        </span>
      </div>
    </article>
  );
}

function XTvSeriesPage() {
  const [genre, setGenre] = useState<string>("All");
  const [search, setSearch] = useState("");

  // Fetch all published titles
  const {
    data: allItems = [],
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["xtv-series-all"],
    queryFn: () => fetchXTvSeries("All"),
    staleTime: 30_000,
  });

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

  // Filter items based on active category button and search term
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
    if (!q) return list;
    return list.filter((item) =>
      [item.title, item.description, item.genre, item.tag, ...(item.categories || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [allItems, genre, search]);

  const featured = filtered[0];
  const shelves = filtered.slice(featured ? 1 : 0);

  return (
    <AppShell wide>
      <div className="space-y-7 pb-10">
        <FeedTabs active="xtv-series" />

        <section className="relative overflow-hidden rounded-[1.8rem] border border-border/70 bg-surface px-5 py-7 shadow-sm md:px-8 md:py-9">
          <div className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-primary/10 blur-3xl" />
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
            className="mt-7 flex gap-2 overflow-x-auto pb-1"
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
            <div className="grid gap-5 md:grid-cols-2">
              <XTvCard item={featured} featured />
              <div className="flex flex-col justify-between rounded-[1.35rem] border border-border/60 bg-surface p-6">
                <div>
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="size-5" />
                  </div>
                  <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                    Full-Page Cinema
                  </p>
                  <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight">
                    {featured.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {featured.description ||
                      "Click to launch full-page cinema playback in high definition."}
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <Link
                    id="btn-watch-featured"
                    to="/watch"
                    search={{ id: featured.id }}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
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
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                {genre === "All" ? "Full Collection" : `${genre} Titles`}
              </p>
              <h2 className="font-display text-xl font-semibold tracking-tight">
                {genre === "All" ? "All Available Titles" : `${genre} on X Series`}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => refetch()}
                className="text-xs text-muted-foreground hover:text-primary transition"
                title="Refresh titles"
              >
                {filtered.length} {filtered.length === 1 ? "title" : "titles"}
              </button>
            </div>
          </div>

          {shelves.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shelves.map((item) => (
                <XTvCard key={item.id} item={item} />
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
