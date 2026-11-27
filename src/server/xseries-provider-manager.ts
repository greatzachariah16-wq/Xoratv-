/**
 * XSeries provider registry and ordered fallback resolver.
 *
 * CinePro Core is a self-hosted OMSS endpoint configured with
 * CINEPRO_API_BASE_URL. The other providers expose iframe embeds; they are
 * deliberately represented as embeds rather than mislabeled as direct media.
 */

export type XSeriesProviderId = "cinepro" | "vidsrc" | "twoembed" | "cinesrc" | "bingeapi";
export type XSeriesMediaKind = "movie" | "episode";

export interface XSeriesLookup {
  tmdbId: number;
  mediaKind: XSeriesMediaKind;
  title: string;
  releaseYear?: number;
  season?: number;
  episode?: number;
  platform?: "web" | "native";
}

export type XSeriesPlaybackSource =
  | { kind: "direct-hls" | "direct-dash" | "direct-file"; url: string; mimeType?: string; headers?: Record<string, string> }
  | { kind: "embed"; url: string };

export type XSeriesProviderResult =
  | { status: "available"; source: XSeriesPlaybackSource }
  | { status: "unavailable"; reason?: "not-found" | "not-supported" | "provider-unreachable" }
  | { status: "error"; reason: "unauthorized" | "rate-limited" | "provider-error" | "invalid-response" };

export interface XSeriesProviderAdapter<Env = Record<string, unknown>> {
  id: XSeriesProviderId;
  priority: number;
  isEnabled(env: Env): boolean;
  resolve(lookup: XSeriesLookup, env: Env): Promise<XSeriesProviderResult>;
}

export interface XSeriesResolvedPlayback {
  provider: XSeriesProviderId;
  source: XSeriesPlaybackSource;
}

export interface XSeriesProviderAttempt {
  provider: XSeriesProviderId;
  status: XSeriesProviderResult["status"];
  reason?: string;
}

export interface XSeriesResolution {
  playback: XSeriesResolvedPlayback | null;
  attempts: XSeriesProviderAttempt[];
}

type ProviderEnv = {
  CINEPRO_API_BASE_URL?: string;
};

const timeoutSignal = (milliseconds = 9000) => AbortSignal.timeout(milliseconds);
// Render may have suspended CinePro Core between requests. Give its first
// cold-start resolution enough time to boot before treating it as unavailable.
const CINEPRO_RESOLVE_TIMEOUT_MS = 45000;

function secureUrl(value: unknown, base?: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value, base);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

async function probeEmbed(url: string): Promise<XSeriesProviderResult> {
  try {
    let response = await fetch(url, { method: "HEAD", signal: timeoutSignal() });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: timeoutSignal(),
      });
      await response.body?.cancel();
    }
    if (response.status === 404 || response.status === 410) {
      return { status: "unavailable", reason: "not-found" };
    }
    if (response.status === 429) return { status: "error", reason: "rate-limited" };
    if (response.status === 401) return { status: "error", reason: "unauthorized" };
    // Some embed hosts deny server-side HEAD requests while allowing their
    // player page to load in a real browser. Treat 403 as an iframe candidate;
    // the browser player will surface an error if the page itself is blocked.
    return response.ok || response.status === 403 || (response.status >= 300 && response.status < 400)
      ? { status: "available", source: { kind: "embed", url } }
      : { status: "unavailable", reason: "provider-unreachable" };
  } catch {
    return { status: "unavailable", reason: "provider-unreachable" };
  }
}

function embedUrl(provider: "twoembed" | "cinesrc" | "bingeapi" | "vidsrc", lookup: XSeriesLookup): string {
  const id = String(lookup.tmdbId);
  if (provider === "twoembed") {
    return lookup.mediaKind === "movie"
      ? `https://www.2embed.cc/embed/${id}`
      : `https://www.2embed.cc/embedtv/${id}&s=${lookup.season}&e=${lookup.episode}`;
  }
  if (provider === "cinesrc") {
    return lookup.mediaKind === "movie"
      ? `https://cinesrc.st/embed/movie/${id}`
      : `https://cinesrc.st/embed/tv/${id}?s=${lookup.season}&e=${lookup.episode}`;
  }
  if (provider === "bingeapi") {
    return lookup.mediaKind === "movie"
      ? `https://bingeapi.st/embed/movie/${id}`
      : `https://bingeapi.st/embed/tv/${id}/${lookup.season}/${lookup.episode}`;
  }
  return lookup.mediaKind === "movie"
    ? `https://vidsrc.sh/embed/movie/${id}`
    : `https://vidsrc.sh/embed/tv/${id}/${lookup.season}/${lookup.episode}`;
}

const cineproAdapter: XSeriesProviderAdapter<ProviderEnv> = {
  id: "cinepro",
  priority: 1,
  isEnabled: (env) => Boolean(env.CINEPRO_API_BASE_URL?.trim()),
  async resolve(lookup, env) {
    const base = secureUrl(env.CINEPRO_API_BASE_URL || "");
    if (!base) return { status: "unavailable", reason: "not-supported" };
    const endpoint = lookup.mediaKind === "movie"
      ? `/v1/movies/${lookup.tmdbId}`
      : `/v1/tv/${lookup.tmdbId}/seasons/${lookup.season}/episodes/${lookup.episode}`;
    const requestUrl = new URL(endpoint, base);
    requestUrl.searchParams.set("platform", lookup.platform === "native" ? "native" : "web");
    try {
      const response = await fetch(requestUrl, {
        headers: { Accept: "application/json" },
        signal: timeoutSignal(CINEPRO_RESOLVE_TIMEOUT_MS),
      });
      if (response.status === 404) return { status: "unavailable", reason: "not-found" };
      if (response.status === 401 || response.status === 403) return { status: "error", reason: "unauthorized" };
      if (response.status === 429) return { status: "error", reason: "rate-limited" };
      if (!response.ok) return { status: "unavailable", reason: "provider-unreachable" };

      const data = await response.json() as {
        sources?: Array<{ url?: unknown; type?: unknown; streamable?: unknown; headers?: unknown; quality?: unknown }>;
      };
      if (!Array.isArray(data.sources)) return { status: "error", reason: "invalid-response" };
      const candidates = data.sources
        .map((item) => {
          if (item.streamable === false) return null;
          const url = secureUrl(item.url, base);
          const type = String(item.type || "").toLowerCase();
          if (!url) return null;
          const headers = item.headers && typeof item.headers === "object"
            ? Object.fromEntries(Object.entries(item.headers as Record<string, unknown>)
                .filter((entry): entry is [string, string] => typeof entry[1] === "string"))
            : undefined;
          if (type === "embed") return { kind: "embed" as const, url };
          if (type === "hls" || type === "m3u8") return { kind: "direct-hls" as const, url, mimeType: "application/vnd.apple.mpegurl", ...(headers ? { headers } : {}) };
          if (type === "dash" || type === "mpd") return { kind: "direct-dash" as const, url, mimeType: "application/dash+xml", ...(headers ? { headers } : {}) };
          if (["mp4", "mkv", "webm", "http", "file", "video"].includes(type)) return { kind: "direct-file" as const, url, mimeType: type === "mp4" ? "video/mp4" : undefined, ...(headers ? { headers } : {}) };
          return null;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const source = candidates[0];
      return source
        ? { status: "available", source }
        : { status: "unavailable", reason: "not-found" };
    } catch {
      return { status: "unavailable", reason: "provider-unreachable" };
    }
  },
};

const vidsrcAdapter: XSeriesProviderAdapter<ProviderEnv> = {
  id: "vidsrc",
  priority: 2,
  isEnabled: () => true,
  async resolve(lookup) {
    const infoPath = lookup.mediaKind === "movie"
      ? `https://vidsrc.sh/info/movie/${lookup.tmdbId}.json`
      : `https://vidsrc.sh/info/tv/${lookup.tmdbId}/${lookup.season}/${lookup.episode}.json`;
    try {
      const response = await fetch(infoPath, { headers: { Accept: "application/json" }, signal: timeoutSignal() });
      if (response.status === 404) return { status: "unavailable", reason: "not-found" };
      if (response.status === 429) return { status: "error", reason: "rate-limited" };
      if (response.ok) {
        const data = await response.json() as { status_code?: number; embed_url_tmdb?: unknown };
        if (data.status_code === 404) return { status: "unavailable", reason: "not-found" };
        const infoEmbed = secureUrl(data.embed_url_tmdb);
        if (infoEmbed) return probeEmbed(infoEmbed);
      }
    } catch {
      // The info endpoint is optional; continue with the provider's standard embed route.
    }
    return probeEmbed(embedUrl("vidsrc", lookup));
  },
};

const twoembedAdapter: XSeriesProviderAdapter<ProviderEnv> = {
  id: "twoembed",
  priority: 3,
  isEnabled: () => true,
  resolve: (lookup) => probeEmbed(embedUrl("twoembed", lookup)),
};

const cinesrcAdapter: XSeriesProviderAdapter<ProviderEnv> = {
  id: "cinesrc",
  priority: 4,
  isEnabled: () => true,
  resolve: (lookup) => probeEmbed(embedUrl("cinesrc", lookup)),
};

const bingeapiAdapter: XSeriesProviderAdapter<ProviderEnv> = {
  id: "bingeapi",
  priority: 5,
  isEnabled: () => true,
  resolve: (lookup) => probeEmbed(embedUrl("bingeapi", lookup)),
};

export const XSERIES_PROVIDER_ADAPTERS: readonly XSeriesProviderAdapter<ProviderEnv>[] = [
  cineproAdapter,
  vidsrcAdapter,
  twoembedAdapter,
  cinesrcAdapter,
  bingeapiAdapter,
];

/** Resolve in priority order, advancing when a provider is unavailable. */
export async function resolveXSeriesWithFallback<Env extends ProviderEnv>(
  lookup: XSeriesLookup,
  env: Env,
  adapters: readonly XSeriesProviderAdapter<Env>[] = XSERIES_PROVIDER_ADAPTERS as readonly XSeriesProviderAdapter<Env>[],
): Promise<XSeriesResolution> {
  const ordered = [...adapters]
    .filter((adapter) => adapter.isEnabled(env))
    .sort((a, b) => a.priority - b.priority);
  const attempts: XSeriesProviderAttempt[] = [];

  for (const adapter of ordered) {
    let result: XSeriesProviderResult;
    try {
      result = await adapter.resolve(lookup, env);
    } catch {
      result = { status: "error", reason: "provider-error" };
    }
    attempts.push({
      provider: adapter.id,
      status: result.status,
      ...(result.status === "unavailable" || result.status === "error" ? { reason: result.reason } : {}),
    });
    if (result.status === "available") {
      return { playback: { provider: adapter.id, source: result.source }, attempts };
    }
    // Continue through the remaining providers on outages and no-match results.
  }
  return { playback: null, attempts };
}
