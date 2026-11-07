import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Heart, Loader2, Play, Radio, Search, Tv, X } from "lucide-react";
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

type HeroSport = "wrestling" | "football" | "basketball" | "tennis" | "golf" | "generic";

// Pexels: empty boxing ring, low-key gym lighting. https://www.pexels.com/photo/an-empty-boxing-ring-9968139/
// Pexels License: free commercial use; attribution is not required.
const WRESTLING_HERO_IMAGE = "/sports/wrestling.webp";
// Pexels: illuminated soccer stadium at night. https://www.pexels.com/photo/illuminated-soccer-stadium-at-night-28827841/
// Pexels License: free commercial use; attribution is not required.
const FOOTBALL_HERO_IMAGE = "/sports/football.webp";
// Pexels: basketball athlete going up for a dunk. https://www.pexels.com/photo/athlete-jumping-for-dunk-in-indoor-basketball-court-32877408/
// Pexels License: free commercial use; attribution is not required.
const BASKETBALL_HERO_IMAGE = "/sports/basketball.webp";
// Pexels: quiet tennis court with atmospheric night lighting. https://www.pexels.com/photo/quite-tennis-field-during-nighttime-793176/
// Pexels License: free commercial use; attribution is not required.
const TENNIS_HERO_IMAGE = "/sports/tennis.webp";
// Pexels: golf course at sunrise. https://www.pexels.com/photo/golfer-playing-at-golf-course-at-dawn-6256755/
// Pexels License: free commercial use; attribution is not required.
const GOLF_HERO_IMAGE = "/sports/golf.webp";
// Pexels: stadium floodlights at dusk. https://www.pexels.com/photo/stadium-floodlights-against-evening-sky-32471032/
// Pexels License: free commercial use; attribution is not required.
const GENERIC_HERO_IMAGE = "/sports/generic.webp";

const HERO_IMAGES: Record<HeroSport, string> = {
  wrestling: WRESTLING_HERO_IMAGE,
  football: FOOTBALL_HERO_IMAGE,
  basketball: BASKETBALL_HERO_IMAGE,
  tennis: TENNIS_HERO_IMAGE,
  golf: GOLF_HERO_IMAGE,
  generic: GENERIC_HERO_IMAGE,
};

const COUNTRY_FLAGS: Record<string, string> = {
  "united states": "🇺🇸", "united kingdom": "🇬🇧", nigeria: "🇳🇬",
  canada: "🇨🇦", "south africa": "🇿🇦", india: "🇮🇳", australia: "🇦🇺",
  france: "🇫🇷", germany: "🇩🇪", italy: "🇮🇹", spain: "🇪🇸",
  brazil: "🇧🇷", japan: "🇯🇵", netherlands: "🇳🇱", mexico: "🇲🇽",
  argentina: "🇦🇷", "new zealand": "🇳🇿", turkey: "🇹🇷", portugal: "🇵🇹",
};

function getCountryFlag(country?: string) {
  return country ? COUNTRY_FLAGS[country.trim().toLowerCase()] || "🌍" : "🌍";
}
function getQualityBadge(quality?: string | null) {
  const match = quality?.match(/\b(2160p|1440p|1080p|720p|576p|480p|4k|uhd|fhd|hd)\b/i);
  return match ? match[1].toLowerCase() : null;
}
function isArchiveChannel(channel: SportsChannel) {
  return channel.id === "wwe-superstar-central"
    || /archive|24\/7/i.test([...(channel.labels || []), channel.quality || ""].join(" "));
}
function getChannelInitials(channel: SportsChannel) {
  if (channel.id === "wwe-superstar-central") return "WWE";
  const words = channel.name.trim().split(/\s+/).filter(Boolean);
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
  if (isArchiveChannel(channel)) return "A dedicated home for wrestling fans, available around the clock.";
  return getChannelCategory(channel) + " coverage from " + (channel.country || "around the world") + ".";
}

const CATEGORY_CHIPS: Array<{ label: string; filter?: SportFilter; query?: string }> = [
  { label: "All", filter: "All Sports" },
  { label: "Football", filter: "Football" },
  { label: "Basketball", filter: "Basketball" },
  { label: "Tennis", filter: "Tennis" },
  { label: "Wrestling", query: "wrestling" },
  { label: "Golf", query: "golf" },
  { label: "Motorsport", filter: "Motorsport" },
  { label: "Rugby", filter: "Rugby" },
  { label: "Cricket", filter: "Cricket" },
  { label: "Boxing", filter: "Boxing" },
];
const NETWORKS = [
  { label: "ESPN", query: "espn", monogram: "E" },
  { label: "SuperSport", query: "supersport", monogram: "S" },
];

function SectionHeader({ title, subtitle, onSeeAll }: { title: string; subtitle?: string; onSeeAll: () => void }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <button type="button" onClick={onSeeAll} className="press inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-bold text-primary hover:bg-primary/10">
        See all <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
}

function CategoryChips({
  filter, search, onSelect, loading = false,
}: {
  filter: SportFilter; search: string;
  onSelect: (item: (typeof CATEGORY_CHIPS)[number]) => void;
  loading?: boolean;
}) {
  const isActive = (item: (typeof CATEGORY_CHIPS)[number]) => {
    if (item.query) return search.trim().toLowerCase() === item.query;
    return filter === item.filter && !search.trim();
  };
  return (
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-4 border-y border-border/70 bg-background/90 py-2 pl-4 pr-0 shadow-[0_8px_18px_-18px_rgba(50,34,24,0.3)] backdrop-blur-xl">
      <div className="relative">
        <div className="hide-scrollbar touch-pan-x flex gap-2 overflow-x-auto overscroll-x-contain pb-1 pr-8">
          {loading ? Array.from({ length: 6 }).map((_, index) => <span key={index} className="shimmer h-10 w-20 shrink-0 rounded-full" />) : CATEGORY_CHIPS.map((item) => (
            <button
              key={item.label} type="button" onClick={() => onSelect(item)}
              aria-pressed={isActive(item)}
              className={cn(
                "press min-h-11 shrink-0 rounded-full border px-4 text-xs font-bold transition-all duration-200",
                isActive(item) ? "border-primary bg-primary text-primary-foreground shadow-[0_5px_14px_rgba(181,83,47,0.22)]" : "border-border bg-card/85 text-muted-foreground hover:border-primary/45 hover:text-foreground",
              )}
            >{item.label}</button>
          ))}
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background via-background/80 to-transparent" />
      </div>
    </div>
  );
}

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

function ChannelStatusBadge({ channel, compact = false }: { channel: SportsChannel; compact?: boolean }) {
  const archive = isArchiveChannel(channel);
  return archive ? (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border border-white/20 bg-black/45 font-bold uppercase tracking-[0.12em] text-white shadow-sm backdrop-blur-md", compact ? "px-2 py-1 text-[8px]" : "px-2.5 py-1.5 text-[9px]")}>
      Archive 24/7
    </span>
  ) : (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-200/25 bg-[#a9342c] font-bold uppercase tracking-[0.14em] text-white shadow-sm", compact ? "px-2 py-1 text-[8px]" : "px-2.5 py-1.5 text-[9px]")}>
      <span className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" /> Live
    </span>
  );
}

function ChannelCard({ channel, active, index, onSelect }: {
  channel: SportsChannel; active: boolean; index: number; onSelect: (channel: SportsChannel) => void;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const quality = getQualityBadge(channel.quality);
  return (
    <button
      type="button" onClick={() => onSelect(channel)} aria-pressed={active}
      className={cn(
        "press rise group flex h-full min-w-0 flex-col rounded-[22px] border bg-card p-2.5 text-left shadow-[0_7px_22px_rgba(74,48,34,0.07)] transition-[transform,box-shadow,border-color] duration-200 active:scale-[0.97] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(74,48,34,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2",
        active ? "border-primary/60 ring-2 ring-primary/15" : "border-border/80",
      )}
      style={{ animationDelay: Math.min(index % 8, 7) * 36 + "ms" }}
    >
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-[16px] border border-[#e3d4c7] bg-[#eee4da] dark:border-[#51433b] dark:bg-[#302a26]">
        <div className="absolute left-2 top-2 z-20"><ChannelStatusBadge channel={channel} compact /></div>
        {quality ? <span className="absolute right-2 top-2 z-20 rounded-full border border-[#ded0c3] bg-[#fffaf4]/95 px-2 py-1 text-[8px] font-extrabold uppercase tracking-[0.1em] text-[#4d3a30] shadow-sm dark:border-white/15 dark:bg-[#282320]/90 dark:text-[#f5e9df]">{quality}</span> : null}
        <div className="absolute inset-x-0 bottom-0 top-9 grid place-items-center px-4 pb-3 pt-1">
          {channel.logo && !logoFailed ? (
            <img
              src={channel.logo} alt="" aria-hidden="true" loading="lazy" decoding="async"
              onLoad={() => setLogoLoaded(true)} onError={() => setLogoFailed(true)}
              className={cn("max-h-full max-w-full object-contain p-1 transition-opacity duration-300", logoLoaded ? "opacity-100" : "opacity-0")}
            />
          ) : (
            <span className="grid size-[60%] min-h-10 min-w-10 max-w-[112px] place-items-center rounded-[15px] border border-[#d9bda9] bg-gradient-to-br from-[#fff9f1] via-[#f0dfd1] to-[#d9bca8] px-2 text-center font-display text-[clamp(17px,4vw,26px)] font-bold text-[#7d402a] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-[#655247] dark:from-[#514139] dark:via-[#40332c] dark:to-[#332a25] dark:text-[#f4d8c6]">
              {getChannelInitials(channel)}
            </span>
          )}
        </div>
      </div>
      <div className="flex min-h-[86px] flex-1 flex-col justify-between gap-2 px-0.5 pb-0.5 pt-3">
        <div className="min-w-0">
          <p className="line-clamp-2 min-h-[2.5rem] text-[13px] font-bold leading-5 tracking-[-0.01em] text-card-foreground sm:text-sm">{channel.name}</p>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden text-[10px] leading-4 text-muted-foreground sm:text-[11px]">
            <span className="shrink-0" aria-hidden="true">{getCountryFlag(channel.country)}</span>
            <span className="min-w-0 truncate">{channel.country || "International"} · {getChannelCategory(channel)}</span>
          </p>
        </div>
        <div className="flex items-center justify-end pt-0.5">
          <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_5px_12px_rgba(181,83,47,0.22)] transition-transform duration-200 group-hover:scale-105">
            <Play className="ml-0.5 size-3.5 fill-current" />
          </span>
        </div>
      </div>
    </button>
  );
}

function SportsHero({ channel, onWatch, favorite, onFavorite, activeIndex, slideCount, onDot, onTouchPause }: {
  channel: SportsChannel; onWatch: (channel: SportsChannel) => void; favorite: boolean;
  onFavorite: (channel: SportsChannel) => void; activeIndex: number; slideCount: number;
  onDot: (index: number) => void; onTouchPause: (paused: boolean) => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const image = HERO_IMAGES[getSportKey(channel)];
  const quality = getQualityBadge(channel.quality);
  useEffect(() => {
    setPhotoFailed(false);
    setPhotoLoaded(false);
  }, [image]);

  return (
    <div>
      <div
        className="relative isolate aspect-[4/5] w-[min(86vw,560px)] max-w-full shrink-0 overflow-hidden rounded-[28px] bg-[#191614] shadow-[0_22px_50px_rgba(56,37,25,0.23)] sm:aspect-[5/4]"
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
              className={cn("xsports-hero-photo absolute inset-0 h-full w-full object-cover transition-opacity duration-700", photoLoaded ? "opacity-100" : "opacity-0")}
            />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,11,10,0.04)_0%,rgba(12,11,10,0.12)_30%,rgba(12,11,10,0.58)_62%,rgba(12,11,10,0.94)_100%)]" />
          <div className="absolute -bottom-16 -left-16 size-64 rounded-full bg-[#b5532f]/30 blur-[70px]" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/35 to-transparent" />
        </div>

        <div className="absolute left-4 right-4 top-4 z-10 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ChannelStatusBadge channel={channel} />
            {quality ? <span className="rounded-full border border-white/20 bg-black/30 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white shadow-sm backdrop-blur-md">{quality}</span> : null}
          </div>
          <div className="grid h-[76px] w-[38%] max-w-[164px] shrink-0 place-items-center">
            {channel.logo ? (
              <img src={channel.logo} alt={channel.name + " logo"} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.55)]" />
            ) : channel.id === "wwe-superstar-central" ? (
              <span className="-rotate-6 select-none font-sans text-[clamp(32px,9vw,58px)] font-black italic leading-none tracking-[-0.13em] text-white drop-shadow-[0_8px_20px_rgba(0,0,0,0.75)]">WWE</span>
            ) : null}
          </div>
        </div>

        <div className="absolute inset-x-5 bottom-5 z-10 flex flex-col items-start">
          <h2 className="line-clamp-2 max-w-full font-display text-[30px] font-bold leading-[1.02] tracking-[-0.045em] text-white sm:text-[32px]">{channel.name}</h2>
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
      <div className="mt-2.5 flex items-center justify-center gap-1.5" aria-label="Featured channel slides">
        {Array.from({ length: slideCount }).map((_, index) => (
          <button key={index} type="button" onClick={() => onDot(index)} aria-label={"Show featured channel " + (index + 1)} aria-current={activeIndex === index ? "true" : undefined} className="press grid size-8 place-items-center rounded-full">
            <span className={cn("h-1.5 rounded-full transition-all duration-200", activeIndex === index ? "w-6 bg-primary" : "w-1.5 bg-border dark:bg-white/35")} />
          </button>
        ))}
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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => setHeroIndex((index) => (index + 1) % heroSlides.length), 6000);
    return () => window.clearInterval(interval);
  }, [heroPaused, heroSlides.length]);

  const activeHero = heroSlides[heroIndex] || featured;
  const chooseChannel = (channel: SportsChannel) => {
    setSelectedId(channel.id);
    requestAnimationFrame(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const scrollToChannels = () => channelsGridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const selectCategory = (item: (typeof CATEGORY_CHIPS)[number]) => {
    if (item.query) { setFilter("All Sports"); setSearch(item.query); }
    else { setFilter(item.filter || "All Sports"); setSearch(""); }
  };
  const selectNetwork = (query: string) => { setFilter("All Sports"); setSearch(query); };
  const toggleFavorite = (channel: SportsChannel) => {
    setFavoriteIds((current) => current.includes(channel.id) ? current.filter((id) => id !== channel.id) : [...current, channel.id]);
  };
  const popularChannels = channels.slice(0, 4);

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
            <div className="shimmer aspect-[4/5] w-[min(86vw,560px)] rounded-[28px] sm:aspect-[5/4]" />
          ) : activeHero ? (
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
              {heroSlides.map((channel) => (
                <div key={channel.id} className="snap-start">
                  <SportsHero
                    channel={channel} onWatch={chooseChannel}
                    favorite={favoriteIds.includes(channel.id)} onFavorite={toggleFavorite}
                    activeIndex={heroIndex} slideCount={heroSlides.length} onDot={setHeroIndex}
                    onTouchPause={setHeroPaused}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex aspect-[4/5] max-h-[420px] items-end rounded-[28px] bg-[#29221d] p-6 text-white shadow-card">
              <div><p className="text-sm font-semibold">No featured channel yet</p><p className="mt-1 text-xs text-white/70">Try another sport or search.</p></div>
            </div>
          )}
        </section>

        <CategoryChips filter={filter} search={search} onSelect={selectCategory} loading={channelsQuery.isLoading} />
        <NetworkChips search={search} onSelect={selectNetwork} loading={channelsQuery.isLoading} />

        {selected ? (
          <section ref={playerRef} className="scroll-mt-[calc(5rem+env(safe-area-inset-top))] space-y-3" aria-label="Sports channel player">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Now selected</p>
                <h2 className="truncate font-display text-lg font-bold">{selected.name}</h2>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} className="press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:text-foreground">
                <X className="size-3.5" /> Close player
              </button>
            </div>
            <div className="overflow-hidden rounded-[22px] border border-border bg-ink shadow-card">
              <NativeVideoPlayer
                key={selected.id}
                streamUrl={selected.streamUrl}
                nativeStreamUrl={selected.id === "wwe-superstar-central"
                  ? "/api/tv/stream?provider=iptv-org&channel=" + encodeURIComponent(selected.id)
                  : "/api/tv/stream?provider=" + (selected.provider || "nexus") + "&channel=" + encodeURIComponent(selected.id)}
                externalPoster={selected.logo} title={selected.name} liveTv
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
