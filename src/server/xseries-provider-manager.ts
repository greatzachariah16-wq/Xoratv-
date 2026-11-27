/**
 * Shared XSeries provider contract.
 *
 * Provider-specific adapters are intentionally registered only after their
 * documented API and distribution permissions have been verified.
 */

export type XSeriesProviderId = "cinepro" | "vidsrc" | "twoembed";

export type XSeriesMediaKind = "movie" | "episode";

export interface XSeriesLookup {
  tmdbId: number;
  mediaKind: XSeriesMediaKind;
  title: string;
  releaseYear?: number;
  season?: number;
  episode?: number;
}

export type XSeriesPlaybackSource =
  | { kind: "direct-hls" | "direct-dash" | "direct-file"; url: string; mimeType?: string }
  | { kind: "embed"; url: string };

export type XSeriesProviderResult =
  | { status: "available"; source: XSeriesPlaybackSource }
  | { status: "unavailable"; reason?: "not-found" | "not-supported" }
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

/**
 * Resolve in explicit priority order. Only a clean "unavailable" response
 * advances to the next provider. Authentication, rate-limit and provider
 * errors remain visible in diagnostics rather than being silently masked.
 */
export async function resolveXSeriesWithFallback<Env>(
  lookup: XSeriesLookup,
  env: Env,
  adapters: readonly XSeriesProviderAdapter<Env>[],
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
      ...(result.status === "unavailable" ? { reason: result.reason } : {}),
      ...(result.status === "error" ? { reason: result.reason } : {}),
    });

    if (result.status === "available") {
      return {
        playback: { provider: adapter.id, source: result.source },
        attempts,
      };
    }

    // Do not disguise authentication, policy, rate-limit or outage errors
    // as a missing title and cascade into a different provider.
    if (result.status === "error") break;
  }

  return { playback: null, attempts };
}
