import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart, Loader2, Play, Radio, Search, X } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { NativeVideoPlayer } from "@/components/xora/VideoPlayer";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChannelGuide } from "@/components/xora/ChannelGuide";
import { CategoryChips, ChannelCard, SectionHeader, formatMetadataLabel, getChannelDisplayName, getChannelQuality, getCountryName } from "@/components/xora/XSportsComponents";

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
  // Avoid Array.prototype.flat(), which is missing in older Android WebViews.
  const known = Object.keys(SPORT_TERMS).reduce<string[]>((all, key) => {
    return all.concat(SPORT_TERMS[key as keyof typeof SPORT_TERMS]);
  }, []);
  if (filter === "Other") return !known.some((term) => value.includes(term));
  return SPORT_TERMS[filter].some((term) => value.includes(term));
}
function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSportsChannel(value: unknown): SportsChannel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const streamUrl = typeof raw.streamUrl === "string" ? raw.streamUrl.trim() : "";

  // Cards and the native player require stable identity, a display name, and a stream URL.
  if (!id || !name || !streamUrl) return null;

  return {
    id,
    name,
    streamUrl,
    logo: typeof raw.logo === "string" && raw.logo.trim() ? raw.logo.trim() : undefined,
    country: typeof raw.country === "string" && raw.country.trim() ? raw.country.trim() : undefined,
    categories: normalizeStringList(raw.categories),
    labels: normalizeStringList(raw.labels),
    quality: typeof raw.quality === "string" ? raw.quality : null,
    score: typeof raw.score === "number" && Number.isFinite(raw.score) ? raw.score : undefined,
    provider: raw.provider === "nexus" || raw.provider === "iptv-org" ? raw.provider : undefined,
  };
}

async function loadSportsChannels(): Promise<SportsChannel[]> {
  const response = await fetch("/api/tv/channels?category=sports&limit=10000");
  if (!response.ok) throw new Error("Unable to load sports channels right now.");

  const data: unknown = await response.json();
  const rawChannels = data && typeof data === "object" && !Array.isArray(data)
    ? (data as { channels?: unknown }).channels
    : [];
  const normalizedChannels = Array.isArray(rawChannels)
    ? rawChannels.map(normalizeSportsChannel).filter((channel): channel is SportsChannel => channel !== null)
    : [];

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

  // Ignore malformed entries and duplicate IDs so a single bad catalogue record
  // cannot break React rendering or create unstable card keys.
  const result: SportsChannel[] = [wweCandidate];
  const seenIds = new Set<string>([wweCandidate.id]);
  for (const channel of normalizedChannels) {
    if (seenIds.has(channel.id)) continue;
    seenIds.add(channel.id);
    result.push(channel);
  }
  return result;
}

export const Route = createFileRoute("/xsports")({
  head: () => ({ meta: [
    { title: "XSports | XoraTV" },
    { name: "description", content: "Browse sports channels on XoraTV and watch in the dedicated player." },
  ] }),
  component: XSportsPage,
});

type HeroSport = "wrestling" | "football" | "basketball" | "tennis" | "golf" | "generic";

// Pexels: two athletes competing in a brightly lit boxing ring. https://www.pexels.com/photo/boxers-inside-a-ring-3531081/
// Pexels License: free commercial use; attribution is not required.
const WRESTLING_HERO_IMAGE = "https://images.pexels.com/photos/3531081/pexels-photo-3531081.jpeg?auto=compress&dpr=1&h=750&w=1260";
// Pexels: illuminated soccer stadium at night. https://www.pexels.com/photo/illuminated-soccer-stadium-at-night-28827841/
// Pexels License: free commercial use; attribution is not required.
const FOOTBALL_HERO_IMAGE = "https://images.pexels.com/photos/28827841/pexels-photo-28827841/free-photo-of-illuminated-soccer-stadium-at-night.jpeg?auto=compress&dpr=1&h=750&w=1260";
// Pexels: basketball athlete going up for a dunk. https://www.pexels.com/photo/athlete-jumping-for-dunk-in-indoor-basketball-court-32877408/
// Pexels License: free commercial use; attribution is not required.
const BASKETBALL_HERO_IMAGE = "https://images.pexels.com/photos/32877408/pexels-photo-32877408/free-photo-of-athlete-jumping-for-dunk-in-indoor-basketball-court.jpeg?auto=compress&dpr=1&h=750&w=1260";
// Pexels: quiet tennis court with atmospheric night lighting. https://www.pexels.com/photo/quite-tennis-field-during-nighttime-793176/
// Pexels License: free commercial use; attribution is not required.
const TENNIS_HERO_IMAGE = "https://images.pexels.com/photos/793176/pexels-photo-793176.jpeg?auto=compress&dpr=1&h=750&w=1260";
// Pexels: golf course at sunrise. https://www.pexels.com/photo/golfer-playing-at-golf-course-at-dawn-6256755/
// Pexels License: free commercial use; attribution is not required.
const GOLF_HERO_IMAGE = "https://images.pexels.com/photos/6256755/pexels-photo-6256755.jpeg?auto=compress&dpr=1&h=750&w=1260";
// Pexels: stadium floodlights at dusk. https://www.pexels.com/photo/stadium-floodlights-against-evening-sky-32471032/
// Pexels License: free commercial use; attribution is not required.
const GENERIC_HERO_IMAGE = "https://images.pexels.com/photos/32471032/pexels-photo-32471032/free-photo-of-stadium-floodlights-against-evening-sky.jpeg?auto=compress&dpr=1&h=750&w=1260";

const HERO_IMAGES: Record<HeroSport, string> = {
  wrestling: WRESTLING_HERO_IMAGE,
  football: FOOTBALL_HERO_IMAGE,
  basketball: BASKETBALL_HERO_IMAGE,
  tennis: TENNIS_HERO_IMAGE,
  golf: GOLF_HERO_IMAGE,
  generic: GENERIC_HERO_IMAGE,
};

function getChannelInitials(channel: SportsChannel) {
  if (channel.id === "wwe-superstar-central") return "WWE";
  const words = getChannelDisplayName(channel).split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map((word) => word[0]) : [words[0]?.slice(0, 2) || "TV"])
    .join("").toUpperCase();
}
function getSportKey(channel: SportsChannel): HeroSport {
  const text = channelText(channel);
  if (/wrestling|wwe|boxing|mma|ufc|combat/.test(text)) return "wrestling";
  if (/football|soccer|futbol|espn|supersport/.test(text)) return "football";
  if (/basketball|nba|fiba/.test(text)) return "basketball";
  if (/tennis/.test(text)) return "tennis";
  if (/golf/.test(text)) return "golf";
  return "generic";
}
function getChannelCategory(channel: SportsChannel) {
  return channel.categories?.[0] || "Sports";
}
function getHeroDescription(channel: SportsChannel) {
  const categories = [...new Set((channel.categories || []).map((value) => value.trim().toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, separator: string, letter: string) => separator + letter.toUpperCase())))]
    .filter((category) => category.toLowerCase() !== "sports")
    .slice(0, 2);
  const categoryLabel = (categories.length ? categories : [formatMetadataLabel(getChannelCategory(channel))]).join(" & ");
  return categoryLabel + " · " + getCountryName(channel.country);
}

const CATEGORY_CHIPS: Array<{ label: string; value: string }> = [
  { label: "All", value: "filter:All Sports" },
  { label: "Football", value: "filter:Football" },
  { label: "Basketball", value: "filter:Basketball" },
  { label: "Tennis", value: "filter:Tennis" },
  { label: "Wrestling", value: "query:wrestling" },
  { label: "Golf", value: "query:golf" },
  { label: "Motorsport", value: "filter:Motorsport" },
  { label: "Rugby", value: "filter:Rugby" },
  { label: "Cricket", value: "filter:Cricket" },
  { label: "Boxing", value: "filter:Boxing" },
];
const NETWORKS = [
  { label: "ESPN", query: "espn", monogram: "E" },
  { label: "SuperSport", query: "supersport", monogram: "S" },
];

function NetworkChips({ search, onSelect, loading = false }: { search: string; onSelect: (query: string) => void; loading?: boolean }) {
  return (
    <section className="space-y-2" aria-label="Sports networks">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-bold tracking-tight text-foreground">Networks</h2>
        <span className="text-[10px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Browse by broadcaster</span>
      </div>
      <div className="hide-scrollbar touch-pan-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {loading ? Array.from({ length: 3 }).map((_, index) => <span key={index} className="shimmer h-11 w-28 shrink-0 rounded-full" />) : NETWORKS.map((network) => (
          <button
            key={network.query} type="button" onClick={() => onSelect(network.query)}
            aria-pressed={search.trim().toLowerCase() === network.query}
            className={cn(
              "press inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-bold transition-all",
              search.trim().toLowerCase() === network.query ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card/80 text-foreground hover:border-primary/35",
            )}
          >
            <span className="grid size-6 place-items-center rounded-full bg-[#342c28] font-display text-[10px] font-bold text-[#fff4e9]">{network.monogram}</span>
            {network.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function SportsHero({ channel, onWatch, favorite, onFavorite, onTouchPause }: {
  channel: SportsChannel; onWatch: (channel: SportsChannel) => void; favorite: boolean;
  onFavorite: (channel: SportsChannel) => void; onTouchPause: (paused: boolean) => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const image = HERO_IMAGES[getSportKey(channel)];
  const quality = getChannelQuality(channel);
  useEffect(() => {
    setPhotoFailed(false);
    setPhotoLoaded(false);
  }, [image]);

  return (
    <div>
      <div
        className="relative isolate aspect-[4/5] w-[min(82vw,560px)] max-w-full shrink-0 overflow-hidden rounded-[28px] bg-[#191614] shadow-[0_22px_50px_rgba(56,37,25,0.23)] sm:aspect-[5/4]"
        onTouchStart={() => onTouchPause(true)} onTouchEnd={() => onTouchPause(false)} onTouchCancel={() => onTouchPause(false)}
        onPointerDown={() => onTouchPause(true)} onPointerUp={() => onTouchPause(false)} onPointerCancel={() => onTouchPause(false)}
        onMouseEnter={() => onTouchPause(true)} onMouseLeave={() => onTouchPause(false)}
        onFocus={() => onTouchPause(true)} onBlur={() => onTouchPause(false)}
      >
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_75%_25%,#554237_0%,transparent_44%),linear-gradient(145deg,#29221d,#171412_78%)]">
          {photoFailed ? (
            <>
              {channel.logo ? (
                <img src={channel.logo} alt="" className="absolute -inset-[18%] h-[136%] w-[136%] object-contain opacity-25 blur-3xl" />
              ) : (
                <span className="absolute right-[-8%] top-[14%] font-display text-[clamp(100px,30vw,190px)] font-black tracking-[-0.12em] text-white/10 blur-xl">{getChannelInitials(channel)}</span>
              )}
            </>
          ) : (
            <img
              src={image} alt="" aria-hidden="true" loading="eager" decoding="async"
              onLoad={() => setPhotoLoaded(true)} onError={() => setPhotoFailed(true)}
              className={cn("xsports-hero-photo absolute inset-0 h-full w-full object-cover brightness-125 contrast-110 saturate-110 transition-opacity duration-700", photoLoaded ? "opacity-100" : "opacity-0")}
            />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,11,10,0)_0%,rgba(12,11,10,0)_50%,rgba(12,11,10,0.42)_76%,rgba(12,11,10,0.70)_100%)]" />
          <div className="absolute -bottom-16 -left-16 size-64 rounded-full bg-[#b5532f]/20 blur-[70px]" />
        </div>

        <div className="absolute left-4 right-4 top-4 z-10 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ChannelStatusBadge channel={channel} />
            {quality ? <span className="rounded-full border border-white/20 bg-black/30 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white shadow-sm backdrop-blur-md">{quality}</span> : null}
          </div>
          <div className="grid h-[76px] w-[38%] max-w-[164px] shrink-0 place-items-center">
            {channel.logo ? (
              <img src={channel.logo} alt={getChannelDisplayName(channel) + " logo"} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.55)]" />
            ) : channel.id === "wwe-superstar-central" ? (
              <span className="-rotate-6 select-none font-sans text-[clamp(32px,9vw,58px)] font-black italic leading-none tracking-[-0.13em] text-white drop-shadow-[0_8px_20px_rgba(0,0,0,0.75)]">WWE</span>
            ) : null}
          </div>
        </div>

        <div className="absolute inset-x-5 bottom-5 z-10 flex flex-col items-start">
          <h2 className="line-clamp-2 max-w-full font-display text-[30px] font-bold leading-[1.02] tracking-[-0.045em] text-white sm:text-[32px]">{getChannelDisplayName(channel)}</h2>
          <p className="mt-2 line-clamp-1 max-w-full text-sm leading-5 text-white/75">{getHeroDescription(channel)}</p>
          <div className="mt-5 flex w-full items-center gap-2.5">
            <button type="button" onClick={() => onWatch(channel)} className="press inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-[0_8px_22px_rgba(181,83,47,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.97]">
              <Play className="size-4 fill-current" /> Watch now
            </button>
            <button type="button" aria-label={favorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={favorite} onClick={() => onFavorite(channel)} className="press grid size-12 shrink-0 place-items-center rounded-full border border-white/25 bg-black/25 text-white shadow-sm backdrop-blur-md transition-colors hover:bg-white/15">
              <Heart className={cn("size-[19px]", favorite && "fill-current text-[#f3b49d]")} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChannelGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-[22px] border border-border/70 bg-card p-2.5">
          <div className="shimmer aspect-[16/10] rounded-[16px]" />
          <div className="space-y-2 px-0.5 pb-1 pt-3">
            <div className="shimmer h-3 w-4/5 rounded-full" />
            <div className="shimmer h-3 w-3/5 rounded-full" />
            <div className="flex justify-end"><div className="shimmer size-8 rounded-full" /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function XSportsPage() {
  const [filter, setFilter] = useState<SportFilter>("All Sports");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const playerRef = useRef<HTMLElement | null>(null);
  const channelsGridRef = useRef<HTMLDivElement | null>(null);
  const heroCarouselRef = useRef<HTMLDivElement | null>(null);
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

  // Hero slides are a presentation-only selection from the already-filtered list.
  const heroSlides = useMemo(() => {
    const result: SportsChannel[] = [];
    const seen = new Set<string>();
    const add = (channel?: SportsChannel) => {
      if (channel && !seen.has(channel.id)) { result.push(channel); seen.add(channel.id); }
    };
    add(featured);
    (["football", "basketball", "tennis", "wrestling", "golf", "generic"] as HeroSport[]).forEach((sport) => {
      add(channels.find((channel) => getSportKey(channel) === sport && channel.id !== featured?.id));
    });
    channels.forEach(add);
    return result.slice(0, 5);
  }, [channels, featured]);

  useEffect(() => { setHeroIndex(0); }, [filter, search, featured?.id]);
  useEffect(() => {
    if (heroPaused || heroSlides.length < 2) return;
    // matchMedia is not guaranteed in older embedded Android WebViews.
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => setHeroIndex((index) => (index + 1) % heroSlides.length), 6000);
    return () => window.clearInterval(interval);
  }, [heroPaused, heroSlides.length]);

  useEffect(() => {
    const container = heroCarouselRef.current;
    const slide = container?.children.item(heroIndex) as HTMLElement | null;
    if (heroPaused || !container || !slide) return;
    const left = slide.offsetLeft - container.offsetLeft;
    // Element.scrollTo is absent in some WebView versions; preserve carousel positioning with scrollLeft.
    if (typeof container.scrollTo === "function") {
      container.scrollTo({ left, behavior: "smooth" });
    } else {
      container.scrollLeft = left;
    }
  }, [heroIndex, heroPaused]);

  const activeHero = heroSlides[heroIndex] || featured;
  const handleHeroScroll = () => {
    const container = heroCarouselRef.current;
    if (!container) return;
    const midpoint = container.scrollLeft + container.clientWidth / 2;
    const children = Array.from(container.children) as HTMLElement[];
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    children.forEach((slide, index) => {
      const center = slide.offsetLeft + slide.offsetWidth / 2;
      const distance = Math.abs(center - midpoint);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setHeroIndex(nearestIndex);
  };
  const chooseChannel = (channel: SportsChannel) => {
    setSelectedId(channel.id);
    requestAnimationFrame(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const scrollToChannels = () => channelsGridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const selectNetwork = (query: string) => { setFilter("All Sports"); setSearch(query); };
  const toggleFavorite = (channel: SportsChannel) => {
    setFavoriteIds((current) => current.includes(channel.id) ? current.filter((id) => id !== channel.id) : [...current, channel.id]);
  };
  const popularChannels = [...channels].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 4);

  return (
    <AppShell wide>
      <div className="space-y-6 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-2">
        <header id="xsports-top" className="scroll-mt-[calc(4rem+env(safe-area-inset-top))] space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">XoraTV · Live Sports</p>
              <h1 className="mt-1 font-display text-[32px] font-bold leading-none tracking-[-0.045em] text-foreground">XSports</h1>
              <p className="mt-2 text-sm text-muted-foreground">The action, all in one place.</p>
            </div>
            <div className="mb-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-card/80 px-3 py-2 text-[11px] font-bold text-muted-foreground shadow-sm">
              <Radio className="size-3.5 text-primary" />
              {channelsQuery.isLoading ? "…" : (channelsQuery.data?.length || 0) + " channels"}
            </div>
          </div>
          <div className="group relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 z-10 size-[18px] -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input
              value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a channel, sport or network" aria-label="Search sports channels"
              className="h-12 rounded-full border-border/80 bg-card/90 pl-11 pr-12 text-sm shadow-[0_5px_18px_rgba(66,43,29,0.045)] transition-all placeholder:text-muted-foreground/75 focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/20"
            />
            {search ? (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="press absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </header>

        <section className="space-y-3" aria-label="Featured sports channels">
          <SectionHeader title="Featured" subtitle="A front-row seat to the sports you follow" onSeeAll={scrollToChannels} />
          {channelsQuery.isLoading ? (
            <div className="shimmer aspect-[4/5] w-[min(82vw,560px)] rounded-[28px] sm:aspect-[5/4]" />
          ) : activeHero ? (
            <>
              <div ref={heroCarouselRef} onScroll={handleHeroScroll} className="relative -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-0">
                {heroSlides.map((channel) => (
                  <div key={channel.id} className="shrink-0 snap-start">
                    <SportsHero channel={channel} onWatch={chooseChannel} favorite={favoriteIds.includes(channel.id)} onFavorite={toggleFavorite} onTouchPause={setHeroPaused} />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-center gap-1.5" aria-label="Featured channel slides">
                {heroSlides.map((channel, index) => (
                  <button key={channel.id} type="button" onClick={() => setHeroIndex(index)} aria-label={"Show featured channel " + (index + 1)} aria-current={heroIndex === index ? "true" : undefined} className="press grid size-8 place-items-center rounded-full">
                    <span className={cn("h-1.5 rounded-full transition-all duration-200", heroIndex === index ? "w-6 bg-primary" : "w-1.5 bg-border opacity-40 dark:bg-white/55")} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex aspect-[4/5] max-h-[420px] items-end rounded-[28px] bg-[#29221d] p-6 text-white shadow-card">
              <div><p className="text-sm font-semibold">No featured channel yet</p><p className="mt-1 text-xs text-white/70">Try another sport or search.</p></div>
            </div>
          )}
        </section>

        <CategoryChips
          options={CATEGORY_CHIPS}
          value={search.trim() ? "query:" + search.trim().toLowerCase() : "filter:" + filter}
          onChange={(value) => {
            if (value.startsWith("query:")) { setFilter("All Sports"); setSearch(value.slice(6)); }
            else { setFilter((value.slice(7) || "All Sports") as SportFilter); setSearch(""); }
          }}
          loading={channelsQuery.isLoading}
          ariaLabel="Sports categories"
          sticky
        />
        <NetworkChips search={search} onSelect={selectNetwork} loading={channelsQuery.isLoading} />

        {selected ? (
          <section ref={playerRef} className="scroll-mt-[calc(5rem+env(safe-area-inset-top))] space-y-3" aria-label="Sports channel player">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Now selected</p>
                <h2 className="truncate font-display text-lg font-bold">{getChannelDisplayName(selected)}</h2>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} className="press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:text-foreground">
                <X className="size-3.5" /> Close player
              </button>
            </div>
            <div className="overflow-hidden rounded-[18px] bg-black shadow-[0_18px_44px_-24px_rgba(0,0,0,0.62)]">
              <NativeVideoPlayer
                key={selected.id}
                streamUrl={selected.streamUrl}
                nativeStreamUrl={selected.id === "wwe-superstar-central"
                  ? "/api/tv/stream?provider=iptv-org&channel=" + encodeURIComponent(selected.id)
                  : "/api/tv/stream?provider=" + (selected.provider || "nexus") + "&channel=" + encodeURIComponent(selected.id)}
                externalPoster={selected.logo} title={getChannelDisplayName(selected)} liveTv
                className="aspect-video w-full rounded-none"
              />
            </div>
            <ChannelGuide channelId={selected.id} />
          </section>
        ) : null}

        {!channelsQuery.isLoading && !channelsQuery.isError && channels.length ? (
          <section className="space-y-4" aria-label="Popular sports channels">
            <SectionHeader title="Popular now" subtitle="A quick pick from the sports lineup" onSeeAll={scrollToChannels} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {popularChannels.map((channel, index) => <ChannelCard key={"popular-" + channel.id} channel={channel} active={selectedId === channel.id} index={index} onSelect={chooseChannel} />)}
            </div>
          </section>
        ) : null}

        <section ref={channelsGridRef} className="scroll-mt-[calc(5rem+env(safe-area-inset-top))] space-y-4" aria-label="All sports channels">
          <SectionHeader
            title="All channels"
            subtitle={channelsQuery.isLoading ? "Finding your sports lineup…" : channels.length + (channels.length === 1 ? " channel available" : " channels available")}
            onSeeAll={() => document.getElementById("xsports-top")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
          {channelsQuery.isFetching && !channelsQuery.isLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Updating sports lineup</div> : null}
          {channelsQuery.isLoading ? <ChannelGridSkeleton /> : channelsQuery.isError ? (
            <div className="rounded-[24px] border border-border bg-card p-7 text-center shadow-card">
              <Radio className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-bold">Sports channels couldn't load</p>
              <p className="mt-1 text-xs text-muted-foreground">{channelsQuery.error instanceof Error ? channelsQuery.error.message : "Please try again."}</p>
              <button type="button" onClick={() => void channelsQuery.refetch()} className="press mt-4 min-h-11 rounded-full bg-primary px-5 text-xs font-bold text-primary-foreground">Try again</button>
            </div>
          ) : channels.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {channels.map((channel, index) => <ChannelCard key={channel.id} channel={channel} active={selectedId === channel.id} index={index} onSelect={chooseChannel} />)}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-border bg-card/70 px-5 py-12 text-center shadow-sm">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Search className="size-6" /></span>
              <p className="mt-4 font-display text-base font-bold">No matching sports channels</p>
              <p className="mt-1 text-sm text-muted-foreground">Try another sport or clear your search.</p>
              <button type="button" onClick={() => { setFilter("All Sports"); setSearch(""); }} className="press mt-5 min-h-11 rounded-full border border-border bg-card px-5 text-xs font-bold text-foreground hover:bg-secondary">Show all channels</button>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
