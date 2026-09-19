/**
 * Orchestrator Engine for Xora Open Web Crawler
 *
 * Coordinates query generation, multi-source discovery (YouTube + Web),
 * hard-rule filtering, deduplication, metadata scoring, storage, and
 * optional auto-publishing to public feeds.
 */

import { QueryGenerator } from "./queryGenerator.ts";
import { YouTubeDiscovery } from "./youtubeDiscovery.ts";
import { PublicWebDiscovery } from "./webDiscovery.ts";
import { MetadataScorer } from "./metadataScorer.ts";
import { GenreClassifier } from "./genreClassifier.ts";
import { RtdbCrawlerStorage } from "./storage.ts";
import { toProviderCandidate, isEmbeddableCandidate } from "./toProviderCandidate.ts";
import {
  publishCandidate,
  resolveFeedByDuration,
  saveCandidateToRtdb,
  searchVimeoWithStatus,
} from "@/integrations/providers";
import type { FeedType } from "@/integrations/firebase/types";
import type { CrawlerCategory, CrawlerRunSummary, DiscoveredCandidate } from "./types.ts";

export interface RunCrawlerOptions {
  categories?: CrawlerCategory[] | undefined;
  autoPublish?: boolean | undefined; // default false
  maxQueriesPerCategory?: number | undefined; // default 2
  targetFeedOverride?: FeedType | null | undefined;
}

/**
 * Normalizes title strings for robust deduplication.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(
      /\b(official|trailer|teaser|teaser trailer|full movie|watch online|streaming|hd|4k|video|film|movie|2018|2019|2020|2021|2022|2023|2024|2025|2026)\b/gi,
      "",
    )
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Executes a full crawler cycle.
 */
export async function runCrawlerCycle(options: RunCrawlerOptions = {}): Promise<CrawlerRunSummary> {
  const runId = `run-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const autoPublish = options.autoPublish ?? false;
  const maxQueries = options.maxQueriesPerCategory ?? 2;

  const storage = new RtdbCrawlerStorage();
  const queryGen = new QueryGenerator();
  const ytDiscovery = new YouTubeDiscovery();
  const webDiscovery = new PublicWebDiscovery();
  const metadataScorer = new MetadataScorer();
  const genreClassifier = new GenreClassifier();

  const summary: CrawlerRunSummary = {
    runId,
    startedAt,
    status: "running",
    queriesExecuted: 0,
    candidatesFound: 0,
    candidatesStored: 0,
    categoriesCovered: [],
    errors: [],
  };

  const categoriesCoveredSet = new Set<CrawlerCategory>();
  const rawDiscovered: DiscoveredCandidate[] = [];

  try {
    // 1. Generate search queries
    const queries = queryGen.generateQueries({
      categories: options.categories,
      limitPerCategory: maxQueries,
    });

    console.log(`[Crawler Engine] Executing crawler cycle with ${queries.length} queries...`);

    // 2. Discover for each query
    for (const q of queries) {
      categoriesCoveredSet.add(q.category);
      summary.queriesExecuted++;

      // 2a. YouTube Discovery
      try {
        const ytResults = await ytDiscovery.discoverVideos(q);
        rawDiscovered.push(...ytResults);
      } catch (err) {
        const msg = `YouTube discovery error for query "${q.query}": ${err instanceof Error ? err.message : String(err)}`;
        console.warn(`[Crawler Engine] ${msg}`);
        summary.errors.push(msg);
      }

      // 2b. Public Web Discovery
      try {
        const webResults = await webDiscovery.discoverFromQuery(q);
        rawDiscovered.push(...webResults);
      } catch (err) {
        const msg = `Web discovery error for query "${q.query}": ${err instanceof Error ? err.message : String(err)}`;
        console.warn(`[Crawler Engine] ${msg}`);
        summary.errors.push(msg);
      }

      // 2c. Vimeo Smart Discovery (Movies 40 mins / 1hr+)
      try {
        const vimeoRes = await searchVimeoWithStatus({
          query: q.query,
          limit: 6,
          minDurationSeconds: 2400, // strictly 40 minutes upwards
        });
        if (vimeoRes.candidates && vimeoRes.candidates.length > 0) {
          for (const cand of vimeoRes.candidates) {
            const disc: DiscoveredCandidate = {
              id: cand.id,
              title: cand.title,
              contentType: "movie",
              releaseYear: 2025,
              releaseStatus: "released",
              genres: [q.category],
              tags: cand.tags || [],
              description: cand.description || undefined,
              sourceUrl: cand.watchUrl,
              sourceName: "Vimeo",
              discoveryQuery: q.query,
              discoveryCategory: q.category,
              discoveryTimestamp: new Date().toISOString(),
              rawMetadata: {
                durationSeconds: cand.durationSeconds,
                embedUrl: cand.embedUrl,
                thumbnailUrl: cand.thumbnailUrl,
                channelName: cand.channelName,
              },
            };
            rawDiscovered.push(disc);
          }
        }
      } catch (err) {
        const msg = `Vimeo discovery error for query "${q.query}": ${err instanceof Error ? err.message : String(err)}`;
        console.warn(`[Crawler Engine] ${msg}`);
        summary.errors.push(msg);
      }
    }

    summary.candidatesFound = rawDiscovered.length;
    summary.categoriesCovered = Array.from(categoriesCoveredSet);

    // 3. Filter hard rules, Dedupe, Score, Store
    const seenUrls = new Set<string>();
    const seenMatchKeys = new Set<string>();
    const processedCandidates: DiscoveredCandidate[] = [];

    for (const candidate of rawDiscovered) {
      // Hard rule 1: Year must be 2018–2026
      if (!candidate.releaseYear || candidate.releaseYear < 2018 || candidate.releaseYear > 2026) {
        continue;
      }

      // Hard rule 2: Reject forbidden sources (Internet Archive, Wikimedia, Wikipedia)
      if (webDiscovery.isForbiddenSource(candidate.sourceUrl)) {
        continue;
      }

      // Hard rule 3: Duration check - strictly movies 40 minutes (2400s) to 1hr+
      const duration = candidate.rawMetadata?.durationSeconds as number | undefined;
      if (typeof duration === "number" && duration > 0 && duration < 2400) {
        continue; // Skip anything under 40 minutes (2400 seconds)
      }

      // Dedupe 1: Source URL exact match
      if (seenUrls.has(candidate.sourceUrl)) {
        continue;
      }
      const isAlreadyInStorage = await storage.hasSourceUrl(candidate.sourceUrl);
      if (isAlreadyInStorage) {
        continue;
      }
      seenUrls.add(candidate.sourceUrl);

      // Dedupe 2: Normalized title + year match
      const norm = normalizeTitle(candidate.title);
      const matchKey = `${norm}::${candidate.releaseYear}`;
      if (norm.length > 3 && seenMatchKeys.has(matchKey)) {
        continue;
      }
      if (norm.length > 3) {
        seenMatchKeys.add(matchKey);
      }

      // 4. Enrich & Score
      const genreClassification = genreClassifier.classify(
        candidate.title,
        candidate.description || "",
        candidate.genres,
      );
      if (genreClassification.genres.length > 0) {
        candidate.genres = genreClassification.genres;
      }

      const payload = metadataScorer.candidateToPayload(candidate);
      candidate.rawMetadata = {
        ...(candidate.rawMetadata || {}),
        priorityFlag: payload.priority_flag,
        socialBuzzScore: payload.metrics.social_buzz_score,
      };

      // 5. Store in RTDB under /crawler/candidates
      await storage.saveCandidate(candidate);
      const providerCand = toProviderCandidate(candidate);
      await saveCandidateToRtdb(providerCand).catch(() => {});

      summary.candidatesStored++;
      processedCandidates.push(candidate);
    }

    console.log(
      `[Crawler Engine] Stored ${summary.candidatesStored} unique candidates in RTDB queue.`,
    );

    // 6. Optional Auto-Publish
    if (autoPublish) {
      let autoPublishedCount = 0;
      for (const candidate of processedCandidates) {
        if (!isEmbeddableCandidate(candidate)) {
          continue; // Skip non-embeddable web pages
        }

        try {
          const providerCand = toProviderCandidate(candidate);
          const targetFeed = resolveFeedByDuration(
            providerCand.durationSeconds,
            options.targetFeedOverride,
          );

          await publishCandidate(providerCand, targetFeed);
          autoPublishedCount++;
        } catch (pubErr) {
          console.warn(`[Crawler Engine] Auto-publish error for ${candidate.id}:`, pubErr);
        }
      }
      console.log(`[Crawler Engine] Auto-published ${autoPublishedCount} posts into feeds.`);
    }

    summary.completedAt = new Date().toISOString();
    summary.status = "completed";
  } catch (fatalErr) {
    const msg = `Fatal crawler engine error: ${fatalErr instanceof Error ? fatalErr.message : String(fatalErr)}`;
    console.error(`[Crawler Engine] ${msg}`);
    summary.errors.push(msg);
    summary.status = "failed";
    summary.completedAt = new Date().toISOString();
  }

  // 7. Save run summary to RTDB under /crawler/runs/<runId>
  await storage.saveRunSummary(summary).catch((err) => {
    console.warn("[Crawler Engine] Failed to save run summary:", err);
  });

  return summary;
}
