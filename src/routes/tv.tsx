import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import {
  ArrowRight,
  CalendarClock,
  Clock3,
  Crown,
  Globe2,
  Radio,
  RefreshCw,
  Search,
  WifiOff,
  Heart,
  Share2,
  RotateCw,
} from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { LiveChannelEmptyStage, VideoPlayer } from "@/components/xora/VideoPlayer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CpxLiveTvGate } from "@/components/commerce/CpxLiveTvGate";
import {
  formatMetadataLabel,
  getChannelCountryCode,
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
  updateNativeVlcBounds,
  type NativeVlcStateChangedEvent,
  type NativeVlcStatus,
} from "@/lib/native-vlc";
import { usePlayerPrefs } from "@/hooks/usePlayerPrefs";
import { getCountryRankedGroups } from "@/lib/country-ranking";
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
  userAgent?: string;
  referrer?: string;
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
  params.set("platform", isNativeVlcPlatform() ? "native" : "web");
  if (query.trim()) params.set("q", query.trim());
  if (category) params.set("category", category);
  const cacheMode = isNativeVlcPlatform() ? "native" : "web";
  const key = cacheKey(query, category) + ":" + cacheMode;
  const allCacheKey = "all:" + cacheMode;

  try {
    const response = await fetch("/api/tv/channels?" + params.toString());
    if (!response.ok) throw new Error("Unable to load live channels");
    const data = (await response.json()) as { ok?: boolean; channels?: Channel[] };
    const channels = Array.isArray(data.channels) ? data.channels : [];
    await writeChannelCache(key, channels);
    if (!query.trim() && !category) await writeChannelCache(allCacheKey, channels);
    return channels;
  } catch (error) {
    const cached = await readChannelCache(key)
      || await readChannelCache(allCacheKey);
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
type RankedScope = "all" | "nigeria" | "africa" | "usa" | "uk" | "others";
const AFRICAN_COUNTRY_CODES = new Set(["DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CG","CD","CI","DJ","EG","GQ","ER","SZ","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG","MW","ML","MR","MU","MA","MZ","NA","NE","NG","RW","ST","SN","SC","SL","SO","ZA","SS","SD","TZ","TG","TN","UG","ZM","ZW"]);
function getRankedScope(country?: string): Exclude<RankedScope, "all"> {
  const code = getChannelCountryCode(country);
  if (code === "NG") return "nigeria";
  if (code && AFRICAN_COUNTRY_CODES.has(code)) return "africa";
  if (code === "US") return "usa";
  if (code === "GB") return "uk";
  return "others";
}

type ChannelRowProps = {
  channel: Channel;
  selected: boolean;
  favorite: boolean;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (channelId: string) => void;
};

// prettier-ignore
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

// prettier-ignore
function ChannelRows({ channels, selectedId, favorites, onSelect, onToggleFavorite }: {
  channels: Channel[];
  selectedId?: string;
  favorites: string[];
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (channelId: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(36);
  useEffect(() => { setVisibleCount(36); }, [channels]);
  return (
    <div className="xora-tv-channel-list-viewport" aria-label="Live TV channels">
      {channels.slice(0, visibleCount).map((channel) => (
        <ChannelRow key={channel.id} channel={channel} selected={selectedId === channel.id} favorite={favorites.includes(channel.id)} onSelect={onSelect} onToggleFavorite={onToggleFavorite} />
      ))}
      {visibleCount < channels.length ? (
        <button type="button" className="xora-tv-load-more" onClick={() => setVisibleCount((count) => Math.min(channels.length, count + 36))}>
          Show more channels <span>{Math.min(36, channels.length - visibleCount)} more</span>
        </button>
      ) : null}
    </div>
  );
}

// prettier-ignore
function LiveTvPage() {
  const { channel: requestedChannel, q, filter = "all", category, country } = Route.useSearch();
  const { isLandscape, lockLandscape, unlockOrientation } = useLandscapeMode();
  const navigate = useNavigate({ from: "/tv" });
  const [search, setSearch] = useState(q || "");
  // A channel in the URL restores navigation/filter context only; playback requires an explicit tap in this page session.
  const [activeChannelId, setActiveChannelId] = useState("");
  const [rankedScope, setRankedScope] = useState<RankedScope>("all");
  const playerPrefs = usePlayerPrefs();
  const nativePlayerOpenRef = useRef(false);
  const nativePlayerTaskRef = useRef<Promise<void> | null>(null);
  const playerDockRef = useRef<HTMLElement | null>(null);
  const nativeStageRef = useRef<HTMLDivElement | null>(null);
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
    setActiveChannelId(channel.id);
    playerPrefs.rememberChannel(channel.id);
    void navigate({ search: (previous) => ({ ...previous, channel: channel.id }), resetScroll: false });
  }, [navigate, playerPrefs.rememberChannel]);
  const toggleFavorite = useCallback((channelId: string) => playerPrefs.toggleFavorite(channelId), [playerPrefs.toggleFavorite]);

  useEffect(() => {
    let disposed = false;
    let interval = 0;
    let controller: AbortController | null = null;
    let networkListener: { remove: () => Promise<void> } | null = null;
    let reachabilityKnown = false;
    let reachable = true;
    const markReachable = () => {
      if (disposed) return;
      if (reachabilityKnown && !reachable) window.dispatchEvent(new Event("xora:network-online"));
      reachable = true;
      reachabilityKnown = true;
      setIsOnline(true);
    };
    const markUnreachable = () => {
      if (disposed) return;
      reachable = false;
      reachabilityKnown = true;
      setIsOnline(false);
    };
    const checkReachability = async () => {
      controller?.abort();
      const currentController = new AbortController();
      controller = currentController;
      const timeout = window.setTimeout(() => currentController.abort(), 6000);
      try {
        // Verify internet reachability independently of WebView navigator.onLine.
        await fetch("https://www.gstatic.com/generate_204", { mode: "no-cors", cache: "no-store", signal: currentController.signal });
        markReachable();
      } catch {
        // Some networks block third-party probes; confirm against XoraTV's own health endpoint.
        const fallbackController = new AbortController();
        controller = fallbackController;
        const fallbackTimeout = window.setTimeout(() => fallbackController.abort(), 6000);
        try {
          const response = await fetch("/api/health", { cache: "no-store", signal: fallbackController.signal });
          if (!response.ok) throw new Error("Reachability probe failed");
          markReachable();
        } catch {
          markUnreachable();
        } finally { window.clearTimeout(fallbackTimeout); }
      } finally { window.clearTimeout(timeout); }
    };
    const onOnline = () => { void checkReachability(); };
    const onOffline = () => { void checkReachability(); };
    const onCapacitorNetworkChange = (status: { connected: boolean }) => {
      if (disposed) return;
      if (Capacitor.isNativePlatform() && !status.connected) {
        markUnreachable();
        return;
      }
      void checkReachability();
    };
    void Network.getStatus().then(onCapacitorNetworkChange).catch(() => { void checkReachability(); });
    void Network.addListener("networkStatusChange", onCapacitorNetworkChange).then((handle) => {
      if (disposed) void handle.remove();
      else networkListener = handle;
    }).catch(() => {});
    void checkReachability();
    interval = window.setInterval(() => { void checkReachability(); }, 25_000);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      controller?.abort();
      if (networkListener) void networkListener.remove();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
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
    () => activeChannelId ? query.data?.find((item) => item.id === activeChannelId) || null : null,
    [query.data, activeChannelId],
  );
  selectedIdRef.current = selected?.id
    && nativeState.channelId === selected.id
    && nativeState.state !== "IDLE"
    ? selected.id
    : "";

  // Offline is determined by the Capacitor connection signal plus the independent
  // reachability probes, never by an individual channel or stream failure.
  const isOffline = !isOnline;

  useEffect(() => {
    let mounted = true;
    let listenerHandle: { remove(): Promise<void> } | null = null;
    void addNativeVlcStateListener((event) => {
      if (!mounted) return;
      if (!event.channelId || event.channelId === selectedIdRef.current) {
        setNativeState(event);
      }
      if (event.transport === "proxy" && event.channelId) {
        void fetch("/api/tv/playback-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId: event.channelId, transport: "proxy" }),
        }).catch(() => {});
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
          document.documentElement.classList.remove("xora-tv-player-open");
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

    setNativeState({
      state: isOnline ? "CONNECTING" : "OFFLINE",
      channelId: selected.id,
      message: isOnline ? STATE_LABELS.CONNECTING : STATE_LABELS.OFFLINE,
    });

    const previousTask = nativePlayerTaskRef.current;
    const task = (async () => {
      if (previousTask) await previousTask.catch(() => {});
      if (cancelled) return;
      // Direct IPTV playback: pass the provider stream URL to the shared LibVLC player.
      // This route intentionally skips Render relay and the local rolling segment cache.
      if (cancelled) return;
      const openOrSwitch = nativePlayerOpenRef.current ? switchNativeVlcChannel : openNativeVlc;
      await openOrSwitch({
        url: selected.streamUrl,
        title: getChannelDisplayName(selected),
        channelId: selected.id,
        directOnly: true,
        debug: new URLSearchParams(window.location.search).get("debug") === "1",
        headers: {
          ...(selected.userAgent ? { "User-Agent": selected.userAgent } : {}),
          ...(selected.referrer ? { Referer: selected.referrer } : {}),
        },
      });
      nativePlayerOpenRef.current = true;
      document.documentElement.classList.add("xora-tv-player-open");
      const stage = nativeStageRef.current;
      if (stage) {
        const rect = stage.getBoundingClientRect();
        const viewport = window.visualViewport;
        const viewportLeft = viewport?.offsetLeft ?? 0;
        const viewportTop = viewport?.offsetTop ?? 0;
        const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
        const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
        const left = Math.max(rect.left, viewportLeft);
        const top = Math.max(rect.top, viewportTop);
        const right = Math.min(rect.right, viewportRight);
        const bottom = Math.min(rect.bottom, viewportBottom);
        const visible = right > left && bottom > top;
        void updateNativeVlcBounds({
          x: visible ? left - viewportLeft : 0,
          y: visible ? top - viewportTop : 0,
          width: visible ? right - left : 0,
          height: visible ? bottom - top : 0,
          devicePixelRatio: window.devicePixelRatio * (viewport?.scale ?? 1),
          visible,
        }).catch(() => {});
      }
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
        document.documentElement.classList.remove("xora-tv-player-open");
        void closeNativeVlc().catch(() => {});
      }
    };
    if (pendingTask) void pendingTask.catch(() => {}).then(closePlayer);
    else closePlayer();
  }, []);

  useEffect(() => {
    if (nativeState.state === "IDLE") document.documentElement.classList.remove("xora-tv-header-hidden");
  }, [nativeState.state]);

  useEffect(() => {
    if (!selected || !playerDockRef.current) return;
    const dock = playerDockRef.current;
    const stage = nativeStageRef.current;
    const page = dock.closest<HTMLElement>(".xora-tv-page");
    const appHeader = document.querySelector<HTMLElement>("header.fixed.inset-x-0.top-0");
    const native = isNativeVlcPlatform();
    let frame = 0;
    const update = () => {
      const rect = stage?.getBoundingClientRect();
      if (page) {
        page.style.setProperty("--xora-tv-header-height", (appHeader?.getBoundingClientRect().height ?? 0) + "px");
        page.style.setProperty("--xora-tv-pinned-height", dock.getBoundingClientRect().height + "px");
      }
      if (native && rect) {
        // LibVLC is a native Android overlay, not a DOM child: explicitly clip
        // its bounds to the visible viewport while the page scrolls.
        const viewport = window.visualViewport;
        const viewportLeft = viewport?.offsetLeft ?? 0;
        const viewportTop = viewport?.offsetTop ?? 0;
        const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
        const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
        const left = Math.max(rect.left, viewportLeft);
        const top = Math.max(rect.top, viewportTop);
        const right = Math.min(rect.right, viewportRight);
        const bottom = Math.min(rect.bottom, viewportBottom);
        const visible = right > left && bottom > top;
        void updateNativeVlcBounds({
          x: visible ? left - viewportLeft : 0,
          y: visible ? top - viewportTop : 0,
          width: visible ? right - left : 0,
          height: visible ? bottom - top : 0,
          devicePixelRatio: window.devicePixelRatio * (viewport?.scale ?? 1),
          visible,
        }).catch(() => {});
      }
    };
    const scheduleUpdate = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = 0; update(); });
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(dock);
    if (stage) observer.observe(stage);
    if (appHeader) observer.observe(appHeader);
    // Native LibVLC follows WebView scroll deltas on Android's UI thread.
    // Keep JS bounds sync for initial placement and viewport/layout changes only.
    if (!native) {
      window.addEventListener("scroll", scheduleUpdate, { passive: true });
      window.visualViewport?.addEventListener("scroll", scheduleUpdate, { passive: true });
    }
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    window.addEventListener("orientationchange", scheduleUpdate, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleUpdate, { passive: true });
    scheduleUpdate();
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      if (!native) {
        window.removeEventListener("scroll", scheduleUpdate);
        window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
      }
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      if (native) void updateNativeVlcBounds({ x: 0, y: 0, width: 0, height: 0, visible: false }).catch(() => {});
    };
  }, [selected]);

  useEffect(() => {
    const root = document.documentElement;
    const updateHeaderSurface = () => root.classList.toggle("xora-tv-header-scrolled", window.scrollY > 8);
    root.classList.add("xora-tv-page-open");
    window.addEventListener("scroll", updateHeaderSurface, { passive: true });
    updateHeaderSurface();
    return () => {
      root.classList.remove("xora-tv-page-open", "xora-tv-header-hidden", "xora-tv-header-scrolled");
      window.removeEventListener("scroll", updateHeaderSurface);
    };
  }, []);

  const guide = useQuery({
    queryKey: ["xoratv-tv-guide", selected?.id],
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

  const allChannels = useMemo(() => query.data ?? [], [query.data]);
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
      const matchesRankedScope = rankedScope === "all" || getRankedScope(channel.country) === rankedScope;
      return matchesText && matchesCategory && matchesCountry && matchesMode && matchesRankedScope;
    });
  }, [allChannels, q, category, country, filter, rankedScope, playerPrefs.favorites, playerPrefs.recent]);

  const favoriteChannels = useMemo(
    () => playerPrefs.favorites.map((id) => allChannels.find((channel) => channel.id === id)).filter((channel): channel is Channel => Boolean(channel)),
    [allChannels, playerPrefs.favorites],
  );
  const recentChannels = useMemo(
    () => playerPrefs.recent.map((id) => allChannels.find((channel) => channel.id === id)).filter((channel): channel is Channel => Boolean(channel)).slice(0, 10),
    [allChannels, playerPrefs.recent],
  );

  const rankedChannels = useMemo(() => getCountryRankedGroups(allChannels), [allChannels]);

  const rankedRegions: { id: RankedScope; title: string; subtitle: string; flag: string; count: number }[] = [
    { id: "nigeria", title: "Nigeria", subtitle: "Top priority", flag: "🇳🇬", count: rankedChannels.nigeria.length },
    { id: "africa", title: "Africa", subtitle: "Other African countries", flag: "🌍", count: rankedChannels.africa.length },
    { id: "usa", title: "USA", subtitle: "United States", flag: "🇺🇸", count: rankedChannels.usa.length },
    { id: "uk", title: "UK", subtitle: "United Kingdom", flag: "🇬🇧", count: rankedChannels.uk.length },
    { id: "others", title: "Others", subtitle: "Global channels", flag: "🌐", count: rankedChannels.others.length },
  ];

  const renderRankedRail = (title: string, scope: RankedScope, channels: Channel[], flag: string) => channels.length ? (
    <section className="xora-tv-ranked-section" aria-label={title}>
      <div className="xora-tv-ranked-heading">
        <div><span>{flag}</span><div><h2>{title}</h2><p>{channels.length} channels</p></div></div>
        <button type="button" onClick={() => setRankedScope(scope)} aria-label={"View all " + title + " channels"}>View all <ArrowRight aria-hidden="true" /></button>
      </div>
      <div className="hide-scrollbar xora-tv-ranked-track">
        {channels.slice(0, 8).map((channel, index) => (
          <button key={channel.id} type="button" className="xora-tv-ranked-card" onClick={() => selectChannel(channel)}>
            <span className="xora-tv-ranked-logo">
              {channel.logo ? <img src={channel.logo} alt="" loading="lazy" decoding="async" /> : <span>{getChannelDisplayName(channel).slice(0, 3).toUpperCase()}</span>}
              <span className="xora-tv-ranked-number">{index === 0 ? <><Crown aria-hidden="true" /> 1</> : "#" + (index + 1)}</span>
            </span>
            <strong>{getChannelDisplayName(channel)}</strong>
            <small>{getCountryFlag(channel.country)} {getCountryName(channel.country)}</small>
          </button>
        ))}
      </div>
    </section>
  ) : null;

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
    <AppShell wide extraWide>
      <CpxLiveTvGate>
        <div className={isLandscape ? "xora-tv-page xora-tv-redesign is-landscape" : "xora-tv-page xora-tv-redesign"}>
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
          </header>

          {selected && !isNativeVlcPlatform() ? (

            <section ref={playerDockRef} className="xora-tv-browser-player xora-tv-player-dock" aria-label="Live channel player">

              <VideoPlayer
                key={selected.id}
                streamUrl={selected.streamUrl}
                title={getChannelDisplayName(selected)}
                liveTv
                autoPlay
                channelCountry={getCountryName(selected.country)}
                channelFlag={getCountryFlag(selected.country)}
                channelQuality={getChannelQuality(selected) || undefined}
                favorite={playerPrefs.favorites.includes(selected.id)}
                onFavorite={() => toggleFavorite(selected.id)}
                onShare={() => void shareSelected()}
                className="w-full"
              />

            </section>

          ) : null}

          {selected && isNativeVlcPlatform() ? (
            <section ref={playerDockRef} className="xora-tv-now-card xora-tv-featured-card xora-tv-player-dock" aria-label="Selected live channel">
              <div ref={nativeStageRef} className="xora-tv-native-stage" aria-label="Live video surface" />
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
                  <p className="xora-tv-programme-line">{nowProgramme ? "Now playing · " + nowProgramme.title : "Live broadcast"}</p>
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
          ) : !selected ? (
            <div className="space-y-2">
              <LiveChannelEmptyStage />
              <p className="px-1 text-xs text-muted-foreground">
                {query.isLoading ? "Loading channels…" : query.isError && !query.data?.length ? "Connect to the internet to refresh the channel list." : "Choose a channel below to begin watching."}
              </p>
            </div>
          ) : null}

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
            </div>

          <section className="xora-tv-channel-section">
            <div className="xora-tv-section-heading">
              <div>
                <h2>{rankedScope === "all" ? "All channels" : rankedRegions.find((region) => region.id === rankedScope)?.title + " channels"}</h2>
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

          {renderChannelRail("Recently watched", recentChannels)}

          <section className="xora-tv-ranking" aria-label="Ranked channels by country">
            <div className="xora-tv-ranking-banner">
              <span className="xora-tv-ranking-globe"><Globe2 aria-hidden="true" /></span>
              <div><span>EXPLORE THE WORLD</span><h2>Live TV, ranked by country</h2><p>Start with Nigeria, then discover channels across the globe.</p></div>
            </div>
            <div className="xora-tv-region-grid">
              {rankedRegions.map((region) => (
                <button key={region.id} type="button" onClick={() => setRankedScope(region.id)} aria-pressed={rankedScope === region.id} className={"xora-tv-region-card" + (rankedScope === region.id ? " is-active" : "") + (region.id === "nigeria" ? " is-priority" : "")}>
                  {region.id === "nigeria" ? <Crown className="xora-tv-region-crown" aria-hidden="true" /> : null}
                  <span className="xora-tv-region-flag">{region.flag}</span><strong>{region.title}</strong><small>{region.subtitle}</small><em>{region.count.toLocaleString()} channels</em>
                </button>
              ))}
            </div>
            {renderRankedRail("Nigeria’s top channels", "nigeria", rankedChannels.nigeria, "🇳🇬")}
            {renderRankedRail("Other African channels", "africa", rankedChannels.africa, "🌍")}
            {renderRankedRail("United States channels", "usa", rankedChannels.usa, "🇺🇸")}
            {renderRankedRail("United Kingdom channels", "uk", rankedChannels.uk, "🇬🇧")}
            {renderRankedRail("More from around the world", "others", rankedChannels.others, "🌐")}
          </section>

          {renderChannelRail("Favourites", favoriteChannels)}

          <div className="xora-tv-notice">
            <strong>Live TV notice:</strong> Some channels may be unavailable in your region or on your device. XoraTV only shows channels with streams compatible with our player.
          </div>

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

// prettier-ignore
export const Route = createFileRoute("/tv")({
  validateSearch: (search: Record<string, unknown>) => ({
    channel: typeof search.channel === "string" ? search.channel : undefined,
    ...(typeof search.q === "string" ? { q: search.q } : {}),
    ...(search.filter === "all" || search.filter === "favourites" || search.filter === "recent"
      ? { filter: search.filter as TvFilter }
      : {}),
    ...(typeof search.category === "string" ? { category: search.category } : {}),
    ...(typeof search.country === "string" ? { country: search.country } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Live TV | Xora" },
      { name: "description", content: "Watch live television, browse channels and see what is on now with XoraTV." },
    ],
  }),
  component: LiveTvPage,
});
