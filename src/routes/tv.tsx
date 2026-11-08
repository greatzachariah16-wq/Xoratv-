import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, RadioTower, Search, RefreshCw, Clock3, WifiOff, AlertCircle, Loader2 } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CpxLiveTvGate } from "@/components/commerce/CpxLiveTvGate";
import {
  addNativeVlcStateListener,
  isNativeVlcPlatform,
  openNativeVlc,
  closeNativeVlc,
  retryNativeVlc,
  type NativeVlcStateChanged,
  type NativeVlcStateName,
} from "@/lib/native-vlc";

type Channel = {
  id: string;
  name: string;
  logo?: string;
  country?: string;
  categories?: string[];
  streamUrl: string;
  quality?: string | null;
  labels?: string[];
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

const CATALOG_DB = "xoratv-live-tv";
const CATALOG_STORE = "channel-catalog";
const CATALOG_KEY = "all-channels";

function openCatalogDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(CATALOG_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CATALOG_STORE)) {
        db.createObjectStore(CATALOG_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open channel cache"));
  });
}

async function readCachedChannels(): Promise<Channel[]> {
  try {
    const db = await openCatalogDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(CATALOG_STORE, "readonly")
        .objectStore(CATALOG_STORE).get(CATALOG_KEY);
      request.onsuccess = () => {
        db.close();
        resolve(Array.isArray(request.result) ? request.result as Channel[] : []);
      };
      request.onerror = () => {
        db.close();
        reject(request.error || new Error("Could not read channel cache"));
      };
    });
  } catch {
    return [];
  }
}

async function writeCachedChannels(channels: Channel[]): Promise<void> {
  try {
    const db = await openCatalogDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(CATALOG_STORE, "readwrite");
      transaction.objectStore(CATALOG_STORE).put(channels, CATALOG_KEY);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("Could not save channel cache"));
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error || new Error("Channel cache write was aborted"));
      };
    });
  } catch (error) {
    console.warn("[XoraTV] Channel catalog cache was not updated:", error);
  }
}

async function loadChannels(): Promise<Channel[]> {
  try {
    const res = await fetch("/api/tv/channels?limit=10000", { cache: "no-store" });
    if (!res.ok) throw new Error("Unable to load live channels");
    const data = (await res.json()) as { ok?: boolean; channels?: Channel[] };
    const channels = Array.isArray(data.channels) ? data.channels : [];
    if (channels.length) void writeCachedChannels(channels);
    return channels.length ? channels : await readCachedChannels();
  } catch (error) {
    const cached = await readCachedChannels();
    if (cached.length) return cached;
    throw error;
  }
}

function getCountryMeta(country?: string) {
  const value = country?.trim() || "International";
  if (/^[a-z]{2}$/i.test(value)) {
    const code = value.toUpperCase();
    const flag = String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0)));
    let name = code;
    try {
      name = new Intl.DisplayNames(undefined, { type: "region" }).of(code) || code;
    } catch {
      // Keep the source country code when the browser has no region display names.
    }
    return { flag, name };
  }
  return { flag: "🌐", name: value };
}

function getChannelQuality(channel: Channel): string | null {
  const source = [channel.quality || "", ...(channel.labels || [])].join(" ");
  const match = source.match(/\b(1080p|720p)\b/i);
  return match?.[1]?.toLowerCase() || null;
}

const STATE_COPY: Record<NativeVlcStateName, string> = {
  IDLE: "Choose a channel to start watching",
  OFFLINE: "You're offline. Playback resumes automatically.",
  CONNECTING: "Connecting to channel…",
  BUFFERING: "Buffering…",
  PLAYING: "Playing live",
  ERR_REGION: "Not available in your region",
  ERR_CHANNEL_DOWN: "Channel is offline",
  ERR_TIMEOUT: "Network too slow",
  ERR_UNKNOWN: "Unable to play this channel",
};

const ERROR_STATES = new Set<NativeVlcStateName>([
  "ERR_REGION",
  "ERR_CHANNEL_DOWN",
  "ERR_TIMEOUT",
  "ERR_UNKNOWN",
]);

export const Route = createFileRoute("/tv")({
  validateSearch: (search: Record<string, unknown>) => ({
    channel: typeof search.channel === "string" ? search.channel : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Live TV | Xora" },
      { name: "description", content: "Watch live television, browse channels and see what is on now with XoraTV." },
    ],
  }),
  component: LiveTvPage,
});

function LiveTvPage() {
  const { channel: requestedChannel } = Route.useSearch();
  const navigate = useNavigate({ from: "/tv" });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [playbackState, setPlaybackState] = useState<NativeVlcStateChanged>({
    state: "IDLE",
    channelId: "",
    message: STATE_COPY.IDLE,
  });
  const [playerDismissed, setPlayerDismissed] = useState(false);
  const [nativeListenerReady, setNativeListenerReady] = useState(false);
  const nativePlayer = isNativeVlcPlatform();

  const query = useQuery({
    queryKey: ["iptv-org-live-tv-page"],
    queryFn: loadChannels,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 0,
  });

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let listener: { remove(): Promise<void> } | null = null;
    void addNativeVlcStateListener((event) => {
      if (disposed) return;
      setPlaybackState(event);
      if (event.userClosed) setPlayerDismissed(true);
    }).then((registered) => {
      if (disposed) void registered.remove();
      else {
        listener = registered;
        setNativeListenerReady(true);
      }
    }).catch((error) => {
      console.warn("[XoraTV] Native player state listener unavailable:", error);
    });
    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, []);

  const channels = query.data || [];
  const visibleChannels = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return channels.filter((channel) => {
      const matchesSearch = !normalized
        || channel.name.toLowerCase().includes(normalized)
        || (channel.country || "").toLowerCase().includes(normalized)
        || (channel.categories || []).some((item) => item.toLowerCase().includes(normalized));
      const matchesCategory = !category
        || (channel.categories || []).some((item) => item.toLowerCase().includes(category));
      return matchesSearch && matchesCategory;
    });
  }, [channels, search, category]);

  const selected = useMemo(
    () => channels.find((item) => item.id === requestedChannel)
      || (requestedChannel ? null : channels[0] || null),
    [channels, requestedChannel],
  );

  useEffect(() => {
    if (!nativePlayer || !nativeListenerReady || !selected || playerDismissed) return;
    const streamUrl = `/api/tv/stream?provider=${selected.provider || "nexus"}&channel=${encodeURIComponent(selected.id)}`;
    void openNativeVlc({
      url: streamUrl,
      title: selected.name,
      channelId: selected.id,
    }).catch((error) => {
      setPlaybackState({
        state: "ERR_UNKNOWN",
        channelId: selected.id,
        message: error instanceof Error ? error.message : STATE_COPY.ERR_UNKNOWN,
      });
    });
    return () => {
      void closeNativeVlc();
    };
  }, [nativePlayer, nativeListenerReady, selected?.id, selected?.name, selected?.provider, playerDismissed]);

  const guide = useQuery({
    queryKey: ["iptv-nexus-guide", selected?.id],
    queryFn: async () => {
      if (!selected) return [] as Programme[];
      try {
        const res = await fetch(`/api/tv/guide?channel=${encodeURIComponent(selected.id)}&hours=12`);
        if (!res.ok) return [] as Programme[];
        const data = (await res.json()) as { programmes?: Programme[] };
        return Array.isArray(data.programmes) ? data.programmes : [];
      } catch {
        return [] as Programme[];
      }
    },
    enabled: Boolean(selected) && online,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const nowProgramme = guide.data?.find((item) => item.isLive) || guide.data?.[0] || null;
  const upcomingProgrammes = (guide.data || []).filter((item) => item.id !== nowProgramme?.id).slice(0, 8);
  const stateForSelected = playbackState.channelId === selected?.id
    ? playbackState.state
    : nativePlayer && selected && !playerDismissed ? "CONNECTING" : "IDLE";
  const stateMessage = playbackState.channelId === selected?.id
    ? (playbackState.message || STATE_COPY[playbackState.state])
    : STATE_COPY[stateForSelected];
  const offline = !online || stateForSelected === "OFFLINE";
  const showRetry = ERROR_STATES.has(stateForSelected) && nativePlayer && !playerDismissed;

  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));

  const chooseChannel = (channel: Channel) => {
    setPlayerDismissed(false);
    void navigate({ search: { channel: channel.id }, replace: true });
  };

  return (
    <AppShell>
      <CpxLiveTvGate>
        <div className="xora-tv-page">
          <header className="xora-tv-page-header mb-4">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <RadioTower className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-semibold tracking-tight">Live TV</h1>
                <p className="text-sm text-muted-foreground">Your live channels, together in one place.</p>
              </div>
              {offline ? (
                <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  <WifiOff className="size-3" /> Offline
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search channels..."
                  className="h-10 rounded-xl pl-9"
                />
              </div>
              <Button variant="outline" className="h-10 shrink-0 rounded-xl" onClick={() => void query.refetch()}>
                <RefreshCw className="mr-2 size-4" /> Refresh
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={category === "sports" ? "default" : "outline"} className="rounded-full" onClick={() => setCategory(category === "sports" ? "" : "sports")}>Sports</Button>
              <Button type="button" size="sm" variant={!category ? "default" : "outline"} className="rounded-full" onClick={() => setCategory("")}>All channels</Button>
            </div>
          </header>

          {offline && !nativePlayer ? (
            <div className="xora-tv-offline-banner mb-3 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs text-muted-foreground">
              <WifiOff className="size-4 shrink-0 text-amber-600" />
              <span>You're offline. Playback resumes automatically.</span>
            </div>
          ) : null}

          {selected ? (
            <>
              <section className="xora-tv-selected-header mb-4 rounded-2xl border-2 border-[#b15232] bg-card px-4 py-3 shadow-sm">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#b15232]">
                      Now selected
                      <span className="rounded-full bg-[#b15232]/10 px-2 py-0.5 text-[9px] tracking-normal">LIVE</span>
                    </p>
                    <h2 className="truncate font-display text-base font-semibold">{selected.name}</h2>
                    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {stateForSelected === "OFFLINE" ? <WifiOff className="size-3.5 shrink-0" /> : null}
                      {stateForSelected === "CONNECTING" || stateForSelected === "BUFFERING" ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : null}
                      {ERROR_STATES.has(stateForSelected) ? <AlertCircle className="size-3.5 shrink-0" /> : null}
                      <span className="truncate">{stateMessage}</span>
                    </p>
                  </div>
                  {showRetry ? (
                    <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={() => void retryNativeVlc()}>
                      Retry
                    </Button>
                  ) : null}
                </div>
                {!nativePlayer ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">Live TV playback is available in the XoraTV Android app.</p>
                ) : null}
              </section>

              <section className="mt-4 overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/5 via-card to-card shadow-sm">
                <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
                  <CalendarClock className="size-4 text-primary" />
                  <div>
                    <h2 className="font-display text-sm font-semibold">TV Guide</h2>
                    <p className="text-[11px] text-muted-foreground">What’s playing now and what’s coming next</p>
                  </div>
                </div>
                {nowProgramme ? (
                  <div className="p-4">
                    <div className="rounded-2xl border border-primary/15 bg-primary/[0.06] p-4">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                        <span className="size-1.5 animate-pulse rounded-full bg-primary" /> Now playing
                      </div>
                      <h3 className="mt-2 font-display text-lg font-semibold">{nowProgramme.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{formatTime(nowProgramme.start)} – {formatTime(nowProgramme.stop)}</p>
                      {nowProgramme.description ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{nowProgramme.description}</p> : null}
                    </div>
                    {upcomingProgrammes.length > 0 ? (
                      <div className="mt-4">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                          <Clock3 className="size-3.5 text-muted-foreground" /> Up next
                        </div>
                        <div className="space-y-2">
                          {upcomingProgrammes.map((programme) => (
                            <div key={programme.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/60 px-3 py-2.5">
                              <span className="w-16 shrink-0 text-xs font-semibold text-muted-foreground">{formatTime(programme.start)}</span>
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">{programme.title}</span>
                              <span className="text-[10px] text-muted-foreground">{formatTime(programme.stop)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="p-5 text-center text-xs text-muted-foreground">
                    {guide.isLoading ? "Loading programme schedule..." : "No EPG schedule is available for this channel right now."}
                  </div>
                )}
              </section>
            </>
          ) : null}

          <section className="mt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold">Channels</h2>
                <p className="text-[11px] text-muted-foreground">{visibleChannels.length.toLocaleString()} available</p>
              </div>
              {offline ? <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Saved catalog</span> : null}
            </div>
            {visibleChannels.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {visibleChannels.map((channel) => {
                  const isSelected = selected?.id === channel.id;
                  const country = getCountryMeta(channel.country);
                  const quality = getChannelQuality(channel);
                  const channelCategory = channel.categories?.[0] || "General";
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => chooseChannel(channel)}
                      aria-pressed={isSelected}
                      className={`xora-tv-channel-card group min-w-0 overflow-hidden rounded-2xl border bg-card text-left transition hover:-translate-y-0.5 hover:border-[#b15232]/60 ${isSelected ? "xora-tv-channel-selected border-2 border-[#b15232] shadow-md" : "border-border/60"}`}
                    >
                      <div className="xora-tv-channel-art relative aspect-video overflow-hidden bg-muted/50">
                        <span className="xora-tv-live-pill absolute left-2 top-2 z-10 rounded-full bg-[#b15232] px-2 py-1 text-[8px] font-extrabold tracking-wide text-white">LIVE</span>
                        {quality ? <span className="absolute right-2 top-2 z-10 rounded-full border border-white/20 bg-black/65 px-2 py-1 text-[8px] font-bold text-white">{quality}</span> : null}
                        <div className="xora-tv-channel-logo absolute inset-x-3 bottom-2 top-10 grid place-items-center">
                          {channel.logo ? (
                            <img src={channel.logo} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
                          ) : (
                            <span className="line-clamp-2 text-center text-xs font-semibold text-foreground/75">{channel.name}</span>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 p-2.5">
                        <p className="truncate text-xs font-semibold">{channel.name}</p>
                        <p className="xora-tv-country mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span aria-hidden="true">{country.flag}</span>
                          <span>{country.name}</span>
                        </p>
                        <p className="xora-tv-category mt-0.5 text-[10px] text-muted-foreground">{channelCategory}</p>
                        {isSelected ? (
                          <span className="mt-2 inline-flex items-center gap-2 text-[10px] font-bold text-[#b15232]">
                            Now playing
                            <span className="eq" aria-label="Playing">
                              <i /><i /><i />
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                {query.isLoading ? "Loading live channels..." : "No channels are available. Connect to the internet to refresh the catalog."}
              </div>
            )}
          </section>
        </div>
      </CpxLiveTvGate>
    </AppShell>
  );
}
