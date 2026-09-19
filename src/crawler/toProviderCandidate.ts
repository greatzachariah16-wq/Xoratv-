/**
 * Bridge mapper: DiscoveredCandidate -> ProviderCandidate
 *
 * Converts crawler DiscoveredCandidate records into ProviderCandidate records
 * so they can be safely published into public feeds via publishCandidate().
 */

import type { DiscoveredCandidate } from "./types.ts";
import type { ProviderCandidate, ProviderType } from "@/integrations/providers/types";
import { parseEmbedInfo } from "@/integrations/providers/embed";

/**
 * Normalizes provider name from candidate source
 */
export function inferProviderType(sourceName: string, sourceUrl: string): ProviderType | "web" {
  const urlLower = (sourceUrl || "").toLowerCase();
  const nameLower = (sourceName || "").toLowerCase();

  if (
    nameLower.includes("youtube") ||
    urlLower.includes("youtube.com") ||
    urlLower.includes("youtu.be")
  ) {
    return "youtube";
  }
  if (
    nameLower.includes("dailymotion") ||
    urlLower.includes("dailymotion.com") ||
    urlLower.includes("dai.ly")
  ) {
    return "dailymotion";
  }
  if (nameLower.includes("vimeo") || urlLower.includes("vimeo.com")) {
    return "vimeo";
  }
  if (nameLower.includes("noaa") || urlLower.includes("noaa.gov")) {
    return "noaa";
  }
  return "web";
}

/**
 * Determines whether a DiscoveredCandidate contains a valid embeddable or streamable video URL.
 * Excludes plain HTML landing pages without playable video embeds.
 */
export function isEmbeddableCandidate(candidate: DiscoveredCandidate): boolean {
  const targetUrl = candidate.trailerUrl || candidate.sourceUrl;
  if (!targetUrl) return false;

  const provider = inferProviderType(candidate.sourceName, candidate.sourceUrl);

  // 1. YouTube, Vimeo, Dailymotion embed check
  const embedInfo = parseEmbedInfo(targetUrl, provider);
  if (embedInfo && embedInfo.embedUrl) {
    return true;
  }

  // 2. Direct media video stream URL (.mp4, .m3u8, .webm, etc.)
  const urlLower = targetUrl.toLowerCase();
  if (
    urlLower.endsWith(".mp4") ||
    urlLower.endsWith(".m3u8") ||
    urlLower.endsWith(".webm") ||
    urlLower.includes(".mp4?") ||
    urlLower.includes(".m3u8?") ||
    urlLower.includes("oceanexplorer.noaa.gov/video")
  ) {
    return true;
  }

  return false;
}

/**
 * Converts a DiscoveredCandidate to a ProviderCandidate object.
 */
export function toProviderCandidate(candidate: DiscoveredCandidate): ProviderCandidate {
  const targetUrl = candidate.trailerUrl || candidate.sourceUrl;
  const inferredProvider = inferProviderType(candidate.sourceName, candidate.sourceUrl);

  let embedUrl = targetUrl;
  const parsedEmbed = parseEmbedInfo(targetUrl, inferredProvider);
  if (parsedEmbed?.embedUrl) {
    embedUrl = parsedEmbed.embedUrl;
  }

  let thumbnailUrl: string | null = null;
  if (typeof candidate.rawMetadata?.thumbnailUrl === "string") {
    thumbnailUrl = candidate.rawMetadata.thumbnailUrl;
  }

  // Generate fallback thumbnails for YouTube / Dailymotion
  if (!thumbnailUrl) {
    if (inferredProvider === "youtube") {
      const match =
        targetUrl.match(/(?:watch\?v=|embed\/|shorts\/|youtu\.be\/)([\w-]{11})/) ||
        targetUrl.match(/yt-([\w-]{11})/);
      if (match) {
        thumbnailUrl = `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg`;
      }
    } else if (inferredProvider === "dailymotion") {
      const match = targetUrl.match(/(?:video\/|embed\/video\/|dm-)([a-zA-Z0-9]+)/);
      if (match) {
        thumbnailUrl = `https://www.dailymotion.com/thumbnail/video/${match[1]}`;
      }
    }
  }

  const durationSeconds =
    typeof candidate.rawMetadata?.durationSeconds === "number"
      ? candidate.rawMetadata.durationSeconds
      : null;

  const provider: ProviderType = inferredProvider === "web" ? "youtube" : inferredProvider;

  return {
    id: candidate.id,
    provider,
    title: candidate.title,
    description: candidate.description || null,
    thumbnailUrl,
    embedUrl,
    watchUrl: candidate.sourceUrl,
    durationSeconds,
    channelName: candidate.sourceName || null,
    publishedAt: candidate.discoveryTimestamp || new Date().toISOString(),
    tags: Array.from(new Set([...(candidate.tags || []), ...(candidate.genres || [])])),
  };
}
