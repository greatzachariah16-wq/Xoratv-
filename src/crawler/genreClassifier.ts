/**
 * 5. Genre Classification Component
 *
 * Categorizes crawled items into the target content categories and tags:
 * - vampire movies
 * - zombie movies
 * - werewolf movies
 * - magic-themed movies
 * - documentaries
 * - sports/wrestling
 * - celebrity interviews
 * - educational content
 * - other movies and videos
 */

import type { CrawlerCategory } from "./types.ts";

export interface ClassificationResult {
  category: CrawlerCategory;
  genres: string[];
  tags: string[];
  confidence: number;
}

const GENRE_RULES: { category: CrawlerCategory; primaryKeywords: string[]; tags: string[] }[] = [
  {
    category: "vampire_movies",
    primaryKeywords: [
      "vampire",
      "dracula",
      "nosferatu",
      "blood-sucker",
      "vampiric",
      "undead vampire",
    ],
    tags: ["vampire", "horror", "gothic", "supernatural"],
  },
  {
    category: "zombie_movies",
    primaryKeywords: ["zombie", "undead", "infected outbreak", "living dead", "ghoul apocalypse"],
    tags: ["zombie", "horror", "post-apocalyptic", "survival"],
  },
  {
    category: "werewolf_movies",
    primaryKeywords: ["werewolf", "lycan", "lycanthrope", "wolfman", "full moon curse"],
    tags: ["werewolf", "horror", "creature-feature", "shapeshifter"],
  },
  {
    category: "magic_themed_movies",
    primaryKeywords: [
      "magic",
      "sorcery",
      "wizard",
      "witchcraft",
      "illusionist",
      "spells",
      "alchemy",
      "enchantment",
    ],
    tags: ["magic", "fantasy", "supernatural", "mystery"],
  },
  {
    category: "sports_wrestling",
    primaryKeywords: [
      "wrestling",
      "wrestler",
      "wwe",
      "aew",
      "njpw",
      "pro wrestling",
      "championship match",
    ],
    tags: ["sports", "wrestling", "combat", "athletics"],
  },
  {
    category: "documentaries",
    primaryKeywords: [
      "documentary",
      "docuseries",
      "investigation",
      "archive footage",
      "history of",
      "in search of",
    ],
    tags: ["documentary", "non-fiction", "biography", "investigative"],
  },
  {
    category: "celebrity_interviews",
    primaryKeywords: [
      "interview",
      "in conversation with",
      "roundtable",
      "actors on actors",
      "talk show guest",
    ],
    tags: ["interview", "celebrity", "discussion", "behind-the-scenes"],
  },
  {
    category: "educational_content",
    primaryKeywords: [
      "lecture",
      "educational",
      "course",
      "how it works",
      "science explained",
      "crash course",
      "tutorial",
    ],
    tags: ["education", "science", "technology", "history", "learning"],
  },
];

export class GenreClassifier {
  /**
   * Classifies a candidate based on title, description, and available tags.
   */
  public classify(
    title: string,
    description: string = "",
    existingTags: string[] = [],
  ): ClassificationResult {
    const combined = `${title} ${description} ${existingTags.join(" ")}`.toLowerCase();

    for (const rule of GENRE_RULES) {
      const match = rule.primaryKeywords.find((kw) => combined.includes(kw));
      if (match) {
        return {
          category: rule.category,
          genres: [rule.category.replace(/_/g, " ")],
          tags: [...rule.tags],
          confidence: 0.85,
        };
      }
    }

    if (combined.includes("movie") || combined.includes("film")) {
      return {
        category: "other_movies",
        genres: ["film"],
        tags: ["movie"],
        confidence: 0.5,
      };
    }

    return {
      category: "other_videos",
      genres: ["video"],
      tags: ["general"],
      confidence: 0.4,
    };
  }
}
