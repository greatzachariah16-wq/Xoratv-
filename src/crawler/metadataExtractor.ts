/**
 * 4. Page/Video Metadata Extraction Component
 *
 * Extracts structured metadata from web pages, HTML meta tags (OpenGraph, Schema.org / JSON-LD),
 * and media payloads.
 */

import type { ContentType, DiscoveredCandidate } from "./types.ts";

export interface RawPagePayload {
  url: string;
  sourceName: string;
  html?: string | undefined;
  jsonLd?: Record<string, unknown>[] | undefined;
  openGraph?: Record<string, string> | undefined;
  query: string;
}

export class MetadataExtractor {
  /**
   * Parses raw page or video metadata into a normalized candidate object.
   */
  public extract(payload: RawPagePayload): Partial<DiscoveredCandidate> {
    const title = payload.openGraph?.["og:title"] || "";
    const description = payload.openGraph?.["og:description"] || "";
    const trailerUrl = payload.openGraph?.["og:video"] || undefined;

    return {
      title,
      description,
      sourceUrl: payload.url,
      sourceName: payload.sourceName,
      discoveryQuery: payload.query,
      trailerUrl,
      discoveryTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Infers base content type from title and metadata signals.
   */
  public inferContentType(title: string, description: string): ContentType {
    const text = `${title} ${description}`.toLowerCase();
    if (text.includes("trailer") || text.includes("teaser")) return "trailer";
    if (text.includes("documentary")) return "documentary";
    if (text.includes("wrestling") || text.includes("wwe") || text.includes("aew"))
      return "sports_wrestling";
    if (text.includes("interview") || text.includes("in conversation")) return "interview";
    if (text.includes("course") || text.includes("lecture") || text.includes("tutorial"))
      return "educational";
    if (text.includes("movie") || text.includes("film") || text.includes("feature film"))
      return "movie";
    return "other_video";
  }
}
