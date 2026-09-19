import type { ScrapedMoviePayload } from "./types.ts";

/**
 * Lightweight in-memory store for crawler candidates.
 * Keeps discovered payloads available during a crawl run.
 */
export class LocalCandidateStore {
  private candidates: ScrapedMoviePayload[] = [];

  storeCandidate(payload: ScrapedMoviePayload): void {
    const exists = this.candidates.some((c) => c.source_url === payload.source_url);
    if (!exists) this.candidates.push(payload);
  }

  getCandidates(): ScrapedMoviePayload[] {
    return [...this.candidates];
  }

  clear(): void {
    this.candidates = [];
  }
}
