import crypto from "node:crypto";
import { runCrawlerCycle } from "../crawler/engine";
import { type XserisCandidate } from "../lib/xseris/types";
import { checkFirebaseAdminStatus, xseriesDbRead, xseriesDbWrite } from "./xseries-service-account";

let timer: NodeJS.Timeout | null = null;
let isRunning = false;

const safeKey = (v: string) => v.replace(/[.#$[\]/]/g, "_");

export async function runXseriesDiscoveryCycle(): Promise<{
  status: string;
  candidatesFound?: number;
  candidatesQueued?: number;
  error?: string;
}> {
  if (isRunning) {
    return { status: "skipped_already_running" };
  }

  // Check Firebase admin config before running
  const fbStatus = checkFirebaseAdminStatus();
  if (!fbStatus.configured) {
    console.log("[Xseries Discovery] Background cycle skipped:", fbStatus.error);
    return { status: "skipped_no_credentials", error: fbStatus.error };
  }

  isRunning = true;
  try {
    console.log("[Xseries Discovery] Starting automated discovery cycle...");
    const summary = await runCrawlerCycle({
      autoPublish: false,
      maxQueriesPerCategory: 2,
    });

    interface CrawlerCandidateRecord {
      id?: string;
      sourceUrl?: string;
      title?: string;
      description?: string;
      thumbnail_url?: string;
      sourceName?: string;
      source?: string;
      external_id?: string;
      releaseYear?: number;
      genres?: string[];
      rawMetadata?: {
        thumbnailUrl?: string;
        durationSeconds?: number;
      };
    }

    const candidates = (await xseriesDbRead("crawler/candidates").catch(() => null)) as Record<
      string,
      CrawlerCandidateRecord
    > | null;
    let queued = 0;

    for (const c of Object.values(candidates || {})) {
      if (!c?.sourceUrl) continue;
      const rawId = String(c.id || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "_");
      const id = `xseries-disc-${rawId}`;
      const now = new Date().toISOString();

      const item: XserisCandidate = {
        id,
        title: c.title || "Discovered Media",
        description: c.description || null,
        thumbnail_url: c.thumbnail_url || c.rawMetadata?.thumbnailUrl || null,
        source_provider: c.sourceName || c.source || "web",
        source_url: c.sourceUrl,
        source_id: c.external_id || null,
        duration:
          typeof c.rawMetadata?.durationSeconds === "number" ? c.rawMetadata.durationSeconds : null,
        release_year: typeof c.releaseYear === "number" ? c.releaseYear : null,
        language: null,
        status: "pending_review",
        categories: Array.isArray(c.genres) ? c.genres.filter((g: string) => g) : [],
        created_at: now,
        updated_at: now,
        last_checked: now,
        discovery_status: "candidate",
        discovered_from: c.discoveryQuery || "automated-crawler",
        parent_source_id: c.external_id || null,
        playback: {
          type: "embed",
          url: `/api/stream/embed/${safeKey(id)}`,
          provider: "xseries-proxy",
        },
        processing_status: "ready_for_review",
        error: null,
      };

      await xseriesDbWrite(`candidates/${safeKey(id)}`, item);
      queued++;
    }

    const runRecord = {
      completed_at: new Date().toISOString(),
      status: "completed",
      candidatesFound: summary.candidatesFound,
      candidatesQueued: queued,
    };

    await xseriesDbWrite(`discoveryRuns/${Date.now()}`, runRecord);
    console.log(
      `[Xseries Discovery] Completed. Found ${summary.candidatesFound}, queued ${queued} candidates.`,
    );

    return {
      status: "completed",
      candidatesFound: summary.candidatesFound,
      candidatesQueued: queued,
    };
  } catch (err) {
    console.warn("[Xseries Discovery] Error during cycle:", err);
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  } finally {
    isRunning = false;
  }
}

export function startXseriesDiscoveryScheduler() {
  if (timer) clearInterval(timer);

  const minutes = Math.max(
    10,
    Number(
      process.env.XSERIS_DISCOVERY_INTERVAL_MINUTES ||
        process.env.XSERIES_DISCOVERY_INTERVAL_MINUTES ||
        "360",
    ) || 360,
  );

  // Initial cycle delayed by 20s to allow server initialization
  setTimeout(() => {
    runXseriesDiscoveryCycle().catch((e) =>
      console.warn("[Xseries Discovery] Initial cycle error:", e),
    );
  }, 20000);

  timer = setInterval(
    () => {
      runXseriesDiscoveryCycle().catch((e) =>
        console.warn("[Xseries Discovery] Scheduled cycle error:", e),
      );
    },
    minutes * 60 * 1000,
  );
}
