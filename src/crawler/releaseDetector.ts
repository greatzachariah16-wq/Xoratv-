/**
 * 6. Release-Date/Release-Status Detection Component
 *
 * Detects release year, exact release date when available, and lifecycle status.
 * Special discovery focus on:
 * - Content from 2018 through 2026
 * - Upcoming 2026 movies
 * - Newly announced 2026 movies
 * - 2026 release dates
 * - 2026 trailers
 */

import type { ReleaseStatus } from "./types.ts";

export interface ReleaseDetectionResult {
  releaseYear?: number | undefined;
  releaseDate?: string | undefined;
  releaseStatus: ReleaseStatus;
  is2026Focus: boolean;
  isIn2018To2026Range: boolean;
}

export class ReleaseDetector {
  private currentYear = 2026;

  /**
   * Analyzes text, title, and published/release dates to detect release parameters.
   */
  public detect(text: string, rawDateString?: string): ReleaseDetectionResult {
    const combined = `${text} ${rawDateString ?? ""}`.toLowerCase();

    // 1. Year pattern extraction (e.g. (2026), 2026, [2024])
    const yearMatch = combined.match(/\b(20[12]\d)\b/);
    const releaseYear = yearMatch && yearMatch[1] ? parseInt(yearMatch[1], 10) : undefined;

    // 2. Date pattern extraction (e.g. 2026-10-31 or October 31, 2026)
    let releaseDate: string | undefined = undefined;
    const isoDateMatch = combined.match(/\b(20[12]\d-[01]\d-[0-3]\d)\b/);
    if (isoDateMatch && isoDateMatch[1]) {
      releaseDate = isoDateMatch[1];
    } else if (rawDateString) {
      const parsed = new Date(rawDateString);
      if (!isNaN(parsed.getTime())) {
        releaseDate = parsed.toISOString().split("T")[0];
      }
    }

    // 3. Status determination
    let releaseStatus: ReleaseStatus = "unknown";
    const isUpcoming =
      combined.includes("upcoming") ||
      combined.includes("trailer") ||
      combined.includes("teaser") ||
      combined.includes("coming soon") ||
      combined.includes("release date announced") ||
      combined.includes("in theaters") ||
      combined.includes("in production");

    if (releaseYear === 2026) {
      if (combined.includes("announced") || combined.includes("announcement")) {
        releaseStatus = "announced_2026";
      } else if (isUpcoming) {
        releaseStatus = "upcoming_2026";
      } else {
        releaseStatus = "released";
      }
    } else if (releaseYear && releaseYear > 2026) {
      releaseStatus = "announced";
    } else if (releaseYear && releaseYear >= 2018 && releaseYear < 2026) {
      releaseStatus = "released";
    } else if (combined.includes("in production")) {
      releaseStatus = "in_production";
    } else if (isUpcoming) {
      releaseStatus = "upcoming_2026";
    }

    const isInRange = !!releaseYear && releaseYear >= 2018 && releaseYear <= 2026;
    const is2026 =
      releaseYear === 2026 ||
      releaseStatus === "upcoming_2026" ||
      releaseStatus === "announced_2026";

    return {
      releaseYear,
      releaseDate,
      releaseStatus,
      is2026Focus: is2026,
      isIn2018To2026Range: isInRange,
    };
  }
}
