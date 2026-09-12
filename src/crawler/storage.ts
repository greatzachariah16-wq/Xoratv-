/**
 * 8. Crawler Database / Storage Component
 *
 * Dedicated storage layer for the new Xora Open Web Crawler.
 *
 * Isolation guarantees:
 * - Completely decoupled from legacy discovery tables (`discovery_settings`, `discovery_runs`).
 * - Never publishes crawler candidates into the public `posts` table or feeds (`feed = 'home'`, `feed = 'shorts'`).
 * - Provides both an in-memory test store and schema definitions for persistent crawler tables.
 */

import type { DiscoveredCandidate, CrawlerRunSummary, CrawlerCategory } from "./types.ts";

export interface CandidateQueryFilters {
  category?: CrawlerCategory | undefined;
  releaseYear?: number | undefined;
  releaseStatus?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface CrawlerStorage {
  saveCandidate(candidate: DiscoveredCandidate): Promise<void>;
  getCandidate(id: string): Promise<DiscoveredCandidate | null>;
  hasSourceUrl(sourceUrl: string): Promise<boolean>;
  listCandidates(filters?: CandidateQueryFilters | undefined): Promise<DiscoveredCandidate[]>;
  saveRunSummary(summary: CrawlerRunSummary): Promise<void>;
}

/**
 * In-memory storage implementation for standalone execution, validation,
 * and testing without modifying live database tables.
 */
export class InMemoryCrawlerStorage implements CrawlerStorage {
  private candidates: Map<string, DiscoveredCandidate> = new Map();
  private urls: Set<string> = new Set();
  private runs: Map<string, CrawlerRunSummary> = new Map();

  public async saveCandidate(candidate: DiscoveredCandidate): Promise<void> {
    this.candidates.set(candidate.id, candidate);
    this.urls.add(candidate.sourceUrl);
  }

  public async getCandidate(id: string): Promise<DiscoveredCandidate | null> {
    return this.candidates.get(id) ?? null;
  }

  public async hasSourceUrl(sourceUrl: string): Promise<boolean> {
    return this.urls.has(sourceUrl);
  }

  public async listCandidates(
    filters?: CandidateQueryFilters | undefined,
  ): Promise<DiscoveredCandidate[]> {
    let list = Array.from(this.candidates.values());

    if (filters?.category) {
      list = list.filter((c) => c.discoveryCategory === filters.category);
    }
    if (filters?.releaseYear) {
      list = list.filter((c) => c.releaseYear === filters.releaseYear);
    }
    if (filters?.releaseStatus) {
      list = list.filter((c) => c.releaseStatus === filters.releaseStatus);
    }

    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;
    return list.slice(offset, offset + limit);
  }

  public async saveRunSummary(summary: CrawlerRunSummary): Promise<void> {
    this.runs.set(summary.runId, summary);
  }
}

/**
 * SQL Schema Blueprint for dedicated, isolated persistent crawler tables.
 * (Will be applied via dedicated migrations when approved).
 */
export const CRAWLER_DATABASE_SCHEMA_BLUEPRINT = `
-- Dedicated table for candidate metadata collected by the new crawler
CREATE TABLE IF NOT EXISTS public.xora_crawler_candidates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL,
  release_year INTEGER,
  release_date DATE,
  release_status TEXT NOT NULL,
  genres TEXT[] DEFAULT '{}'::TEXT[],
  tags TEXT[] DEFAULT '{}'::TEXT[],
  description TEXT,
  trailer_url TEXT,
  source_url TEXT UNIQUE NOT NULL,
  source_name TEXT NOT NULL,
  discovery_query TEXT NOT NULL,
  discovery_category TEXT NOT NULL,
  rating_info JSONB,
  engagement_info JSONB,
  quality_signals JSONB,
  discovery_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedicated table for tracking runs of the new crawler
CREATE TABLE IF NOT EXISTS public.xora_crawler_runs (
  id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  queries_executed INTEGER DEFAULT 0,
  candidates_found INTEGER DEFAULT 0,
  candidates_stored INTEGER DEFAULT 0,
  categories_covered TEXT[] DEFAULT '{}'::TEXT[],
  errors TEXT[] DEFAULT '{}'::TEXT[]
);
`;
