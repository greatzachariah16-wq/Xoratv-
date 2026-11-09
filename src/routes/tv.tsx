import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  Clock3,
  Radio,
  RefreshCw,
  Search,
  WifiOff,
  Heart,
  Share2,
  RotateCw,
} from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CpxLiveTvGate } from "@/components/commerce/CpxLiveTvGate";
import {
  formatMetadataLabel,
  getChannelDisplayName,
  getChannelQuality,
  getCountryFlag,
  getCountryName,
} from "@/components/xora/XSportsComponents";
import {
  addNativeVlcStateListener,
  closeNativeVlc,
  isNativeVlcPlatform,
  openNativeVlc,
  switchNativeVlcChannel,
  retryNativeVlc,
  type NativeVlcStateChangedEvent,
  type NativeVlcStatus,
} from "@/lib/native-vlc";
import { usePlayerPrefs } from "@/hooks/usePlayerPrefs";
import { useLandscapeMode } from "@/hooks/useOrientation";
import "@/styles/tv-live.css";

type Channel = {
  id: string;
  name: string;
  logo?: string;
  country?: string;
  categories: string[];
  streamUrl: string;
  quality?: string | null;
  labels: string[];
  score?: number;
  provider?: "nexus" | "iptv-org";
};

type Programme = {
  id: string;
  title: string;
  description?: string;
  start: string;
  stop: string;
  isLive: boolean;
};

type CachedChannelList = {
  savedAt: number;
  channels: Channel[];
};

const CACHE_DB = "xoratv-live-tv";
const CACHE_STORE = "channel-lists";
const CACHE_VERSION = 1;

function cacheKey(query: string, category: string) {
  return query || category
    ? "filtered:" + category + ":" + query.trim().toLowerCase()
    : "all";
}

function openChannelCache(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(CACHE_DB, CACHE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CACHE_STORE)) {
        database.createObjectStore(CACHE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function writeChannelCache(key: string, channels: Channel[]) {
  const database = await openChannelCache();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(CACHE_STORE, "readwrite");
    transaction.objectStore(CACHE_STORE).put(
      { savedAt: Date.now(), channels } satisfies CachedChannelList,
      key,
    );
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
  database.close();
}

async function readChannelCache(key: string): Promise<Channel[] | null> {
  const database = await openChannelCache();
  if (!database) return null;
  const result = await new Promise<CachedChannelList | undefined>((resolve) => {
    const request = database.transaction(CACHE_STORE, "readonly")
      .objectStore(CACHE_STORE)
      .get(key);
    request.onsuccess = () => resolve(request.result as CachedChannelList | undefined);
    request.onerror = () => resolve(undefined);
  });
  database.close();
  return Array.isArray(result?.channels) ? result.channels : null;
}

async function loadChannels(query: string, category: string): Promise<Channel[]> {
  const params = new URLSearchParams({ limit: "10000" });
  if (query.trim()) params.set("q", query.trim());
  if (category) params.set("category", category);
  const key = cacheKey(query, category);

  try {
    const response = await fetch("/api/tv/channels?" + params.toString());
    if (!response.ok) throw new Error("Unable to load live channels");
    const data = (await response.json()) as { ok?: boolean; channels?: Channel[] };
    const channels = Array.isArray(data.channels) ? data.channels : [];
    await writeChannelCache(key, channels);
    if (!query.trim() && !category) await writeChannelCache("all", channels);
    return channels;
  } catch (error) {
    const cached = await readChannelCache(key)
      || await readChannelCache("all");
    if (!cached) throw error;

    const normalizedQuery = query.trim().toLowerCase();
    return cached.filter((channel) => {
      const matchesQuery = !normalizedQuery
        || channel.name.toLowerCase().includes(normalizedQuery)
        || channel.country?.toLowerCase().includes(normalizedQuery)
        || channel.categories.some((item) => item.toLowerCase().includes(normalizedQuery));
      const matchesCategory = !category
        || channel.categories.some((item) => item.toLowerCase() === category.toLowerCase());
      return matchesQuery && matchesCategory;
    });
  }
}

const STATE_LABELS: Record<NativeVlcStatus, string> = {
  IDLE: "Choose a channel to begin",
  OFFLINE: "You're offline. Playback resumes automatically.",
  CONNECTING: "Connecting to channel",
  BUFFERING: "Buffering",
  PLAYING: "Playing live",
  ERR_REGION: "Not available in your region",
  ERR_CHANNEL_DOWN: "Channel is offline",
  ERR_TIMEOUT: "Network too slow",
  ERR_UNKNOWN: "Unable to play this channel",
};


type TvFilter = "all" | "favourites" | "recent";

type ChannelRowProps = {
  channel: Channel;
  selected: boolean;
  favorite: boolean;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (channelId: string) => void;
};

const ChannelRow = memo(function ChannelRow({ channel, selected, favorite, onSelect, onToggleFavorite }: ChannelRowProps) {
  const quality = getChannelQuality(channel);
  return (
    <div className={"xora-tv-channel-row " + (selected ? "is-selected" : "")} data-channel-id={channel.id}>
      <button type="button" className="xora-tv-channel-select" onClick={() => onSelect(channel)} aria-pressed={selected} aria-label={"Play " + getChannelDisplayName(channel)}>
        <span className="xora-tv-row-logo">
          {channel.logo ? <img src={channel.logo} alt="" width={48} height={48} loading="lazy" decoding="async" /> : <span>{getChannelDisplayName(channel).slice(0, 2).toUpperCase()}</span>}
        </span>
        <span className="xora-tv-row-copy">
          <strong>{getChannelDisplayName(channel)}</strong>
          <small>{getCountryFlag(channel.country)} {getCountryName(channel.country)}</small>
        </span>
        <span className="xora-tv-live-pill"><i /> LIVE</span>
        {quality ? <span className="xora-tv-quality-pill">{quality}</span> : null}
      </button>
      <button type="button" className="xora-tv-favorite" onClick={() => onToggleFavorite(channel.id)} aria-label={favorite ? "Remove from favourites" : "Add to favourites"} aria-pressed={favorite}>
        <Heart className={favorite ? "fill-current text-primary" : ""} aria-hidden="true" />
      </button>
    </div>
  );
});

function ChannelRows({ channels, selectedId, favorites, onSelect, onToggleFavorite }: {
  channels: Channel[];
  selectedId?: string;
  favorites: string[];
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (channelId: string) => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const virtualized = channels.length > 60;
  const rowHeight = 72;
  const start = virtualized ? Math.max(0, Math.floor(scrollTop / rowHeight) - 6) : 0;
  const end = virtualized ? Math.min(channels.length, Math.ceil((scrollTop + 600) / rowHeight) + 6) : channels.length;

  useEffect(() => {
    if (!selectedId || !virtualized) return;
    const index = channels.findIndex((channel) => channel.id === selectedId);
    if (index < 0) return;
    const nextTop = Math.max(0, index * rowHeight - 160);
    if (viewportRef.current) viewportRef.current.scrollTop = nextTop;
    setScrollTop(nextTop);
  }, [channels, selectedId, virtualized]);

  return (
    <div ref={viewportRef} className="xora-tv-channel-list-viewport" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} aria-label="Live TV channels">
      {virtualized ? <div aria-hidden="true" style={{ height: start * rowHeight }} /> : null}
      {channels.slice(start, end).map((channel) => (
        <ChannelRow key={channel.id} channel={channel} selected={selectedId === channel.id} favorite={favorites.includes(channel.id)} onSelect={onSelect} onToggleFavorite={onToggleFavorite} />
      ))}
      {virtualized ? <div aria-hidden="true" style={{ height: (channels.length - end) * rowHeight }} /> : null}
    </div>
  );
}

function LiveTvPage() {
  const { channel: requestedChannel, q, filter = "all", category, country } = Route.useSearch();
  const { isLandscape, lockLandscape, unlockOrientation } = useLandscapeMode();
  const navigate = useNavigate({ from: "/tv" });
  const [search, setSearch] = useState(q || "");
  const playerPrefs = usePlayerPrefs();
  const nativePlayerOpenRef = useRef(false);
  const nativePlayerTaskRef = useRef<Promise<void> | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [nativeState, setNativeState] = useState<NativeVlcStateChangedEvent>({
    state: "IDLE",
    channelId: "",
    message: STATE_LABELS.IDLE,
  });
  const selectedIdRef = useRef("");
  const lastChannelTapAtRef = useRef(0);
  const selectChannel = useCallback((channel: Channel) => {
    const now = Date.now();
    if (now - lastChannelTapAtRef.current < 250) return;
    lastChannelTapAtRef.current = now;
    playerPrefs.rememberChannel(channel.id);
    void navigate({ search: (previous) => ({ ...previous, channel: channel.id }), resetScroll: false });
  }, [navigate, playerPrefs.rememberChannel]);
  const toggleFavorite = useCallback((channelId: string) => playerPrefs.toggleFavorite(channelId), [playerPrefs.toggleFavorite]);

  useEffect(() => {
    const updateNetwork = () => setIsOnline(navigator.onLine);
    updateNetwork();
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    return () => {
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
    };
  }, []);

  const query = useQuery({
    queryKey: ["iptv-org-live-tv-page"],
    queryFn: () => loadChannels("", ""),
    staleTime: 60_000,
    refetchInterval: isOnline && nativeState.state !== "OFFLINE" ? 5 * 60_000 : false,
    refetchOnWindowFocus: isOnline && nativeState.state !== "OFFLINE",
    retry: (failureCount) => isOnline && nativeState.state !== "OFFLINE" && failureCount < 3,
  });

  const selected = useMemo(
    () => requestedChannel ? query.data?.find((item) => item.id === requestedChannel) || null : null,
    [query.data, requestedChannel],
  );
  selectedIdRef.current = selected?.id
    && nativeState.channelId === selected.id
    && nativeState.state !== "IDLE"
    ? selected.id
    : "";

  // On Android, trust the native player's network assessment once it has reported
  // a state for the selected channel. A failed channel-list/API request is not proof
  // that the phone itself is offline.
  const nativeNetworkStatusAvailable = isNativeVlcPlatform()
    && nativeState.channelId === selected?.id
    && nativeState.state !== "IDLE";
  const isOffline = nativeNetworkStatusAvailable
    ? nativeState.state === "OFFLINE"
    : !isOnline;

  useEffect(() => {
    let mounted = true;
    let listenerHandle: { remove(): Promise<void> } | null = null;
    void addNativeVlcStateListener((event) => {
      if (!mounted) return;
      if (!event.channelId || event.channelId === selectedIdRef.current) {
        setNativeState(event);
      }
    }).then((handle) => {
      if (!mounted) void handle.remove();
      else listenerHandle = handle;
    }).catch((error) => {
      console.warn("[Xora TV] Native state listener unavailable:", error);
    });

    return () => {
      mounted = false;
      if (listenerHandle) void listenerHandle.remove();
    };
  }, []);

  useEffect(() => {
    setSearch(q || "");
  }, [q]);

  useEffect(() => {
    if (selected) playerPrefs.rememberChannel(selected.id);
  }, [selected?.id, playerPrefs.rememberChannel]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQuery = search.trim();
      if (nextQuery !== (q || "")) {
        void navigate({ search: (previous) => ({ ...previous, q: nextQuery || undefined }), replace: true, resetScroll: false });
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, q, navigate]);

  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      const closeWhenReady = () => {
        if (nativePlayerOpenRef.current) {
          nativePlayerOpenRef.current = false;
          void closeNativeVlc().catch(() => {});
        }
      };
      const pendingTask = nativePlayerTaskRef.current;
      if (pendingTask) void pendingTask.catch(() => {}).then(closeWhenReady);
      else closeWhenReady();
      return () => { cancelled = true; };
    }
    if (!isNativeVlcPlatform()) {
      setNativeState({
        state: "IDLE",
        channelId: selected.id,
        message: "Watch live channels in the XoraTV Android app.",
      });
      return () => { cancelled = true; };
    }

    const streamUrl = `/api/tv/stream?provider=${selected.provider || "nexus"}&channel=${encodeURIComponent(selected.id)}`;
    setNativeState({
      state: isOnline ? "CONNECTING" : "OFFLINE",
      channelId: selected.id,
      message: isOnline ? STATE_LABELS.CONNECTING : STATE_LABELS.OFFLINE,
    });

    const previousTask = nativePlayerTaskRef.current;
    const task = (async () => {
      if (previousTask) await previousTask.catch(() => {});
      if (cancelled) return;
      const openOrSwitch = nativePlayerOpenRef.current ? switchNativeVlcChannel : openNativeVlc;
      await openOrSwitch({
        url: streamUrl,
        title: getChannelDisplayName(selected),
        channelId: selected.id,
      });
      nativePlayerOpenRef.current = true;
    })();
    nativePlayerTaskRef.current = task;
    void task.catch((error: unknown) => {
      if (cancelled) return;
      console.error("[Xora TV] Native channel open failed:", error);
      setNativeState({
        state: "ERR_UNKNOWN",
        channelId: selected.id,
        message: STATE_LABELS.ERR_UNKNOWN,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.provider, selected?.name, isOnline]);

  useEffect(() => () => {
    const pendingTask = nativePlayerTaskRef.current;
    const closePlayer = () => {
      if (nativePlayerOpenRef.current) {
        nativePlayerOpenRef.current = false;
        void closeNativeVlc().catch(() => {});
      }
    };
    if (pendingTask) void pendingTask.catch(() => {}).then(closePlayer);
    else closePlayer();
  }, []);

  useEffect(() => {
    if (nativeState.state === "IDLE") {
      document.documentElement.classList.remove("xora-tv-header-hidden");
    }
  }, [nativeState.state]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("xora-tv-page-open");
    let lastY = window.scrollY;
    let accumulatedScroll = 0;
    let previousDirection = 0;
    const onScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastY;
      lastY = currentY;

      if (currentY < 24) {
        accumulatedScroll = 0;
        previousDirection = 0;
        root.classList.remove("xora-tv-header-hidden");
        return;
      }
      if (Math.abs(delta) < 1) return;

      const direction = delta > 0 ? 1 : -1;
      if (direction !== previousDirection) accumulatedScroll = 0;
      previousDirection = direction;
      accumulatedScroll += delta;

      // Ignore tiny scroll jitter. Hide only after a meaningful downward gesture
      // and reveal with a shorter upward gesture so channel browsing feels steady.
      if (direction > 0 && accumulatedScroll >= 24 && selectedIdRef.current) {
        root.classList.add("xora-tv-header-hidden");
        accumulatedScroll = 0;
      } else if (direction < 0 && accumulatedScroll <= -16) {
        root.classList.remove("xora-tv-header-hidden");
        accumulatedScroll = 0;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.classList.remove("xora-tv-page-open", "xora-tv-header-hidden");
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const guide = useQuery({
    queryKey: ["iptv-nexus-guide", selected?.id],
    queryFn: async () => {
      if (!selected) return [] as Programme[];
      const response = await fetch(`/api/tv/guide?channel=${encodeURIComponent(selected.id)}&hours=12`);
      if (!response.ok) return [] as Programme[];
      const data = (await response.json()) as { programmes?: Programme[] };
      return Array.isArray(data.programmes) ? data.programmes : [];
    },
    enabled: Boolean(selected) && isOnline,
    staleTime: 5 * 60_000,
    refetchInterval: isOnline ? 5 * 60_000 : false,
  });

  const nowProgramme = guide.data?.find((item) => item.isLive) || guide.data?.[0] || null;
  const upcomingProgrammes = (guide.data || []).filter((item) => item.id !== nowProgramme?.id).slice(0, 8);
  const state = nativeState.channelId === selected?.id ? nativeState.state : isOffline ? "OFFLINE" : "CONNECTING";
  const stateMessage = nativeState.channelId === selected?.id
    ? nativeState.message || STATE_LABELS[nativeState.state]
    : isOffline ? STATE_LABELS.OFFLINE : STATE_LABELS.CONNECTING;

  const allChannels = query.data || [];
  const categoryOptions = useMemo(
    () => Array.from(new Set(allChannels.flatMap((channel) => channel.categories || []))).sort((a, b) => a.localeCompare(b)),
    [allChannels],
  );
  const countryOptions = useMemo(
    () => Array.from(new Set(allChannels.map((channel) => channel.country).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b)),
    [allChannels],
  );
  const visibleChannels = useMemo(() => {
    const normalizedQuery = (q || "").trim().toLowerCase();
    return allChannels.filter((channel) => {
      const matchesText = !normalizedQuery
        || channel.name.toLowerCase().includes(normalizedQuery)
        || (channel.country || "").toLowerCase().includes(normalizedQuery)
        || channel.categories.some((item) => item.toLowerCase().includes(normalizedQuery));
      const matchesCategory = !category
        || channel.categories.some((item) => item.toLowerCase() === category.toLowerCase());
      const matchesCountry = !country || channel.country === country;
      const matchesMode = filter === "favourites"
        ? playerPrefs.favorites.includes(channel.id)
        : filter === "recent"
          ? playerPrefs.recent.includes(channel.id)
          : true;
      return matchesText && matchesCategory && matchesCountry && matchesMode;
    });
  }, [allChannels, q, category, country, filter, playerPrefs.favorites, playerPrefs.recent]);

  const favoriteChannels = useMemo(
    () => playerPrefs.favorites.map((id) => allChannels.find((channel) => channel.id === id)).filter((channel): channel is Channel => Boolean(channel)),
    [allChannels, playerPrefs.favorites],
  );
  const recentChannels = useMemo(
    () => playerPrefs.recent.map((id) => allChannels.find((channel) => channel.id === id)).filter((channel): channel is Channel => Boolean(channel)).slice(0, 10),
    [allChannels, playerPrefs.recent],
  );

  const renderChannelRail = (title: string, channels: Channel[]) => channels.length ? (
    <section className="xora-tv-rail" aria-label={title}>
      <div className="xora-tv-section-heading"><h2>{title}</h2><p>{channels.length} saved</p></div>
      <div className="hide-scrollbar xora-tv-rail-track">
        {channels.map((channel) => (
          <button key={channel.id} type="button" className="xora-tv-rail-card" onClick={() => selectChannel(channel)}>
            <span className="xora-tv-rail-logo">
              {channel.logo ? <img src={channel.logo} alt="" width={44} height={44} loading="lazy" /> : <span>{getChannelDisplayName(channel).slice(0, 2).toUpperCase()}</span>}
            </span>
            <span className="xora-tv-rail-name">{getChannelDisplayName(channel)}</span>
            <span className="xora-tv-live-pill"><i /> LIVE</span>
          </button>
        ))}
      </div>
    </section>
  ) : null;

  const handleRetry = useCallback(() => {
    void retryNativeVlc().catch((error) => console.warn("[Xora TV] Retry unavailable:", error));
  }, []);
  const handleNextChannel = useCallback(() => {
    if (!selected || allChannels.length === 0) return;
    const currentIndex = allChannels.findIndex((channel) => channel.id === selected.id);
    const nextChannel = allChannels[(currentIndex + 1) % allChannels.length];
    if (nextChannel) selectChannel(nextChannel);
  }, [allChannels, selected, selectChannel]);
  const shareSelected = useCallback(async () => {
    if (!selected) return;
    const url = window.location.origin + "/tv?channel=" + encodeURIComponent(selected.id);
    try {
      if (navigator.share) await navigator.share({ title: getChannelDisplayName(selected), url });
      else if (navigator.clipboard) await navigator.clipboard.writeText(url);
    } catch {
      // Sharing can be dismissed by the user.
    }
  }, [selected]);

  const formatTime = (value: string) => {
    try {
      return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
    } catch {
      return value;
    }
  };

  return (
    <AppShell>
      <CpxLiveTvGate>
        <div className={isLandscape ? "xora-tv-page is-landscape" : "xora-tv-page"}>
          <header className="xora-tv-heading">
            <div className="xora-tv-heading-title">
              <span className="xora-tv-heading-icon"><Radio aria-hidden="true" /></span>
              <div>
                <h1>Live TV</h1>
                <p>Browse live channels and see what’s playing now.</p>
              </div>
            </div>
            <div className="xora-tv-tools">
              <div className="xora-tv-search">
                <Search aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search channels..."
                  aria-label="Search live channels"
                />
              </div>
              <Button type="button" variant="outline" className="xora-tv-refresh" onClick={() => void (isLandscape ? unlockOrientation() : lockLandscape())} aria-label={isLandscape ? "Return to portrait" : "Rotate to landscape"}>
                <RotateCw className="size-4" aria-hidden="true" />
                <span>{isLandscape ? "Portrait" : "Landscape"}</span>
              </Button>
              <Button variant="outline" className="xora-tv-refresh" onClick={() => void query.refetch()} disabled={!isOnline}>
                <RefreshCw className="size-4" aria-hidden="true" />
                <span>Refresh</span>
              </Button>
            </div>
            <div className="xora-tv-filter-row hide-scrollbar">
              <Button type="button" size="sm" variant={filter === "all" && !category && !country ? "default" : "outline"} className="rounded-full shrink-0" onClick={() => void navigate({ search: (previous) => ({ ...previous, filter: undefined, category: undefined, country: undefined }), replace: true, resetScroll: false })}>All</Button>
              <Button type="button" size="sm" variant={filter === "favourites" ? "default" : "outline"} className="rounded-full shrink-0" onClick={() => void navigate({ search: (previous) => ({ ...previous, filter: "favourites" }), replace: true, resetScroll: false })}>Favourites</Button>
              <Button type="button" size="sm" variant={filter === "recent" ? "default" : "outline"} className="rounded-full shrink-0" onClick={() => void navigate({ search: (previous) => ({ ...previous, filter: "recent" }), replace: true, resetScroll: false })}>Recent</Button>
              {categoryOptions.map((item) => (
                <Button key={item} type="button" size="sm" variant={category === item ? "default" : "outline"} className="rounded-full shrink-0" onClick={() => void navigate({ search: (previous) => ({ ...previous, category: category === item ? undefined : item, country: undefined }), replace: true, resetScroll: false })}>{formatMetadataLabel(item)}</Button>
              ))}
              {countryOptions.map((item) => (
                <Button key={item} type="button" size="sm" variant={country === item ? "default" : "outline"} className="rounded-full shrink-0" onClick={() => void navigate({ search: (previous) => ({ ...previous, country: country === item ? undefined : item, category: undefined }), replace: true, resetScroll: false })}>{getCountryName(item)}</Button>
              ))}
              {isOffline ? <span className="xora-tv-offline-chip"><WifiOff aria-hidden="true" /> Offline · cached channels</span> : null}
            </div>      </div>
          </header>

          <div className="xora-tv-notice">
            <strong>Live TV notice:</strong> Some channels may be unavailable in your region or on your device. XoraTV only shows channels with streams compatible with our player.
          </div>

          {selected ? (
            <section className="xora-tv-now-card xora-tv-featured-card" aria-label="Selected live channel">
              <div className="xora-tv-now-topline">
                <span className="xora-tv-now-label">Now selected</span>
                <span className="xora-tv-live-pill"><i /> LIVE</span>
                <button type="button" className="xora-tv-favorite" onClick={() => toggleFavorite(selected.id)} aria-label={playerPrefs.favorites.includes(selected.id) ? "Remove from favourites" : "Add to favourites"} aria-pressed={playerPrefs.favorites.includes(selected.id)}><Heart className={playerPrefs.favorites.includes(selected.id) ? "fill-current text-primary" : ""} aria-hidden="true" /></button>
                <button type="button" className="xora-tv-favorite" onClick={() => void shareSelected()} aria-label="Share channel"><Share2 aria-hidden="true" /></button>
              </div>
              <div className="xora-tv-now-content">
                <div className="xora-tv-now-copy">
                  <h2>{getChannelDisplayName(selected)}</h2>
                  <p>{getCountryFlag(selected.country)} {getCountryName(selected.country)} <span>·</span> {getChannelQuality(selected) || "Live stream"}</p>
                  <div className="xora-tv-state-row" aria-live="polite">
                    <span className={`xora-tv-state-dot state-${state.toLowerCase()}`} />
                    <span>{state === "PLAYING" ? "Playing live" : stateMessage}</span>
                    <span className="sr-only">{state === "PLAYING" ? "Now playing " + getChannelDisplayName(selected) : ""}</span>
                  </div>
                </div>
                {selected.logo ? <img className="xora-tv-now-logo" src={selected.logo} alt="" width={64} height={64} /> : null}
              </div>
              {isOffline ? <p className="xora-tv-web-offline-note">You are offline. Playback resumes automatically.</p> : null}
              {state.startsWith("ERR") ? <div className="xora-tv-error-actions"><strong>Channel unavailable</strong><div><Button type="button" variant="outline" className="min-h-11 rounded-full" onClick={handleRetry}>Retry</Button><Button type="button" className="min-h-11 rounded-full" onClick={handleNextChannel}>Try next channel</Button></div></div> : null}
            </section>
          ) : (
            <section className="xora-tv-empty">
              <Radio aria-hidden="true" />
              <strong>{query.isLoading ? "Loading your channels" : "No playable channels found"}</strong>
              <span>{query.isError && !query.data?.length ? "Connect to the internet to refresh the channel list." : "Try another search or category."}</span>
            </section>
          )}

          {renderChannelRail("Recently watched", recentChannels)}
          {renderChannelRail("Favourites", favoriteChannels)}

          <section className="xora-tv-channel-section">
            <div className="xora-tv-section-heading">
              <div>
                <h2>All channels</h2>
                <p>{visibleChannels.length} channels available</p>
              </div>
              {isOffline ? <span className="xora-tv-offline-chip"><WifiOff aria-hidden="true" /> Cached list</span> : null}
            </div>

            {query.isLoading && !query.data ? (
              <div className="xora-tv-channel-list-viewport" aria-label="Loading live channels">
                {["channel-skeleton-1", "channel-skeleton-2", "channel-skeleton-3", "channel-skeleton-4", "channel-skeleton-5", "channel-skeleton-6", "channel-skeleton-7", "channel-skeleton-8"].map((key) => <div key={key} className="xora-tv-skeleton" />)}
              </div>
            ) : visibleChannels.length ? (
              <ChannelRows channels={visibleChannels} selectedId={selected?.id} favorites={playerPrefs.favorites} onSelect={selectChannel} onToggleFavorite={toggleFavorite} />
            ) : (
              <div className="xora-tv-no-channels">
                {query.isError ? (
                  <>
                    <p>The channel list could not be refreshed.</p>
                    <Button type="button" variant="outline" className="mt-3 min-h-11 rounded-full" onClick={() => void query.refetch()}>Retry</Button>
                  </>
                ) : "No channels match these filters. Try another category or country."}
              </div>
            )}
          </section>

          {selected ? (
            <section className="xora-tv-guide">
              <div className="xora-tv-guide-heading">
                <CalendarClock aria-hidden="true" />
                <div>
                  <h2>TV Guide</h2>
                  <p>What’s playing now and what’s coming next</p>
                </div>
              </div>
              {nowProgramme ? (
                <div className="xora-tv-guide-body">
                  <article className="xora-tv-now-programme">
                    <span className="xora-tv-programme-kicker">Now playing</span>
                    <h3>{nowProgramme.title}</h3>
                    <p>{formatTime(nowProgramme.start)} – {formatTime(nowProgramme.stop)}</p>
                    {nowProgramme.description ? <p>{nowProgramme.description}</p> : null}
                  </article>
                  {upcomingProgrammes.length ? (
                    <div className="xora-tv-up-next">
                      <strong><Clock3 aria-hidden="true" /> Up next</strong>
                      {upcomingProgrammes.map((programme) => (
                        <div key={programme.id}>
                          <time>{formatTime(programme.start)}</time>
                          <span>{programme.title}</span>
                          <time>{formatTime(programme.stop)}</time>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="xora-tv-guide-empty">
                  {isOffline ? "The TV guide will refresh when you're back online." : guide.isLoading ? "Loading programme schedule..." : "No EPG schedule is available for this channel right now."}
                </p>
              )}
            </section>
          ) : null}
        </div>
      </CpxLiveTvGate>
    </AppShell>
  );
}

export const Route = createFileRoute("/tv")({
  validateSearch: (search: Record<string, unknown>) => ({
    channel: typeof search.channel === "string" ? search.channel : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
    filter: search.filter === "favourites" || search.filter === "recent" ? search.filter : "all" as TvFilter,
    category: typeof search.category === "string" ? search.category : undefined,
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Live TV | Xora" },
      { name: "description", content: "Watch live television, browse channels and see what is on now with XoraTV." },
    ],
  }),
  component: LiveTvPage,
});
