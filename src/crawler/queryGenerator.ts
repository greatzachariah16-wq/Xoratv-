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
    "vampire",
    "modern vampire",
    "dracula vampire",
    "gothic vampire horror",
    "blood vampire thriller",
  ],
  zombie_movies: [
    "zombie",
    "modern zombie",
    "undead apocalypse",
    "zombies outbreak",
    "infected horror thriller",
  ],
  werewolf_movies: [
    "werewolf",
    "modern werewolf",
    "lycanthrope beast",
    "wolf transformation horror",
    "werewolf horror thriller",
  ],
  magic_themed_movies: [
    "magic fantasy",
    "modern magic fantasy",
    "sorcery wizards",
    "dark magic supernatural",
    "occult illusionist magic",
  ],
  documentaries: [
    "documentary",
    "modern investigative documentary",
    "science nature documentary",
    "technology society documentary",
    "history documentary feature",
  ],
  sports_wrestling: [
    "sports wrestling",
    "professional wrestling",
    "championship wrestling showcase",
    "pro wrestling match highlights",
    "combat sports wrestling documentary",
  ],
  celebrity_interviews: [
    "celebrity interview",
    "actor director in-depth interview",
    "exclusive film cast interview",
    "celebrity career retrospective",
  ],
  educational_content: [
    "educational lecture",
    "science educational explainer",
    "computer science lecture course",
    "history deep dive lecture",
    "mathematics concepts educational",
  ],
  other_movies: [
    "modern horror movie",
    "modern supernatural thriller",
    "modern sci-fi feature film",
    "independent film cinema",
  ],
  other_videos: ["open movie film project", "creative commons video", "public video showcase"],
};

// Varied query pattern templates strictly expanding beyond only "[genre] movie [year]"
const QUERY_PATTERNS = [
  "{genre} movie {year} watch online",
  "{genre} movie {year} full movie",
  "{genre} {year} streaming",
  "{genre} {year} free watch",
  "{genre} {year} official",
  "{genre} movie trailer {year}",
  "{genre} film {year}",
  "{genre} {year} video",
];

const NON_MOVIE_PATTERNS: Record<CrawlerCategory, string[]> = {
  documentaries: [
    "{kw} {year} watch online",
    "{kw} {year} documentary",
    "{kw} full documentary {year}",
    "{kw} official {year}",
  ],
  educational_content: [
    "{kw} {year} video",
    "{kw} lecture course {year}",
    "{kw} educational explainer {year}",
    "{kw} full lecture {year}",
  ],
  celebrity_interviews: [
    "{kw} {year}",
    "{kw} in-depth interview {year}",
    "{kw} full conversation {year}",
    "{kw} official video {year}",
  ],
  sports_wrestling: [
    "{kw} {year} full match",
    "{kw} highlights {year}",
    "{kw} championship {year}",
    "{kw} showcase {year}",
  ],
  vampire_movies: [],
  zombie_movies: [],
  werewolf_movies: [],
  magic_themed_movies: [],
  other_movies: [],
  other_videos: ["{kw} {year} film", "{kw} open media {year}"],
};

const MODIFIERS_2026 = [
  "2026 movies",
  "upcoming 2026 movies",
  "2026 movie trailers",
  "newly released 2026 movies",
  "2026 movie announcements",
  "2026 official trailer",
  "2026 release date",
  "first look 2026",
];

// STRICT TEMPORAL BOUNDARY: 2018 to 2026 ONLY. 1910-2017 is strictly forbidden.
const ALLOWED_YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];
const HISTORICAL_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

export class QueryGenerator {
  /**
   * Generates a collection of structured query variations across target categories,
   * strictly adhering to 2018-2026 and varied query patterns.
   */
  public generateQueries(options: QueryGeneratorOptions = {}): QueryVariation[] {
    const selectedCategories =
      options.categories ?? (Object.keys(CATEGORY_KEYWORDS) as CrawlerCategory[]);
    const platform = options.targetPlatform ?? "all";
    const limit = options.limitPerCategory ?? 8;
    const queries: QueryVariation[] = [];

    for (const category of selectedCategories) {
      const baseKeywords = CATEGORY_KEYWORDS[category] ?? ["movie"];
      const isNonMovie = Boolean(NON_MOVIE_PATTERNS[category]?.length);
      let count = 0;

      // 1. High priority: 2026 upcoming, trailers, announcements
      for (const kw of baseKeywords) {
        if (count >= limit) break;
        for (const mod of MODIFIERS_2026) {
          if (count >= limit) break;
          const queryText = isNonMovie ? `${kw} 2026` : `${kw} ${mod}`;
          queries.push({
            id: `q-${category}-2026-${count + 1}`,
            category,
            query: queryText,
            intent: mod.includes("trailer") ? "trailers_2026" : "upcoming_2026",
            targetPlatform: platform,
            targetYearMin: 2026,
            targetYearMax: 2026,
            priorityWeight: 1.0,
          });
          count++;
        }
      }

      // 2. Modern 2018-2025 catalog discovery with varied query structures
      if (!options.includeUpcoming2026Only && count < limit) {
        const patterns = isNonMovie ? NON_MOVIE_PATTERNS[category] || [] : QUERY_PATTERNS;
        for (const year of HISTORICAL_YEARS) {
          if (count >= limit) break;
          const kw = baseKeywords[count % baseKeywords.length] ?? baseKeywords[0] ?? "film";
          const pattern = patterns[count % patterns.length] || "{genre} movie {year} watch online";
          const formattedQuery = pattern
            .replace("{genre}", kw)
            .replace("{kw}", kw)
            .replace("{year}", String(year));

          queries.push({
            id: `q-${category}-${year}-${count + 1}`,
            category,
            query: formattedQuery,
            intent: pattern.includes("trailer")
              ? "trailers_2026"
              : category === "educational_content"
                ? "educational_archive"
                : "releases_2018_2026",
            targetPlatform: platform,
            targetYearMin: year,
            targetYearMax: year,
            priorityWeight: year >= 2024 ? 0.9 : 0.7,
          });
          count++;
        }
      }
    }

    return queries;
  }

  /**
   * Generates dynamic queries strictly conforming to modern query templates
   * across 2018..2026.
   */
  public generateTemplatedQueries(
    years: number[] = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018],
  ): QueryVariation[] {
    const safeYears = years.filter((y) => y >= 2018 && y <= 2026);
    const queries: QueryVariation[] = [];
    const genreNames = ["vampire", "zombie", "werewolf", "magic fantasy", "horror"];

    // Template 1: Varied patterns across years
    for (const genre of genreNames) {
      const categoryKey = `${genre.replace(" ", "_")}_movies` as CrawlerCategory;
      const category = CATEGORY_KEYWORDS[categoryKey] ? categoryKey : "other_movies";
      for (const year of safeYears) {
        const is2026 = year === 2026;
        const pattern = is2026 ? "{genre} movie trailer 2026" : "{genre} movie {year} watch online";
        queries.push({
          id: `tpl-${genre.replace(" ", "-")}-${year}`,
          category,
          query: pattern.replace("{genre}", genre).replace("{year}", String(year)),
          intent: is2026 ? "upcoming_2026" : "releases_2018_2026",
          targetPlatform: "all",
          targetYearMin: year,
          targetYearMax: year,
          priorityWeight: is2026 ? 1.0 : 0.8,
        });
      }
    }

    // Template 2: Documentaries 2018..2026
    for (const docTopic of ["nature science", "technology", "history", "true crime"]) {
      for (const year of [2026, 2025, 2024]) {
        queries.push({
          id: `tpl-doc-${docTopic.replace(" ", "-")}-${year}`,
          category: "documentaries",
          query: `${docTopic} documentary ${year} watch online`,
          intent: year === 2026 ? "upcoming_2026" : "releases_2018_2026",
          targetPlatform: "all",
          targetYearMin: year,
          targetYearMax: year,
          priorityWeight: 0.9,
        });
      }
    }

    // Template 3: Celebrity interview and sports wrestling
    for (const year of [2026, 2025, 2024]) {
      queries.push({
        id: `tpl-interview-${year}`,
        category: "celebrity_interviews",
        query: `celebrity in-depth interview ${year}`,
        intent: year === 2026 ? "upcoming_2026" : "releases_2018_2026",
        targetPlatform: "all",
        targetYearMin: year,
        targetYearMax: year,
        priorityWeight: 0.85,
      });

      queries.push({
        id: `tpl-wrestling-${year}`,
        category: "sports_wrestling",
        query: `sports wrestling championship full match ${year}`,
        intent: year === 2026 ? "upcoming_2026" : "releases_2018_2026",
        targetPlatform: "all",
        targetYearMin: year,
        targetYearMax: year,
        priorityWeight: 0.85,
      });
    }

    return queries;
  }
}
