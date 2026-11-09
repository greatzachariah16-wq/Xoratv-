import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  Clock3,
  Radio,
  RefreshCw,
  Search,
  WifiOff,
  Play,
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
  type NativeVlcStateChangedEvent,
  type NativeVlcStatus,
} from "@/lib/native-vlc";
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

function LiveTvPage() {
  const { channel: requestedChannel, q: searchQuery, category: requestedCategory } = Route.useSearch();
  const navigate = useNavigate({ from: "/tv" });
  const [search, setSearch] = useState(searchQuery ?? "");
  const category = requestedCategory ?? "";
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [nativeState, setNativeState] = useState<NativeVlcStateChangedEvent>({
    state: "IDLE",
    channelId: "",
    message: STATE_LABELS.IDLE,
  });
  const selectedIdRef = useRef("");

  useEffect(() => {
    setSearch(searchQuery ?? "");
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const nextQuery = search.trim();
      if (nextQuery !== (searchQuery ?? "")) {
        void navigate({
          search: (previous) => ({
            ...previous,
            q: nextQuery || undefined,
            category: nextQuery ? undefined : previous.category,
          }),
          replace: true,
        });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, searchQuery, navigate]);

  useEffect(() => {
    const updateNetwork = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    return () => {
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
    };
  }, []);

  const query = useQuery({
    queryKey: ["iptv-org-live-tv-page", searchQuery ?? "", category],
    queryFn: () => loadChannels(searchQuery ?? "", category),
    staleTime: 60_000,
    refetchInterval: isOnline && nativeState.state !== "OFFLINE" ? 5 * 60_000 : false,
    refetchOnWindowFocus: isOnline && nativeState.state !== "OFFLINE",
    retry: (failureCount) => isOnline && nativeState.state !== "OFFLINE" && failureCount < 3,
  });

  // Do not silently start the first channel when a visitor opens Live TV.
  // Playback begins only when a channel has been explicitly selected in the URL.
  const availableCategories = useMemo(
    () => Array.from(new Set((query.data ?? []).flatMap((channel) => channel.categories ?? [])))
      .filter((item) => item.trim() && item.toLowerCase() !== "sports")
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 12),
    [query.data],
  );

  const selected = useMemo(
    () => requestedChannel
      ? query.data?.find((item) => item.id === requestedChannel) || null
      : null,
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
    if (!selected) return;
    if (!isNativeVlcPlatform()) {
      setNativeState({
        state: "IDLE",
        channelId: selected.id,
        message: "Watch live channels in the XoraTV Android app.",
      });
      return;
    }

    let cancelled = false;
    const streamUrl = `/api/tv/stream?provider=${selected.provider || "nexus"}&channel=${encodeURIComponent(selected.id)}`;
    setNativeState({
      state: isOnline ? "CONNECTING" : "OFFLINE",
      channelId: selected.id,
      message: isOnline ? STATE_LABELS.CONNECTING : STATE_LABELS.OFFLINE,
    });

    void openNativeVlc({
      url: streamUrl,
      title: getChannelDisplayName(selected),
      channelId: selected.id,
    }).catch((error) => {
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
      void closeNativeVlc().catch(() => {});
    };
  }, [selected?.id, selected?.provider, selected?.name]);

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
        <div className="xora-tv-page">
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
              <Button variant="outline" className="xora-tv-refresh" onClick={() => void query.refetch()} disabled={!isOnline}>
                <RefreshCw className="size-4" aria-hidden="true" />
                <span>Refresh</span>
              </Button>
            </div>
            <div className="xora-tv-filter-row">
              <Button
                type="button"
                size="sm"
                variant={category === "sports" ? "default" : "outline"}
                className="rounded-full"
                onClick={() => { setSearch(""); void navigate({ search: (previous) => ({ ...previous, q: undefined, category: "sports" }), replace: true }); }}
              >
                Sports channels
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!category && !searchQuery ? "default" : "outline"}
                className="rounded-full"
                onClick={() => { setSearch(""); void navigate({ search: (previous) => ({ ...previous, q: undefined, category: undefined }), replace: true }); }}
              >
                All channels
              </Button>
              {availableCategories.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={category.toLowerCase() === item.toLowerCase() ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => {
                    setSearch("");
                    void navigate({ search: (previous) => ({ ...previous, q: undefined, category: item }), replace: true });
                  }}
                >
                  {formatMetadataLabel(item)}
                </Button>
              ))}
              {isOffline ? (
                <span className="xora-tv-offline-chip"><WifiOff aria-hidden="true" /> Offline · cached channels</span>
              ) : null}
            </div>
          </header>

          <div className="xora-tv-notice">
            <strong>Live TV notice:</strong> Some channels may be unavailable in your region or on your device. XoraTV only shows channels with streams compatible with our player.
          </div>

          {selected ? (
            <section className="xora-tv-now-card xora-tv-featured-card" aria-label="Selected live channel">
              <div className="xora-tv-now-topline">
                <span className="xora-tv-now-label">Now selected</span>
                <span className="xora-tv-live-pill"><i /> LIVE</span>
              </div>
              <div className="xora-tv-now-content">
                <div className="xora-tv-now-copy">
                  <h2>{getChannelDisplayName(selected)}</h2>
                  <p>{getCountryFlag(selected.country)} {getCountryName(selected.country)} <span>·</span> {getChannelQuality(selected) || "Live stream"}</p>
                  <div className="xora-tv-state-row" aria-live="polite">
                    <span className={`xora-tv-state-dot state-${state.toLowerCase()}`} />
                    <span>{state === "PLAYING" ? "Playing live" : stateMessage}</span>
                  </div>
                </div>
                {selected.logo ? <img className="xora-tv-now-logo" src={selected.logo} alt="" /> : null}
              </div>
              {isOffline ? <p className="xora-tv-web-offline-note">You're offline. Playback resumes automatically.</p> : null}
            </section>
          ) : (
            <section className="xora-tv-empty">
              <Radio aria-hidden="true" />
              <strong>{query.isLoading ? "Loading your channels" : "No playable channels found"}</strong>
              <span>{query.isError && !query.data?.length ? "Connect to the internet to refresh the channel list." : "Try another search or category."}</span>
            </section>
          )}

          <section className="xora-tv-channel-section">
            <div className="xora-tv-section-heading">
              <div>
                <h2>All channels</h2>
                <p>{query.data?.length ?? 0} channels available</p>
              </div>
              {isOffline ? <span className="xora-tv-offline-chip"><WifiOff aria-hidden="true" /> Cached list</span> : null}
            </div>

            {query.isLoading && !query.data ? (
              <div className="xora-tv-channel-grid">
                {Array.from({ length: 8 }).map((_, index) => <div key={index} className="xora-tv-skeleton" />)}
              </div>
            ) : query.data?.length ? (
              <div className="xora-tv-channel-grid">
                {query.data.map((channel) => {
                  const active = selected?.id === channel.id;
                  const quality = getChannelQuality(channel);
                  const categoryName = formatMetadataLabel(channel.categories?.[0] || "General");
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => {
                        if (active) {
                          if (nativeState.channelId === channel.id && nativeState.state === "IDLE" && isNativeVlcPlatform()) {
                            const streamUrl = `/api/tv/stream?provider=${channel.provider || "nexus"}&channel=${encodeURIComponent(channel.id)}`;
                            setNativeState({
                              state: "CONNECTING",
                              channelId: channel.id,
                              message: STATE_LABELS.CONNECTING,
                            });
                            void openNativeVlc({
                              url: streamUrl,
                              title: getChannelDisplayName(channel),
                              channelId: channel.id,
                            }).catch(() => setNativeState({
                              state: "ERR_UNKNOWN",
                              channelId: channel.id,
                              message: STATE_LABELS.ERR_UNKNOWN,
                            }));
                            return;
                          }
                          return;
                        }
                        void navigate({ search: (previous) => ({ ...previous, channel: channel.id }), replace: true });
                      }}
                      aria-pressed={active}
                      className={`xora-tv-channel-card ${active ? "is-selected" : ""}`}
                    >
                      {active ? (
                        <span className="xora-tv-playing-label">
                          <span>Now playing</span>
                          <span className="eq" aria-hidden="true"><i /><i /><i /></span>
                        </span>
                      ) : null}
                      <div className="xora-tv-card-badges">
                        <span className="xora-tv-live-pill"><i /> LIVE</span>
                        {quality ? <span className="xora-tv-quality-pill">{quality}</span> : null}
                      </div>
                      <div className="xora-tv-card-logo">
                        {channel.logo ? (
                          <img src={channel.logo} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <span>{getChannelDisplayName(channel).slice(0, 3).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="xora-tv-card-meta">
                        <strong>{getChannelDisplayName(channel)}</strong>
                        <span className="xora-tv-country-line">
                          <span aria-hidden="true">{getCountryFlag(channel.country)}</span>
                          <span>{getCountryName(channel.country)}</span>
                        </span>
                        <span className="xora-tv-category-line">{categoryName}</span>
                      </div>
                      <span className="xora-tv-card-play" aria-hidden="true"><Play /></span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="xora-tv-no-channels">
                {query.isError ? "The cached channel list is not available yet. Connect once to save it for offline viewing." : "No channels match this search."}
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
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Live TV | Xora" },
      { name: "description", content: "Watch live television, browse channels and see what is on now with XoraTV." },
    ],
  }),
  component: LiveTvPage,
});
