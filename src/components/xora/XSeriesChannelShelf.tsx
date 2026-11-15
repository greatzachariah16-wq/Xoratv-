import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Play, Tv } from "lucide-react";
import { NativeVideoPlayer } from "@/components/xora/VideoPlayer";
import { ChannelGuide } from "@/components/xora/ChannelGuide";
import { XSeriesMark } from "@/components/xora/XSeriesMark";
import { XoraInHouseAd } from "@/components/ads/XoraInHouseAd";
import { cn } from "@/lib/utils";
import "./xseries-channels.css";

type XSeriesLiveChannel = {
  id: string;
  name: string;
  logo?: string;
  country?: string;
  categories: string[];
  streamUrl: string;
  quality?: string | null;
  provider?: "iptv-org";
};

type ChannelResponse = { ok?: boolean; total?: number; channels?: XSeriesLiveChannel[]; error?: string };
type ShelfFilter = "All" | "Movies" | "Series" | "Action" | "Romance";

async function loadXSeriesChannels(): Promise<XSeriesLiveChannel[]> {
  const [movies, series] = await Promise.all([
    fetch("/api/tv/channels?category=movies&limit=100"),
    fetch("/api/tv/channels?category=series&limit=100"),
  ]);
  if (!movies.ok || !series.ok) throw new Error("Channel catalogue unavailable");
  const [movieData, seriesData] = await Promise.all([
    movies.json() as Promise<ChannelResponse>,
    series.json() as Promise<ChannelResponse>,
  ]);
  return [...(movieData.channels || []), ...(seriesData.channels || [])];
}

const FILTERS: ShelfFilter[] = ["All", "Movies", "Series", "Action", "Romance"];
const PAGE_SIZE = 24;

function channelType(channel: XSeriesLiveChannel) {
  return (channel.categories || []).includes("series") ? "SERIES" : "MOVIES";
}

function ChannelCard({
  channel,
  selected,
  showType,
  onSelect,
}: {
  channel: XSeriesLiveChannel;
  selected: boolean;
  showType: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Watch ${channel.name}`}
      className={cn("xsc-channel-card group", selected && "is-selected")}
    >
      <span className="xsc-channel-logo">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="xsc-logo-fallback">{channel.name.slice(0, 1).toUpperCase()}</span>
        )}
      </span>
      <span className="xsc-channel-title">{channel.name}</span>
      <span className="xsc-channel-meta">
        <span className="xsc-country">{channel.country || "Live channel"}</span>
        <span className="xsc-channel-meta-right">
          {showType ? <span className="xsc-type-chip">{channelType(channel)}</span> : null}
          {channel.quality ? <span className="xsc-quality-chip">{channel.quality}</span> : null}
          <span className="xsc-play-button" aria-hidden="true">
            <Play className="size-3.5 fill-current" />
          </span>
        </span>
      </span>
    </button>
  );
}

function ChannelCardSkeleton() {
  return (
    <div className="xsc-channel-skeleton" aria-hidden="true">
      <div className="xsc-skeleton-logo" />
      <div className="xsc-skeleton-line" />
      <div className="xsc-skeleton-meta" />
    </div>
  );
}

export function XSeriesChannelShelf({ onBackToLibrary }: { onBackToLibrary?: () => void }) {
  const [filter, setFilter] = useState<ShelfFilter>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const filterRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const query = useQuery({
    queryKey: ["xseries-iptv-movie-series-channels"],
    queryFn: loadXSeriesChannels,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  const channels = query.data || [];
  const visible = useMemo(
    () =>
      channels.filter((channel) => {
        const categories = channel.categories || [];
        const tags = [channel.name, ...categories].join(" ").toLowerCase();
        if (filter === "Movies") return categories.includes("movies");
        if (filter === "Series") return categories.includes("series");
        if (filter === "Action" || filter === "Romance") return tags.includes(filter.toLowerCase());
        return true;
      }),
    [channels, filter],
  );
  const selected = channels.find((channel) => channel.id === selectedId) || null;
  const shownChannels = visible.slice(0, visibleCount);
  const isInitialLoading = query.isLoading && channels.length === 0;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, channels.length]);

  useEffect(() => {
    filterRefs.current[filter]?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [filter]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || typeof IntersectionObserver === "undefined" || shownChannels.length >= visible.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => Math.min(current + PAGE_SIZE, visible.length));
        }
      },
      { rootMargin: "420px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [shownChannels.length, visible.length]);

  return (
    <section className="xseries-channels" aria-label="X-Series live channels">
      {onBackToLibrary ? (
        <div className="xsc-back-row">
          <button type="button" onClick={onBackToLibrary} className="xsc-back-button">
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Back to Movies &amp; Series</span>
          </button>
        </div>
      ) : null}

      <header className="xsc-header">
        <div className="xsc-brand">
          <XSeriesMark size="md" className="xsc-brand-mark" />
          <div className="xsc-heading-copy">
            <p className="xsc-eyebrow">XORA ENTERTAINMENT</p>
            <h2>X-Series Channels</h2>
            <div className="xsc-status" aria-live="polite">
              {isInitialLoading ? (
                <span className="xsc-status-skeleton" aria-label="Loading channel status" />
              ) : query.isError && channels.length === 0 ? (
                <span>Live television · temporarily unavailable</span>
              ) : (
                <>
                  <span className="xsc-live-dot" aria-hidden="true" />
                  <span>Live television · {channels.length} channels</span>
                </>
              )}
            </div>
          </div>
        </div>
        <span className="xsc-live-badge"><span className="xsc-live-dot" />Live TV</span>
      </header>

      <nav className="xsc-filter-rail" aria-label="Filter channels">
        <div className="xsc-filter-scroll">
          {FILTERS.map((item) => (
            <button
              key={item}
              ref={(node) => { filterRefs.current[item] = node; }}
              type="button"
              onClick={() => setFilter(item)}
              aria-pressed={filter === item}
              className={cn("xsc-filter-chip", filter === item && "is-active")}
            >
              {item}
            </button>
          ))}
        </div>
      </nav>

      <div className="xsc-main-column">
        <section className={cn("xsc-player-card", selected && "is-playing")} aria-label="Live channel player">
          <div className={cn("xsc-player-sticky", selected && "is-playing")}>
            <div className="xsc-player-frame">
              {selected ? (
                <NativeVideoPlayer
                  key={selected.id}
                  streamUrl={selected.streamUrl}
                  nativeStreamUrl={`/api/tv/stream?provider=iptv-org&channel=${encodeURIComponent(selected.id)}`}
                  externalPoster={selected.logo}
                  title={selected.name}
                  liveTv
                  className="aspect-video w-full"
                  onClose={() => setSelectedId(null)}
                />
              ) : (
                <div className="xsc-player-empty">
                  <span className="xsc-player-empty-icon"><Tv className="size-5" aria-hidden="true" /></span>
                  <div>
                    <p>Choose a channel to start watching</p>
                    <span>Select any channel below</span>
                  </div>
                </div>
              )}
            </div>
            {selected ? (
              <div className="xsc-now-playing">
                {selected.logo ? (
                  <img src={selected.logo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                ) : (
                  <span className="xsc-now-playing-fallback">{selected.name.slice(0, 1).toUpperCase()}</span>
                )}
                <div className="xsc-now-playing-copy">
                  <strong>{selected.name}</strong>
                  <span>{selected.country || "Live channel"} · {channelType(selected)}</span>
                </div>
                <span className="xsc-live-pill"><span className="xsc-live-dot" />LIVE</span>
              </div>
            ) : null}
          </div>
        </section>

        {selected ? (
          <ChannelGuide channelId={selected.id} variant="cinema" />
        ) : (
          <section className="xsc-guide-placeholder">
            <span className="xsc-guide-icon"><Tv className="size-4" aria-hidden="true" /></span>
            <div>
              <p className="xsc-section-label">PROGRAMME GUIDE</p>
              <span>Choose a channel to see what’s playing now and next.</span>
            </div>
          </section>
        )}
      </div>

      <section className="xsc-browse-section" aria-label="Browse channels">
        <div className="xsc-section-heading">
          <div>
            <p className="xsc-section-label">EXPLORE THE LINEUP</p>
            <h3>Browse channels</h3>
          </div>
          <span className="xsc-result-count">
            {isInitialLoading ? " " : query.isError && channels.length === 0 ? " " : `${visible.length} channels`}
          </span>
        </div>

        {isInitialLoading ? (
          <div className="xsc-channel-grid" role="list" aria-label="Loading channels">
            {Array.from({ length: 8 }).map((_, index) => <ChannelCardSkeleton key={index} />)}
          </div>
        ) : query.isError && channels.length === 0 ? (
          <div className="xsc-empty-state">Channels are temporarily unavailable. Please try again shortly.</div>
        ) : visible.length ? (
          <>
            <div className="xsc-channel-grid" role="list">
              {shownChannels.map((channel) => (
                <div key={channel.id} role="listitem">
                  <ChannelCard
                    channel={channel}
                    selected={selectedId === channel.id}
                    showType={filter === "All"}
                    onSelect={() => {
                      setSelectedId(channel.id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                </div>
              ))}
            </div>
            {shownChannels.length < visible.length ? (
              <div ref={loadMoreRef} className="xsc-load-more" aria-live="polite">
                <span className="xsc-load-more-dot" />
                <span>Loading more channels</span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="xsc-empty-state">No channels match this filter.</div>
        )}
      </section>

      <div className="xsc-ad-slot" aria-label="Sponsored content">
        <span className="xsc-sponsored-label">Sponsored</span>
        <XoraInHouseAd placement="xseries_feed" variant="banner" className="xsc-ad-content" />
      </div>
    </section>
  );
}
