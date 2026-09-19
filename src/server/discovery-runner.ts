/**
 * Full Automated Discovery Runner for XoraTV.
 *
 * Runs scheduled and on-demand discovery across all sources:
 * - Open repositories (NOAA, Internet Archive, Wikimedia Commons, NASA SVS)
 * - Video APIs (YouTube, Vimeo, Dailymotion, NOAA Ocean Exploration)
 *
 * Persists all candidates directly into Firebase RTDB (/posts and /postsByFeed)
 * so the ranking algorithm and live feeds immediately have rich content.
 */

import { runDiscovery } from "../lib/discovery/engine.server";
import { runCrawlerCycle } from "../crawler/engine";
import {
  searchAllProvidersWithStatus,
  autoPublishHighConfidenceCandidates,
  saveCandidatesBatchToRtdb,
} from "../integrations/providers";

let isDiscoveryRunning = false;
let lastDiscoveryRunTime: string | null = null;
let lastDiscoverySummary: Record<string, unknown> | null = null;
let discoveryIntervalTimer: NodeJS.Timeout | null = null;

const DEFAULT_DISCOVERY_QUERIES = [
  "full movie 2025",
  "feature film 2026 trailer",
  "horror movie 2025",
  "sci-fi movie 2026",
  "thriller feature film",
  "official movie trailer 2026",
];

export interface AutomatedDiscoveryOptions {
  queries?: string[];
  limitPerQuery?: number;
  autoPublishTrusted?: boolean;
  runOpenEngine?: boolean;
  runProviders?: boolean;
}

export async function runFullAutomatedDiscovery(options?: AutomatedDiscoveryOptions) {
  if (isDiscoveryRunning) {
    return {
      status: "skipped",
      message: "Discovery cycle already running in background",
      lastRunTime: lastDiscoveryRunTime,
      lastSummary: lastDiscoverySummary,
    };
  }

  isDiscoveryRunning = true;
  const startTime = Date.now();
  const queries = options?.queries || DEFAULT_DISCOVERY_QUERIES;
  const limitPerQuery = options?.limitPerQuery || 6;
  const runOpen = options?.runOpenEngine ?? true;
  const runProviders = options?.runProviders ?? true;

  const summary: {
    startedAt: string;
    completedAt?: string;
    durationMs?: number;
    openEngineResults?: unknown;
    providerStatuses?: Array<Record<string, unknown>>;
    totalDiscoveredCandidates: number;
    totalAutoPublishedPosts: number;
  } = {
    startedAt: new Date().toISOString(),
    totalDiscoveredCandidates: 0,
    totalAutoPublishedPosts: 0,
  };

  try {
    console.log("[Discovery Runner] Starting automated discovery cycle...");

    // 0. Run Smart Crawler Discovery Engine
    try {
      console.log("[Discovery Runner] Running smart Xora crawler cycle...");
      const crawlerSummary = await runCrawlerCycle({ autoPublish: true, maxQueriesPerCategory: 2 });
      summary.totalDiscoveredCandidates += crawlerSummary.candidatesFound;
      console.log(
        `[Discovery Runner] Smart crawler finished. Found ${crawlerSummary.candidatesFound} candidates, stored ${crawlerSummary.candidatesStored}.`,
      );
    } catch (crawlerErr) {
      console.error("[Discovery Runner] Smart crawler error:", crawlerErr);
    }

    // 1. Run Open Video Discovery Engine (NOAA, Internet Archive, Wikimedia, NASA SVS)
    if (runOpen) {
      try {
        console.log("[Discovery Runner] Running open-video discovery engine...");
        const openResults = await runDiscovery();
        summary.openEngineResults = openResults;
        const openAccepted = openResults.reduce((acc, r) => acc + (r.inserted || 0), 0);
        summary.totalAutoPublishedPosts += openAccepted;
        console.log(
          `[Discovery Runner] Open engine finished. Auto-published ${openAccepted} posts to RTDB.`,
        );
      } catch (openErr) {
        console.error("[Discovery Runner] Open discovery engine error:", openErr);
        summary.openEngineResults = { error: String(openErr) };
      }
    }

    // 2. Run Provider Discovery (YouTube, Vimeo, Dailymotion, NOAA)
    if (runProviders) {
      const allProviderCandidates = [];
      const aggregatedStatuses: Record<string, { ok: boolean; count: number; error?: string }> = {};

      for (const query of queries) {
        try {
          const res = await searchAllProvidersWithStatus({
            query,
            limit: limitPerQuery,
            minDurationSeconds: 2400, // 40 minutes upwards for movies
            autoPublishTrusted: true,
          });

          for (const status of res.statuses) {
            if (!aggregatedStatuses[status.provider]) {
              aggregatedStatuses[status.provider] = {
                ok: status.ok,
                count: 0,
                error: status.error,
              };
            }
            aggregatedStatuses[status.provider].count += status.count;
            if (status.error) {
              aggregatedStatuses[status.provider].error = status.error;
            }
          }

          if (res.candidates.length > 0) {
            allProviderCandidates.push(...res.candidates);
            // Save candidate backups to /crawler/candidates
            await saveCandidatesBatchToRtdb(res.candidates).catch(() => {});
            // Auto-publish all high confidence (NOAA and direct streams)
            const published = await autoPublishHighConfidenceCandidates(res.candidates, {
              trustedOnly: false, // In automated mode, publish valid items
            });
            summary.totalAutoPublishedPosts += published.length;
          }
        } catch (queryErr) {
          console.warn(`[Discovery Runner] Query "${query}" execution warning:`, queryErr);
        }
      }

      summary.totalDiscoveredCandidates += allProviderCandidates.length;
      summary.providerStatuses = Object.entries(aggregatedStatuses).map(([provider, stat]) => ({
        provider,
        ok: stat.ok,
        totalFound: stat.count,
        error: stat.error,
      }));
    }

    summary.completedAt = new Date().toISOString();
    summary.durationMs = Date.now() - startTime;
    lastDiscoveryRunTime = summary.completedAt;
    lastDiscoverySummary = summary;

    console.log(
      `[Discovery Runner] Completed in ${summary.durationMs}ms. Discovered: ${summary.totalDiscoveredCandidates}, Published: ${summary.totalAutoPublishedPosts}`,
    );

    return summary;
  } catch (fatalErr) {
    console.error("[Discovery Runner] Fatal discovery error:", fatalErr);
    throw fatalErr;
  } finally {
    isDiscoveryRunning = false;
  }
}

/**
 * Initializes background scheduled discovery.
 * Can be configured via environment variable `DISCOVERY_AUTO_INTERVAL_MINUTES`.
 */
export function startDiscoveryScheduler() {
  if (discoveryIntervalTimer) {
    clearInterval(discoveryIntervalTimer);
    discoveryIntervalTimer = null;
  }

  const intervalMinutesStr =
    (typeof process !== "undefined" && process.env?.DISCOVERY_AUTO_INTERVAL_MINUTES) || "360";
  const intervalMinutes = Math.max(5, parseInt(intervalMinutesStr, 10) || 360);
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(
    `[Discovery Scheduler] Initializing automated discovery every ${intervalMinutes} minutes.`,
  );

  // Initial non-blocking background discovery run after server boot
  setTimeout(() => {
    runFullAutomatedDiscovery().catch((err) => {
      console.warn("[Discovery Scheduler] Initial discovery warning:", err);
    });
  }, 10000); // 10s after startup

  discoveryIntervalTimer = setInterval(() => {
    runFullAutomatedDiscovery().catch((err) => {
      console.warn("[Discovery Scheduler] Periodic discovery warning:", err);
    });
  }, intervalMs);
}
