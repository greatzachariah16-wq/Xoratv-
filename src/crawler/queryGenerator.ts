/**
 * 1. Query Generator Component
 *
 * Automatically generates varied, structured search queries for discovering
 * publicly accessible movie, sports/wrestling, interview, and educational content.
 *
 * Specializes in 2018-2026 content with high focus on 2026 upcoming titles,
 * announcements, release dates, and trailers.
 */

import type { CrawlerCategory, QueryVariation } from "./types.ts";

export interface QueryGeneratorOptions {
  categories?: CrawlerCategory[] | undefined;
  includeUpcoming2026Only?: boolean | undefined;
  targetPlatform?: "web" | "youtube" | "all" | undefined;
  limitPerCategory?: number | undefined;
}

const CATEGORY_KEYWORDS: Record<CrawlerCategory, string[]> = {
  vampire_movies: [
    "vampire movie",
    "vampire film",
    "dracula film",
    "vampires horror movie",
    "blood gothic vampire",
  ],
  zombie_movies: [
    "zombie movie",
    "undead apocalypse film",
    "zombies outbreak movie",
    "infected horror thriller",
  ],
  werewolf_movies: [
    "werewolf movie",
    "lycanthrope film",
    "full moon wolf transformation movie",
    "beast horror thriller",
  ],
  magic_themed_movies: [
    "magic themed movie",
    "sorcery fantasy film",
    "wizards and witches movie",
    "dark magic fantasy thriller",
    "occult illusionist movie",
  ],
  documentaries: [
    "documentary film full",
    "investigative documentary",
    "historical documentary",
    "nature science documentary",
    "technology society documentary",
  ],
  sports_wrestling: [
    "professional wrestling match",
    "wrestling documentary full",
    "championship wrestling showcase",
    "pro wrestling retrospective",
    "sports combat highlights documentary",
  ],
  celebrity_interviews: [
    "celebrity in-depth interview",
    "actor director roundtable discussion",
    "exclusive film cast interview",
    "career retrospective interview",
  ],
  educational_content: [
    "educational lecture full course",
    "science educational explainer",
    "computer science full course",
    "history deep dive lecture",
    "mathematics concepts explained",
  ],
  other_movies: [
    "independent film full",
    "sci-fi feature film",
    "psychological thriller movie",
    "action adventure film",
  ],
  other_videos: [
    "creative commons video archive",
    "public domain film showcase",
    "short video masterclass",
  ],
};

const MODIFIERS_2026 = [
  "upcoming 2026",
  "2026 official trailer",
  "2026 release date",
  "newly announced 2026",
  "teaser trailer 2026",
  "first look 2026",
];

const HISTORICAL_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

export class QueryGenerator {
  /**
   * Generates a collection of structured query variations across target categories.
   */
  public generateQueries(options: QueryGeneratorOptions = {}): QueryVariation[] {
    const selectedCategories =
      options.categories ?? (Object.keys(CATEGORY_KEYWORDS) as CrawlerCategory[]);
    const platform = options.targetPlatform ?? "all";
    const limit = options.limitPerCategory ?? 6;
    const queries: QueryVariation[] = [];

    for (const category of selectedCategories) {
      const baseKeywords = CATEGORY_KEYWORDS[category] ?? ["movie full"];
      let count = 0;

      // 1. Focus: 2026 Upcoming, Announced, Trailers, Release Dates
      for (const kw of baseKeywords) {
        if (count >= limit) break;
        for (const mod of MODIFIERS_2026) {
          if (count >= limit) break;
          queries.push({
            id: `q-${category}-2026-${count + 1}`,
            category,
            query: `${kw} ${mod}`,
            intent: mod.includes("trailer") ? "trailers_2026" : "upcoming_2026",
            targetPlatform: platform,
            targetYearMin: 2026,
            targetYearMax: 2026,
            priorityWeight: 1.0,
          });
          count++;
        }
      }

      // 2. Focus: 2018-2025 catalog discovery (if not upcoming-only)
      if (!options.includeUpcoming2026Only && count < limit) {
        for (const year of HISTORICAL_YEARS) {
          if (count >= limit) break;
          const kw = baseKeywords[count % baseKeywords.length] ?? baseKeywords[0] ?? "film";
          queries.push({
            id: `q-${category}-${year}-${count + 1}`,
            category,
            query: `${kw} ${year}`,
            intent:
              category === "educational_content" ? "educational_archive" : "releases_2018_2026",
            targetPlatform: platform,
            targetYearMin: year,
            targetYearMax: year,
            priorityWeight: 0.8,
          });
          count++;
        }
      }
    }

    return queries;
  }
}
