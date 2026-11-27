import { useEffect, useMemo, useState } from "react";
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

async function fetchMovieStream(id: string): Promise<{
  streamUrl: string;
  sourceType: string;
  title: string;
  originalUrl?: string;
  provider?: string;
  providerName?: string;
  nativeHeaders?: Record<string, string>;
  attempts?: ProviderAttempt[];
}> {
  const isXSeriesId = /^(movie|tv)_\d+$/.test(id);
  try {
    const platform = isNativeVlcPlatform() ? "native" : "web";
    const res = await fetch("/api/xtv-series/stream?id=" + encodeURIComponent(id) + "&platform=" + platform, { cache: "no-store" });
    const data = await res.json().catch(() => ({})) as {
      ok?: boolean;
      streamUrl?: string;
      sourceType?: string;
      provider?: string;
      providerName?: string;
      nativeHeaders?: Record<string, string>;
      item?: { title?: string; videoUrl?: string };
      attempts?: ProviderAttempt[];
      error?: string;
    };
    if (res.ok && data.ok && data.streamUrl) {
      return {
        streamUrl: data.streamUrl,
        sourceType: data.sourceType || "hls",
        title: data.item?.title || "Cinema Stream",
        originalUrl: data.item?.videoUrl || data.streamUrl,
        provider: data.provider,
        providerName: data.providerName || data.provider,
        nativeHeaders: data.nativeHeaders,
        attempts: data.attempts || [],
      };
    }
    if (isXSeriesId) {
      throw new StreamResolutionError(data.error || "No provider returned a usable source.", data.attempts || []);
    }
  } catch (error) {
    if (error instanceof StreamResolutionError) throw error;
    if (isXSeriesId) {
      throw new StreamResolutionError("Could not reach the XSeries playback resolver.");
    }
    // Legacy catalogue IDs may continue through the older playback routes.
  }

  try {
    const res = await fetch("/api/catalog/" + encodeURIComponent(id) + "/playback");
    if (res.ok) {
      const data = (await res.json()) as {
        ok: boolean;
        playback?: { url?: string; provider?: string };
      };
      if (data.ok && data.playback?.url) {
        return {
          streamUrl: data.playback.url,
          sourceType: data.playback.provider || "embed",
          title: "Cinema Stream",
          originalUrl: data.playback.url,
          providerName: data.playback.provider,
        };
      }
    }
  } catch {
    // Continue to the legacy embed fallback.
  }

  return {
    streamUrl: "/api/stream/embed/" + encodeURIComponent(id),
    sourceType: "xseries",
    title: "Cinema Stream",
    providerName: "Legacy resolver",
  };
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
  const [playbackFailed, setPlaybackFailed] = useState(false);

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
  const streamAttempts = streamError instanceof StreamResolutionError ? streamError.attempts : (streamData?.attempts || []);
  const streamUrl =
    activeStreamData?.streamUrl ||
    activeMovie?.streamUrl ||
    activeMovie?.videoUrl ||
    (activeId ? `/api/stream/embed/${encodeURIComponent(activeId)}` : "");
  const originalUrl = activeStreamData?.originalUrl || activeMovie?.videoUrl || streamUrl;
  const youtubeId = getYouTubeId(originalUrl) || getYouTubeId(streamUrl);
  const isYouTubeSource = streamData?.sourceType?.toLowerCase() === "youtube" || activeMovie?.provider?.toLowerCase() === "youtube" || Boolean(youtubeId);
  const playerStreamUrl = isYouTubeSource && youtubeId ? originalUrl : streamUrl;
  const nativeCinemaDirectUrl = activeStreamData?.provider === "cinepro" && isNativeVlcPlatform()
    ? streamUrl
    : isDirectMediaUrl(originalUrl) ? originalUrl : "";
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
  const tryAnotherSource = async () => {
    const currentProvider = activeStreamData?.provider;
    if (!activeId || !currentProvider || isTryingAnotherSource) return;
    const excludedProviders = [...new Set([...failedProviders, currentProvider])];
    setIsTryingAnotherSource(true);
    setFallbackMessage("");
    try {
      const params = new URLSearchParams({ id: activeId, platform: isNativeVlcPlatform() ? "native" : "web", exclude: excludedProviders.join(",") });
      const response = await fetch("/api/xtv-series/stream?" + params.toString(), { cache: "no-store" });
      const data = await response.json() as { ok?: boolean; streamUrl?: string; sourceType?: string; provider?: string; providerName?: string; nativeHeaders?: Record<string, string>; item?: { title?: string; videoUrl?: string } };
      if (!response.ok || !data.ok || !data.streamUrl || !data.provider) {
        setFallbackMessage("No other source is available right now.");
        return;
      }
      setFailedProviders(excludedProviders);
      setFallbackStream({ streamUrl: data.streamUrl, sourceType: data.sourceType || "xseries", title: data.item?.title || title, originalUrl: data.item?.videoUrl || data.streamUrl, provider: data.provider, providerName: data.providerName || data.provider, nativeHeaders: data.nativeHeaders });
      setPlaybackFailed(false);
      setFallbackMessage("Switched to " + (data.providerName || data.provider) + ".");
    } catch {
      setFallbackMessage("Could not reach another source. Please try again.");
    } finally {
      setIsTryingAnotherSource(false);
    }
  };

  const upNextMovies = useMemo(
    () => allMovies.filter((movie) => movie.id !== activeId),
    [allMovies, activeId],
  );

  useEffect(() => {
    setFallbackStream(null);
    setFailedProviders([]);
    setFallbackMessage("");
    setPlaybackFailed(false);
  }, [activeId]);

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
          <h1 className="xora-watch-header-title" title={title}>{displayTitle}</h1>
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
                <p>{streamError instanceof Error ? streamError.message : "We couldn’t prepare this stream."}</p>
                {streamAttempts.length > 0 ? (
                  <div className="xora-watch-provider-diagnostics" role="status">
                    <strong>Provider checks (priority order)</strong>
                    {streamAttempts.map((attempt, index) => (
                      <div key={attempt.provider + index}>
                        <span>{index + 1}. {attempt.provider === "cinepro" ? "CinePro" : attempt.provider}</span>
                        <span>{attempt.status}{attempt.reason ? " · " + attempt.reason : ""}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <button type="button" className="xora-watch-primary" onClick={() => void refetchStream()}>
                  Try again
                </button>
              </div>
            ) : streamUrl ? (
              <VideoPlayer
                key={activeId}
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
                  setFallbackMessage("This source couldn't start the video. Try another provider.");
                }}
                cinemaMode
              />
            ) : (
              <div className="xora-watch-player-message">
                <Film size={30} aria-hidden="true" />
                <p>{isLoadingMovies ? "Finding your film…" : "No stream is available for this title."}</p>
              </div>
            )}
          </div>
          {activeStreamData?.provider ? (
            <div className="xora-watch-sourcebar">
              <span className="xora-watch-source-label">Source · {activeStreamData.providerName || activeStreamData.provider}</span>
              {streamAttempts.length > 0 ? (
                <div className="xora-watch-provider-diagnostics" aria-label="Provider resolution order">
                  <strong>Provider checks (priority order)</strong>
                  {streamAttempts.map((attempt, index) => (
                    <div key={attempt.provider + index}>
                      <span>{index + 1}. {attempt.provider === "cinepro" ? "CinePro" : attempt.provider}</span>
                      <span>{attempt.status}{attempt.reason ? " · " + attempt.reason : ""}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {(playbackFailed || activeStreamData.sourceType === "xseries") ? (
                <button
                  type="button"
                  onClick={() => void tryAnotherSource()}
                  disabled={isTryingAnotherSource}
                  className="xora-watch-primary"
                >
                  {isTryingAnotherSource ? "Finding another provider…" : playbackFailed ? "Try another source" : "Source not working? Try another"}
                </button>
              ) : null}
              {fallbackMessage ? <span className="xora-watch-source-feedback" role="status">{fallbackMessage}</span> : null}
            </div>
          ) : playbackFailed ? (
            <div className="xora-watch-sourcebar">
              <span className="xora-watch-source-label">Playback could not start.</span>
              <button type="button" onClick={() => void refetchStream()} className="xora-watch-primary">Try again</button>
            </div>
          ) : null}
        </div>

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
              <span className="xora-watch-settings-subtitle">Audio &amp; stream information</span>
            </span>
            {settingsOpen ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
          </button>
          {settingsOpen ? (
            <div id="xora-watch-settings-content" className="xora-watch-settings-content">
              {activeStreamData?.providerName ? (
                <div><span>Stream provider</span><strong>{activeStreamData.providerName}</strong></div>
              ) : null}
              {activeStreamData?.sourceType ? (
                <div><span>Playback type</span><strong>{activeStreamData.sourceType === "xseries" ? "Embedded player" : activeStreamData.sourceType.toUpperCase()}</strong></div>
              ) : null}
              {activeMovie?.provider ? (
                <div><span>Provider</span><strong>{activeMovie.provider}</strong></div>
              ) : null}
              {!activeStreamData?.sourceType && !activeMovie?.provider ? (
                <p>Playback details will appear here when the source provides them.</p>
              ) : null}
            </div>
          ) : null}
        </section>

        {upNextMovies.length > 0 ? (
          <section className="xora-watch-up-next">
            <div className="xora-watch-section-heading">
              <h3>Up next</h3>
              <Link to="/xtv-series">See all</Link>
            </div>
            <div className="xora-watch-rail">
              {upNextMovies.slice(0, 12).map((movie) => (
                <button
                  key={movie.id}
                  type="button"
                  className="xora-watch-next-card"
                  onClick={() => {
                    void navigate({ to: "/watch", search: { id: movie.id } });
                    window.scrollTo({ top: 0, behavior: "auto" });
                  }}
                >
                  <span className="xora-watch-next-image">
                    {movie.thumbnailUrl ? (
                      <img src={movie.thumbnailUrl} alt="" loading="lazy" />
                    ) : (
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
        ) : null}
      </main>
    </div>
  );
}
