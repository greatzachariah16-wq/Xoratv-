/**
 * XTv Series & Movie background discovery engine for XoraTV.
 *
 * Dedicated content source powered exclusively by FaoTV (TeamRaven).
 * Completely removes YouTube, Vimeo, and Dailymotion from the XTv Series pipeline.
 * Pulls full-length continuous channels, series sets, and movie streams.
 * Bypasses the admin publish gate and persists directly to Firebase RTDB (/xtvSeries/items).
 */

import { discoverFaoTvSeriesAndMovies } from "../integrations/providers/faotv";
import type { XTvSeriesItem, XTvSeriesRun } from "../integrations/firebase/rtdb";

let isSeriesRunning = false;
let lastSeriesRunTime: string | null = null;
let lastSeriesSummary: Record<string, unknown> | null = null;
let seriesSchedulerTimer: NodeJS.Timeout | null = null;

const DEFAULT_FIREBASE_DATABASE_URL = "https://xora-tv-default-rtdb.firebaseio.com";

function getDbUrl(): string | null {
  const raw =
    process.env.VITE_FIREBASE_DATABASE_URL ||
    process.env.FIREBASE_DATABASE_URL ||
    DEFAULT_FIREBASE_DATABASE_URL;
  if (!raw) return null;
  const cleaned = raw
    .replace(/[",;\x27]/g, "")
    .trim()
    .replace(/\/+$/, "");
  return cleaned || null;
}

function sanitizeKey(key: string): string {
  return key.replace(/[.#$[\]/]/g, "_");
}

export async function runXTvSeriesDiscovery(): Promise<{
  ok: boolean;
  persistedCount: number;
  runId: string;
  error?: string;
}> {
  if (isSeriesRunning) {
    return {
      ok: true,
      persistedCount: 0,
      runId: "skipped_already_running",
    };
  }

  isSeriesRunning = true;
  const runId = `faotv_series_run_${Date.now()}`;
  const startTime = new Date().toISOString();
  let itemsFound = 0;
  let itemsPersisted = 0;

  try {
    const dbUrl = getDbUrl();
    console.log("[XTvSeries] Starting FaoTV series & movie channel discovery...");

    // Discover movies and series channels from FaoTV exclusively
    const candidateItems = await discoverFaoTvSeriesAndMovies();
    itemsFound = candidateItems.length;
    console.log(`[XTvSeries] Discovered ${itemsFound} channels from FaoTV.`);

    // Persist to RTDB
    if (dbUrl && candidateItems.length > 0) {
      // First, purge legacy non-FaoTV items (YouTube, Vimeo, Dailymotion) if present
      try {
        const existingRes = await fetch(`${dbUrl.replace(/\/+$/, "")}/xtvSeries/items.json`);
        if (existingRes.ok) {
          const existingData = (await existingRes.json()) as Record<string, XTvSeriesItem> | null;
          if (existingData) {
            for (const [key, item] of Object.entries(existingData)) {
              if (
                item.provider === "youtube" ||
                item.provider === "vimeo" ||
                item.provider === "dailymotion" ||
                item.id.startsWith("yt_") ||
                item.id.startsWith("vim_") ||
                item.id.startsWith("dm_")
              ) {
                void fetch(`${dbUrl.replace(/\/+$/, "")}/xtvSeries/items/${key}.json`, {
                  method: "DELETE",
                }).catch(() => {});
              }
            }
          }
        }
      } catch (purgeErr) {
        console.warn("[XTvSeries] Notice on legacy items check:", purgeErr);
      }

      // Persist discovered FaoTV channels
      for (const item of candidateItems) {
        try {
          const safeId = sanitizeKey(item.id);
          const putRes = await fetch(
            `${dbUrl.replace(/\/+$/, "")}/xtvSeries/items/${safeId}.json`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item),
            },
          );
          if (putRes.ok) itemsPersisted++;
        } catch {
          // ignore single item persistence errors
        }
      }

      // Record run summary
      const runRecord: XTvSeriesRun = {
        id: runId,
        timestamp: startTime,
        itemsFound,
        itemsPersisted,
        status: "completed",
      };
      await fetch(`${dbUrl.replace(/\/+$/, "")}/xtvSeries/runs/${runId}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runRecord),
      }).catch(() => {});
    }

    lastSeriesRunTime = new Date().toISOString();
    lastSeriesSummary = {
      runId,
      itemsFound,
      itemsPersisted,
      timestamp: lastSeriesRunTime,
      provider: "faotv",
    };

    console.log(
      `[XTvSeries] FaoTV engine run complete. Found: ${itemsFound}, Persisted: ${itemsPersisted}`,
    );

    return {
      ok: true,
      persistedCount: itemsPersisted,
      runId,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "XTv Series FaoTV discovery failed";
    console.error("[XTvSeries] Engine run error:", err);
    return {
      ok: false,
      persistedCount: itemsPersisted,
      runId,
      error: errorMsg,
    };
  } finally {
    isSeriesRunning = false;
  }
}

/**
 * Initializes the background scheduler to run XTv Series discovery every 60 minutes.
 */
export function startXTvSeriesScheduler() {
  if (seriesSchedulerTimer) {
    clearInterval(seriesSchedulerTimer);
  }

  const intervalMinutes = parseInt(process.env.XTV_SERIES_INTERVAL_MINUTES || "60", 10);
  const intervalMs = Math.max(10, intervalMinutes) * 60 * 1000;

  console.log(
    `[XTvSeries] Background FaoTV content engine scheduled every ${intervalMinutes} minutes.`,
  );

  // Initial delayed pull after 10 seconds to prime the app with FaoTV channels
  setTimeout(() => {
    void runXTvSeriesDiscovery().catch((err) => {
      console.warn("[XTvSeries] Initial FaoTV background pull error:", err);
    });
  }, 10000);

  // Scheduled recurring cycle
  seriesSchedulerTimer = setInterval(() => {
    void runXTvSeriesDiscovery().catch((err) => {
      console.warn("[XTvSeries] Scheduled FaoTV background cycle error:", err);
    });
  }, intervalMs);
}
