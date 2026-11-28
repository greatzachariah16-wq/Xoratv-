import { useEffect, useMemo, useRef, useState } from "react";
import "./watch-recommendations.css";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Film,
  Play,
  Pause,
  Share2,
} from "lucide-react";
import { VideoPlayer } from "@/components/xora/VideoPlayer";
import { isNativeVlcPlatform } from "@/lib/native-vlc";
import type { XTvSeriesItem } from "@/integrations/firebase/rtdb";

export const Route = createFileRoute("/watch")({
  head: () => ({
    meta: [
      { title: "Watch — Xora Cinema" },
      { name: "description", content: "Watch cinema on XoraTV." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: WatchPage,
});

async function fetchAllMovies(): Promise<XTvSeriesItem[]> {
  try {
    const res = await fetch("/api/xtv-series/items");
    if (!res.ok) return [];
    const json = (await res.json()) as { ok: boolean; items?: XTvSeriesItem[] };
    return Array.isArray(json.items) ? json.items : [];
  } catch {
    return [];
  }
}

type ProviderAttempt = { provider: string; status: string; reason?: string };

class StreamResolutionError extends Error {
  attempts: ProviderAttempt[];
  constructor(message: string, attempts: ProviderAttempt[] = []) {
    super(message);
    this.name = "StreamResolutionError";
    this.attempts = attempts;
  }
}

async function fetchMovieStream(
  id: string,
  sourceSlot?: number,
  onWaitingRetry?: (retry: number, maxRetries: number) => void,
): Promise<{
  streamUrl: string;
  sourceType: string;
  title: string;
  originalUrl?: string;
  provider?: string;
  providerName?: string;
  nativeHeaders?: Record<string, string>;
  attempts?: ProviderAttempt[];
  providerSlot?: number;
}> {
  const platform = isNativeVlcPlatform() ? "native" : "web";
  const params = new URLSearchParams({ id, platform });
  if (sourceSlot !== undefined) params.set("source", String(sourceSlot));
  const maxAttempts = sourceSlot === 0 ? 3 : 1;
  let lastError: StreamResolutionError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch("/api/xtv-series/stream?" + params.toString(), {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
    } catch {
      lastError = new StreamResolutionError("The selected source is still starting.");
      if (attempt < maxAttempts) {
        onWaitingRetry?.(attempt, maxAttempts);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }
      throw lastError;
    }

    const data = await response.json().catch(() => ({})) as {
      ok?: boolean;
      streamUrl?: string;
      sourceType?: string;
      provider?: string;
      providerName?: string;
      nativeHeaders?: Record<string, string>;
      item?: { title?: string; videoUrl?: string };
      attempts?: ProviderAttempt[];
      providerSlot?: number;
      error?: string;
    };
    if (response.ok && data.ok && data.streamUrl) {
      return {
        streamUrl: data.streamUrl,
        sourceType: data.sourceType || "hls",
        title: data.item?.title || "Cinema Stream",
        originalUrl: data.item?.videoUrl || data.streamUrl,
        provider: data.provider,
        providerName: data.providerName || data.provider,
        nativeHeaders: data.nativeHeaders,
        attempts: data.attempts || [],
        providerSlot: data.providerSlot,
      };
    }

    lastError = new StreamResolutionError(
      data.error || "The selected provider did not return a playable source.",
      data.attempts || [],
    );
    const cineproUnavailable = (data.attempts || []).some(
      (entry) => entry.provider === "cinepro" && entry.status === "unavailable" && entry.reason === "provider-unreachable",
    );
    const retryable = response.status === 408 || response.status === 502 || response.status === 503 ||
      response.status === 504 || cineproUnavailable;
    if (sourceSlot !== 0 || !retryable || attempt === maxAttempts) throw lastError;

    onWaitingRetry?.(attempt, maxAttempts);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw lastError || new StreamResolutionError("The selected source could not start.");
}

function isDirectMediaUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    return url.protocol === "https:" && [".m3u8", ".mp4", ".m4v", ".mov", ".mpd"].some((ext) => path.endsWith(ext));
  } catch {
    return false;
  }
}

function cleanTitle(value: string): string {
  let title = value
    .replace(/\s*[-–—|:]\s*(?:CLASSIC AFRICAN EPIC MOVIES|FULL MOVIE|FULL FILM|OFFICIAL(?:\s+VIDEO)?|MOVIE\s+TRAILER).*$/i, "")
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/\b(?:4K|8K|ULTRA\s*HD|FULL\s*HD|1080P|720P|HD)\b/gi, " ")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/[.…\s|:–—-]+$/g, "")
    .trim();

  if (!title) return value.replace(/\s+/g, " ").trim();

  const letters = title.replace(/[^\p{L}]/gu, "");
  const upperCount = (letters.match(/\p{Lu}/gu) || []).length;
  if (letters.length > 3 && upperCount / letters.length > 0.75) {
    title = title.toLocaleLowerCase().replace(/(^|[\s'’(])\p{L}/gu, (match) => match.toLocaleUpperCase());
  }
  return title;
}

function getYouTubeId(value?: string | null): string | null {
  if (!value) return null;
  return (
    value.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?.*v=)|youtu\.be\/)([\w-]{11})/i)?.[1] ||
    value.match(/\/embed\/([\w-]{11})/i)?.[1] ||
    null
  );
}

function WatchPage() {
  const navigate = useNavigate();
  const { id } = Route.useSearch();
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [fallbackStream, setFallbackStream] = useState<Awaited<ReturnType<typeof fetchMovieStream>> | null>(null);
  const [failedProviders, setFailedProviders] = useState<string[]>([]);
  const [isTryingAnotherSource, setIsTryingAnotherSource] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState("");
  const [selectedSourceSlot, setSelectedSourceSlot] = useState<number | null>(null);
  const autoSwitchInFlight = useRef(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [switchingProviderSlot, setSwitchingProviderSlot] = useState<number | null>(null);
  const [providerSwitchMessage, setProviderSwitchMessage] = useState("");
  const [landscapeReady, setLandscapeReady] = useState(false);
  const [landscapeMessage, setLandscapeMessage] = useState("");

  const { data: allMovies = [], isLoading: isLoadingMovies } = useQuery({
    queryKey: ["xtv-series-items-all"],
    queryFn: fetchAllMovies,
    staleTime: 5 * 60 * 1000,
  });

  const activeMovie = useMemo(() => {
    if (!id && allMovies.length > 0) return allMovies[0];
    return allMovies.find((movie) => movie.id === id) || null;
  }, [allMovies, id]);

  const activeId = activeMovie?.id || id || "";
  // Restore the original X-Series behaviour: resolve the best available source
  // automatically when a title opens, without requiring a manual source tap.
  const {
    data: streamData,
    isLoading: isStreamLoading,
    error: streamError,
    refetch: refetchStream,
  } = useQuery({
    queryKey: ["movie-stream-resolve", activeId],
    queryFn: () => fetchMovieStream(activeId),
    enabled: Boolean(activeId),
    retry: 2,
    staleTime: 10 * 60 * 1000,
  });
  const activeStreamData = fallbackStream || streamData;
  const streamUrl = activeStreamData?.streamUrl || "";
  const originalUrl = activeStreamData?.originalUrl || streamUrl;
  const youtubeId = getYouTubeId(originalUrl) || getYouTubeId(streamUrl);
  const isYouTubeSource = activeStreamData?.sourceType?.toLowerCase() === "youtube" || activeMovie?.provider?.toLowerCase() === "youtube" || Boolean(youtubeId);
  const playerStreamUrl = isYouTubeSource && youtubeId ? originalUrl : streamUrl;
  const nativeCinemaDirectUrl = activeStreamData?.provider === "cinepro" && isNativeVlcPlatform()
    ? streamUrl
    : isDirectMediaUrl(originalUrl) ? originalUrl : "";
  const isVimeoSource = /(?:player\.)?vimeo\.com\//i.test(originalUrl || streamUrl);
  const supportsExternalPlaybackControl = Boolean(nativeCinemaDirectUrl || isDirectMediaUrl(playerStreamUrl) || isYouTubeSource || isVimeoSource);
  const title = activeMovie?.title || activeStreamData?.title || "Now Playing";
  const displayTitle = cleanTitle(title);
  const description = activeMovie?.description?.trim() || "";
  const genres = [...new Set([...(activeMovie?.categories || []), activeMovie?.genre || ""]
    .map((genre) => genre.trim())
    .filter((genre) => genre && genre.toLowerCase() !== "other"))];
  const meta = [
    activeMovie?.year ? String(activeMovie.year) : null,
    activeMovie?.durationSeconds && activeMovie.durationSeconds > 0
      ? `${Math.round(activeMovie.durationSeconds / 60)} min`
      : null,
  ].filter(Boolean);
  const sourceLabels = ["Source 1", "Source 2", "Source 3", "Source 4", "Source 5"];
  const activeProviderSlot = activeStreamData?.providerSlot ?? selectedSourceSlot ?? -1;

  const choosePlaybackSource = async (sourceSlot: number) => {
    if (!activeId || switchingProviderSlot !== null || isTryingAnotherSource) return;
    setSelectedSourceSlot(sourceSlot);
    setSwitchingProviderSlot(sourceSlot);
    setPlaybackFailed(false);
    setProviderSwitchMessage(`Connecting to ${sourceLabels[sourceSlot]}…`);
    try {
      const nextStream = await fetchMovieStream(activeId, sourceSlot, (retry, maxRetries) => {
        setProviderSwitchMessage(`The selected source is still starting. Waiting before retry ${retry + 1} of ${maxRetries}…`);
      });
      setFallbackStream(nextStream);
      setProviderSwitchMessage(`${sourceLabels[sourceSlot]} selected.`);
      setFallbackMessage("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "This provider did not return a playable source.";
      setProviderSwitchMessage(`${sourceLabels[sourceSlot]} couldn't provide this title. The current stream is unchanged.`);
      setFallbackMessage(message);
    } finally {
      setSwitchingProviderSlot(null);
    }
  };

  const tryAnotherSource = async () => {
    const currentProvider = activeStreamData?.provider;
    if (!activeId || !currentProvider || autoSwitchInFlight.current) return;
    autoSwitchInFlight.current = true;
    const excludedProviders = [...new Set([...failedProviders, currentProvider])];
    setIsTryingAnotherSource(true);
    setPlaybackFailed(true);
    setFallbackMessage("The current source failed. Finding another source automatically…");
    setProviderSwitchMessage("Switching to another available source…");
    try {
      const params = new URLSearchParams({
        id: activeId,
        platform: isNativeVlcPlatform() ? "native" : "web",
        exclude: excludedProviders.join(","),
      });
      const response = await fetch("/api/xtv-series/stream?" + params.toString(), { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as {
        ok?: boolean;
        streamUrl?: string;
        sourceType?: string;
        provider?: string;
        providerName?: string;
        providerSlot?: number;
        nativeHeaders?: Record<string, string>;
        item?: { title?: string; videoUrl?: string };
      };
      if (!response.ok || !data.ok || !data.streamUrl || !data.provider) {
        setFailedProviders(excludedProviders);
        setFallbackMessage("No other source is available right now. You can retry or choose a source manually.");
        setProviderSwitchMessage("Automatic source switching could not find another playable source.");
        return;
      }
      setFailedProviders(excludedProviders);
      setFallbackStream({
        streamUrl: data.streamUrl,
        sourceType: data.sourceType || "hls",
        title: data.item?.title || title,
        originalUrl: data.item?.videoUrl || data.streamUrl,
        provider: data.provider,
        providerName: data.providerName || data.provider,
        providerSlot: data.providerSlot,
        nativeHeaders: data.nativeHeaders,
      });
      setSelectedSourceSlot(typeof data.providerSlot === "number" ? data.providerSlot : null);
      setPlaybackFailed(false);
      setFallbackMessage("XoraTV switched to another available source.");
      setProviderSwitchMessage("A new source is ready.");
    } catch {
      setFallbackMessage("Could not reach another source. You can retry or choose one manually.");
    } finally {
      autoSwitchInFlight.current = false;
      setIsTryingAnotherSource(false);
    }
  };

  const retrySelectedSource = () => {
    const slot = selectedSourceSlot ?? activeProviderSlot;
    if (slot >= 0) void choosePlaybackSource(slot);
    else void refetchStream();
  };

  const recommendationGroups = useMemo(() => {
    const available = allMovies.filter((movie) => movie.id !== activeId);
    const upNext = available.slice(0, 12);
    const used = new Set(upNext.map((movie) => movie.id));
    const activeMovie = allMovies.find((movie) => movie.id === activeId);
    const activeGenre = activeMovie?.genre?.trim().toLowerCase();
    const closelyRelated = activeGenre
      ? available.filter((movie) => !used.has(movie.id) && movie.genre?.trim().toLowerCase() === activeGenre).slice(0, 12)
      : [];
    closelyRelated.forEach((movie) => used.add(movie.id));
    const youMayLike = available.filter((movie) => !used.has(movie.id)).slice(0, 12);
    return { upNext, youMayLike, closelyRelated };
  }, [allMovies, activeId]);

  useEffect(() => {
    setFallbackStream(null);
    setFailedProviders([]);
    setIsTryingAnotherSource(false);
    setFallbackMessage("");
    setSelectedSourceSlot(null);
    setPlaybackFailed(false);
    setIsPlaybackActive(false);
    setProviderSwitchMessage("");
    setLandscapeReady(false);
    setLandscapeMessage("");
    setSwitchingProviderSlot(null);
    autoSwitchInFlight.current = false;
  }, [activeId]);

  useEffect(() => {
    const handlePlaybackState = (event: Event) => {
      const detail = (event as CustomEvent<{ playing?: boolean }>).detail;
      if (typeof detail?.playing === "boolean") setIsPlaybackActive(detail.playing);
    };
    window.addEventListener("xora:watch-playback-state", handlePlaybackState);
    return () => window.removeEventListener("xora:watch-playback-state", handlePlaybackState);
  }, []);

  useEffect(() => {
    const unlockWhenFullscreenEnds = () => {
      if (document.fullscreenElement) return;
      try {
        const orientation = typeof screen !== "undefined" && screen.orientation
          ? screen.orientation as ScreenOrientation & { unlock?: () => void }
          : undefined;
        orientation?.unlock?.();
      } catch {
        // Browsers without orientation-unlock support need no fallback.
      }
    };
    document.addEventListener("fullscreenchange", unlockWhenFullscreenEnds);
    return () => document.removeEventListener("fullscreenchange", unlockWhenFullscreenEnds);
  }, []);

  const toggleExternalPlayback = async () => {
    // First tap is ONLY an orientation request. Call lock directly from this
    // click gesture; do not request fullscreen or start playback here.
    if (!isPlaybackActive && !isNativeVlcPlatform() && !landscapeReady) {
      const orientation = typeof screen !== "undefined" && screen.orientation
        ? screen.orientation as ScreenOrientation & {
            lock?: (value: string) => Promise<void>;
          }
        : undefined;

      if (!orientation?.lock) {
        setLandscapeMessage("This browser does not support automatic landscape rotation. Rotate your device manually.");
        return;
      }

      try {
        await orientation.lock("landscape");
        setLandscapeReady(true);
        setLandscapeMessage("Landscape mode is ready. Tap Play again to start the movie.");
      } catch (error) {
        console.info("[Xora Watch] Landscape lock was rejected:", error);
        setLandscapeMessage("The browser rejected landscape rotation. Rotate your device manually, then tap Play.");
      }
      return;
    }

    // Second tap starts playback. Pause continues to work normally.
    window.dispatchEvent(new CustomEvent("xora:watch-playback-toggle"));
  };

  useEffect(() => {
    if (typeof window === "undefined" || !activeId) {
      setSaved(false);
      return;
    }
    try {
      setSaved(window.localStorage.getItem(`xora:saved-movie:${activeId}`) === "1");
    } catch {
      setSaved(false);
    }
  }, [activeId]);

  const handleSave = () => {
    const nextSaved = !saved;
    setSaved(nextSaved);
    try {
      if (nextSaved) window.localStorage.setItem(`xora:saved-movie:${activeId}`, "1");
      else window.localStorage.removeItem(`xora:saved-movie:${activeId}`);
    } catch {
      setShareMessage("Saving is unavailable on this device.");
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: displayTitle, text: "Watch on XoraTV", url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareMessage("Link copied");
      } else {
        setShareMessage("Sharing is unavailable on this device.");
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        setShareMessage("Could not share this title.");
      }
    }
  };

  return (
    <div className="xora-watch-page">
      <header className="xora-watch-header">
        <div className="xora-watch-header-inner">
          <Link
            to="/xtv-series"
            className="xora-watch-back"
            aria-label="Back to X-Series"
            title="Back"
          >
            <ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
          </Link>
          <h1 className="xora-watch-header-title">Xora Cinema</h1>
        </div>
      </header>

      <main className="xora-watch-main">
        <div className="xora-watch-player-sticky">
          <div className="xora-watch-player">
            {isStreamLoading && !streamUrl ? (
              <div className="xora-watch-player-loading" role="status" aria-label="Preparing playback">
                <span className="xora-watch-spinner" />
              </div>
            ) : streamError && !streamUrl ? (
              <div className="xora-watch-player-message">
                <Film size={30} aria-hidden="true" />
                <p>{"The selected source could not prepare this stream. Please retry or choose another source."}</p>
                <button type="button" className="xora-watch-primary" onClick={retrySelectedSource} disabled={selectedSourceSlot === null || switchingProviderSlot !== null}>
                  Retry {selectedSourceSlot === null ? "source" : sourceLabels[selectedSourceSlot]}
                </button>
              </div>
            ) : streamUrl ? (
              <VideoPlayer
                key={`${activeId}:${activeProviderSlot}`}
                streamUrl={nativeCinemaDirectUrl || playerStreamUrl}
                nativeVlc={Boolean(nativeCinemaDirectUrl)}
                nativeDirectOnly={Boolean(nativeCinemaDirectUrl)}
                nativeHeaders={activeStreamData?.nativeHeaders}
                externalPoster={activeMovie?.thumbnailUrl}
                title={title}
                autoPlay={false}
                vertical={false}
                className="h-full w-full"
                postId={activeId || "cinema-stream"}
                authorId="xora-cinema"
                genre={activeMovie?.genre}
                source={activeStreamData?.sourceType || activeMovie?.provider}
                onPlaybackError={() => {
                  setPlaybackFailed(true);
                  setProviderSwitchMessage("Playback failed. XoraTV is looking for another source…");
                  void tryAnotherSource();
                }}
                cinemaMode
              />
            ) : (
              <div className="xora-watch-player-message">
                <Film size={30} aria-hidden="true" />
                <p>{isLoadingMovies ? "Finding your film…" : "Choose a playback source below to start this title."}</p>
              </div>
            )}
          </div>
          {playbackFailed ? (
            <div className="xora-watch-sourcebar">
              <span className="xora-watch-source-label">{isTryingAnotherSource ? "Trying another source…" : fallbackMessage || "Playback couldn't start."}</span>
              <button type="button" onClick={retrySelectedSource} className="xora-watch-primary" disabled={switchingProviderSlot !== null || isTryingAnotherSource}>Retry source</button>
            </div>
          ) : null}
        </div>

        {activeId ? (
          <section className="xora-watch-provider-switch" aria-label="Playback source selection">
            <div className="xora-watch-provider-heading">
              <div>
                <span className="xora-watch-provider-eyebrow">CHOOSE BEFORE PLAYING</span>
                <h3>Playback source</h3>
              </div>
              <span className="xora-watch-provider-status">
                {switchingProviderSlot !== null ? `Connecting to ${sourceLabels[switchingProviderSlot]}…` : activeProviderSlot >= 0 ? sourceLabels[activeProviderSlot] + " active" : "Resolving automatically"}
              </span>
            </div>
            <div className="xora-watch-provider-options" role="group" aria-label="Choose playback source">
              {sourceLabels.map((sourceLabel, slot) => {
                const active = activeProviderSlot === slot;
                const switching = switchingProviderSlot === slot;
                return (
                  <button
                    key={sourceLabel}
                    type="button"
                    className={`xora-watch-provider-option${active ? " is-active" : ""}${switching ? " is-loading" : ""}`}
                    onClick={() => void choosePlaybackSource(slot)}
                    disabled={switchingProviderSlot !== null}
                    aria-pressed={active}
                    aria-label={`Choose ${sourceLabel} as playback source`}
                  >
                    <span className="xora-watch-provider-number">{sourceLabel}</span>
                    <span className="xora-watch-provider-dot" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <p className="xora-watch-provider-feedback" role="status">
              {providerSwitchMessage || "XoraTV automatically selects a playable source and switches if playback fails. You can also choose one manually."}
            </p>
            {switchingProviderSlot === 0 || (isStreamLoading && activeProviderSlot === 0) ? (
              <p className="xora-watch-source-feedback" role="status">
                Some sources may take up to 120 seconds to respond on the first request while the service wakes up.
              </p>
            ) : null}
          </section>
        ) : null}

        {supportsExternalPlaybackControl ? (
          <div className="xora-watch-control-row" aria-label="Playback controls">
            <button
              type="button"
              className="xora-watch-play-toggle"
              onClick={toggleExternalPlayback}
              aria-label={isPlaybackActive ? "Pause video" : !isNativeVlcPlatform() && !landscapeReady ? "Rotate to landscape" : "Play video"}
            >
              {isPlaybackActive ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              <span>{isPlaybackActive ? "Pause" : !isNativeVlcPlatform() && !landscapeReady ? "Rotate" : "Play"}</span>
            </button>
            <span className="xora-watch-control-hint">{isPlaybackActive ? "Now playing" : landscapeMessage || (landscapeReady ? "Landscape ready · Tap Play" : "Tap to rotate")}</span>
          </div>
        ) : null}

        <section className="xora-watch-details" aria-label="Movie details">
          {meta.length > 0 ? <p className="xora-watch-meta">{meta.join(" · ")}</p> : null}
          <h2 className={`xora-watch-title${titleExpanded ? " is-expanded" : ""}`} aria-label={title}>
            {titleExpanded ? title : displayTitle}
          </h2>
          {displayTitle !== title ? (
            <button
              type="button"
              className="xora-watch-text-toggle"
              onClick={() => setTitleExpanded((expanded) => !expanded)}
              aria-expanded={titleExpanded}
            >
              {titleExpanded ? "Show less" : "More"}
              {titleExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          ) : null}

          {genres.length > 0 ? (
            <div className="xora-watch-genres" aria-label="Genres">
              {genres.map((genre) => <span key={genre}>{genre}</span>)}
            </div>
          ) : null}

          <div className="xora-watch-actions">
            <button type="button" className={`xora-watch-action${saved ? " is-active" : ""}`} onClick={handleSave} aria-pressed={saved}>
              {saved ? <Check size={17} /> : <Bookmark size={17} />}
              <span>{saved ? "Saved" : "Save"}</span>
            </button>
            <button type="button" className="xora-watch-action" onClick={() => void handleShare()}>
              <Share2 size={17} />
              <span>Share</span>
            </button>
          </div>
          {shareMessage ? <p className="xora-watch-feedback" role="status">{shareMessage}</p> : null}

          {description ? (
            <div className="xora-watch-description-wrap">
              <p className={`xora-watch-description${descriptionExpanded ? " is-expanded" : ""}`}>
                {description}
              </p>
              {description.length > 150 ? (
                <button
                  type="button"
                  className="xora-watch-text-toggle"
                  onClick={() => setDescriptionExpanded((expanded) => !expanded)}
                  aria-expanded={descriptionExpanded}
                >
                  {descriptionExpanded ? "Show less" : "More"}
                  {descriptionExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="xora-watch-settings">
          <button
            type="button"
            className="xora-watch-settings-trigger"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-expanded={settingsOpen}
            aria-controls="xora-watch-settings-content"
          >
            <span>
              <span className="xora-watch-settings-title">Playback settings</span>
              <span className="xora-watch-settings-subtitle">Audio, captions &amp; playback preferences</span>
            </span>
            {settingsOpen ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
          </button>
          {settingsOpen ? (
            <div id="xora-watch-settings-content" className="xora-watch-settings-content">
              <p>Playback preferences will appear here when available for this title.</p>
            </div>
          ) : null}
        </section>

        {([
          { title: "Up next", label: "Up next", movies: recommendationGroups.upNext },
          { title: "You may like", label: "You may like", movies: recommendationGroups.youMayLike },
          { title: "Closely related", label: "Closely related", movies: recommendationGroups.closelyRelated },
        ] as const).map((group) => group.movies.length > 0 ? (
          <section className="xora-watch-recommendation-row" aria-label={group.label} key={group.label}>
            <div className="xora-watch-section-heading">
              <h3>{group.title}</h3>
              <Link to="/xtv-series">See all</Link>
            </div>
            <div className="xora-watch-rail">
              {group.movies.map((movie) => (
                <button key={movie.id} type="button" className="xora-watch-next-card"
                  onClick={() => {
                    void navigate({ to: "/watch", search: { id: movie.id } });
                    window.scrollTo({ top: 0, behavior: "auto" });
                  }}>
                  <span className="xora-watch-next-image">
                    {movie.thumbnailUrl ? <img src={movie.thumbnailUrl} alt="" loading="lazy" /> : (
                      <span className="xora-watch-next-placeholder"><Film size={24} /></span>
                    )}
                    <span className="xora-watch-next-play"><Play size={15} fill="currentColor" /></span>
                  </span>
                  <span className="xora-watch-next-title">{cleanTitle(movie.title)}</span>
                  {movie.genre && movie.genre.toLowerCase() !== "other" ? (
                    <span className="xora-watch-next-meta">{movie.genre}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        ) : null)}
      </main>
    </div>
  );
}
