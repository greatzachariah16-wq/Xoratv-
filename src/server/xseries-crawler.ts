import crypto from "node:crypto";
import { load } from "cheerio";
import { XSERIS_CATEGORIES, type XserisCandidate, type XserisCategory } from "../lib/xseris/types";
import { xseriesDbRead, xseriesDbWrite } from "./xseries-service-account";

export interface CrawlSeedResult {
  seed: XserisCandidate;
  discovered: XserisCandidate[];
}

const safeKey = (v: string) => v.replace(/[.#$[\]/]/g, "_");

export function extractYouTubeId(url: URL): string | null {
  const h = url.hostname.replace(/^www\./, "").toLowerCase();
  if (h === "youtu.be") {
    const id = url.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
    return id && id.length >= 6 ? id : null;
  }
  if (h.endsWith("youtube.com")) {
    const vParam = url.searchParams.get("v");
    if (vParam) return vParam;
    const match = url.pathname.match(/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
  }
  return null;
}

export function normalizeUrl(raw: string): string {
  const u = new URL(raw.trim());
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  // Standardize YouTube URLs to canonical watch URL
  const ytId = extractYouTubeId(u);
  if (ytId) {
    return `https://www.youtube.com/watch?v=${ytId}`;
  }
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}

export function detectProvider(url: URL): { name: string; id: string | null } {
  const h = url.hostname.replace(/^www\./, "").toLowerCase();
  const ytId = extractYouTubeId(url);
  if (ytId || h === "youtu.be" || h.endsWith("youtube.com")) {
    return { name: "youtube", id: ytId };
  }
  if (h.endsWith("vimeo.com")) {
    const id = url.pathname.match(/(?:video\/)?(\d{5,15})/)?.[1] || null;
    return { name: "vimeo", id };
  }
  if (h.endsWith("dailymotion.com") || h === "dai.ly") {
    const id =
      url.pathname.match(/video\/([^_/?]+)/)?.[1] ||
      (h === "dai.ly" ? url.pathname.slice(1) : null);
    return { name: "dailymotion", id };
  }
  return { name: h || "web", id: null };
}

function parseIsoDuration(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

export function getFingerprint(provider: string, id: string | null, url: string): string {
  return id ? `id:${provider}:${id}` : `url:${url}`;
}

export function inferCategories(
  title: string,
  description: string | null,
  defaultCategories?: XserisCategory[],
): XserisCategory[] {
  const matched = new Set<XserisCategory>(
    Array.isArray(defaultCategories) ? defaultCategories : [],
  );
  const text = `${title} ${description || ""}`.toLowerCase();

  const rules: Record<XserisCategory, RegExp> = {
    Action: /\b(action|fight|combat|battle|superhero|war|chase|martial arts)\b/i,
    Drama: /\b(drama|emotional|conflict|tragic|life|relationship|nollywood)\b/i,
    Documentary: /\b(documentary|doc|history|nature|biography|investigation|truth|real story)\b/i,
    Romance: /\b(romance|love|romantic|couple|dating|wedding)\b/i,
    Horror: /\b(horror|scary|ghost|haunted|monster|zombie|creepy|terror)\b/i,
    Thriller: /\b(thriller|suspense|crime|mystery|heist|detective|investigation)\b/i,
    "Sci-Fi": /\b(sci-fi|science fiction|space|alien|cyberpunk|future|technology|robot)\b/i,
    Mystery: /\b(mystery|secret|clue|unsolved|whodunit)\b/i,
    Crime: /\b(crime|mafia|gangster|police|robbery|law)\b/i,
    Adventure: /\b(adventure|journey|expedition|quest|survival|wilderness)\b/i,
    Fantasy: /\b(fantasy|magic|wizard|dragon|myth|realm)\b/i,
    Supernatural: /\b(supernatural|paranormal|demon|psychic|powers)\b/i,
    Kids: /\b(kids|children|family friendly|cartoons for kids|preschool)\b/i,
    Animation: /\b(animation|animated|anime|cartoon|cgi|3d animation)\b/i,
    Comedy: /\b(comedy|funny|humor|parody|standup|joke|hilarious)\b/i,
    Other: /\b(general|video|show|series|movie)\b/i,
  };

  for (const [cat, regex] of Object.entries(rules) as [XserisCategory, RegExp][]) {
    if (regex.test(text)) {
      matched.add(cat);
    }
  }

  if (matched.size === 0) {
    matched.add("Other");
  }

  return Array.from(matched).slice(0, 4);
}

// Fetch and extract metadata for a single video source with anti-429 protection
export async function extractVideoMetadata(sourceUrl: string) {
  const u = new URL(sourceUrl);
  const p = detectProvider(u);

  // 1. YouTube specific handler (immune to HTTP 429 datacenter blocking)
  if (p.name === "youtube" && p.id) {
    const videoId = p.id;
    let title: string | null = null;
    let description: string | null = null;
    let thumbnail: string | null = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    let duration: number | null = null;
    let releaseYear: number | null = null;

    // Strategy A: YouTube Data API v3 if key available
    const apiKey = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
    if (apiKey) {
      try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`;
        const res = await fetch(apiUrl, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = (await res.json()) as {
            items?: Array<{
              snippet?: {
                title?: string;
                description?: string;
                publishedAt?: string;
                thumbnails?: Record<string, { url: string }>;
              };
              contentDetails?: {
                duration?: string;
              };
            }>;
          };
          const item = data.items?.[0];
          if (item?.snippet) {
            title = item.snippet.title?.trim() || null;
            description = item.snippet.description?.trim() || null;
            const thumbs = item.snippet.thumbnails;
            thumbnail =
              thumbs?.maxres?.url ||
              thumbs?.standard?.url ||
              thumbs?.high?.url ||
              thumbs?.medium?.url ||
              thumbnail;
            duration = parseIsoDuration(item.contentDetails?.duration);
            if (item.snippet.publishedAt) {
              const y = new Date(item.snippet.publishedAt).getFullYear();
              if (y >= 1900 && y <= 2100) releaseYear = y;
            }
          }
        }
      } catch (err) {
        console.warn("[Crawler] YouTube Data API lookup skipped:", err);
      }
    }

    // Strategy B: YouTube official oEmbed (Fast, unauthenticated, never 429-blocked)
    if (!title) {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = (await res.json()) as {
            title?: string;
            author_name?: string;
            thumbnail_url?: string;
          };
          title = data.title?.trim() || null;
          description = data.author_name ? `By ${data.author_name}` : null;
          thumbnail = data.thumbnail_url || thumbnail;
        }
      } catch (err) {
        console.warn("[Crawler] YouTube oEmbed fallback skipped:", err);
      }
    }

    // Strategy C: Noembed fallback
    if (!title) {
      try {
        const noembedUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`;
        const res = await fetch(noembedUrl, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = (await res.json()) as {
            title?: string;
            thumbnail_url?: string;
            author_name?: string;
          };
          title = data.title?.trim() || null;
          thumbnail = data.thumbnail_url || thumbnail;
          if (data.author_name) description = `By ${data.author_name}`;
        }
      } catch (e) {
        void e;
      }
    }

    if (title) {
      title = title.replace(/\s*-\s*YouTube$/i, "").trim();
    }

    if (!releaseYear && title) {
      const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
      if (yearMatch) releaseYear = Number(yearMatch[1]);
    }

    return {
      provider: "youtube",
      sourceId: videoId,
      title: title || `YouTube Video (${videoId})`,
      description: description || null,
      thumbnail: thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: duration,
      releaseYear: releaseYear,
      language: "en",
      rawHtml: "",
    };
  }

  // 2. Vimeo provider oEmbed
  if (p.name === "vimeo" && p.id) {
    try {
      const er = await fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${p.id}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (er.ok) {
        const e = (await er.json()) as {
          title?: string;
          description?: string;
          author_name?: string;
          thumbnail_url?: string;
          duration?: number;
        };
        const title = e.title ? e.title.replace(/\s*on Vimeo$/i, "").trim() : null;
        const ym = (title || "").match(/\b(19\d{2}|20\d{2})\b/);
        return {
          provider: "vimeo",
          sourceId: p.id,
          title: title || `Vimeo Video (${p.id})`,
          description: e.description || (e.author_name ? `By ${e.author_name}` : null),
          thumbnail: e.thumbnail_url || null,
          duration: typeof e.duration === "number" ? e.duration : null,
          releaseYear: ym ? Number(ym[1]) : null,
          language: "en",
          rawHtml: "",
        };
      }
    } catch (e) {
      void e;
    }
  }

  // 3. Dailymotion provider oEmbed
  if (p.name === "dailymotion" && p.id) {
    try {
      const er = await fetch(
        `https://www.dailymotion.com/services/oembed?url=https://www.dailymotion.com/video/${p.id}`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (er.ok) {
        const e = (await er.json()) as {
          title?: string;
          description?: string;
          author_name?: string;
          thumbnail_url?: string;
          duration?: number;
        };
        const ym = (e.title || "").match(/\b(19\d{2}|20\d{2})\b/);
        return {
          provider: "dailymotion",
          sourceId: p.id,
          title: e.title?.trim() || `Dailymotion Video (${p.id})`,
          description: e.description || (e.author_name ? `By ${e.author_name}` : null),
          thumbnail: e.thumbnail_url || null,
          duration: typeof e.duration === "number" ? e.duration : null,
          releaseYear: ym ? Number(ym[1]) : null,
          language: "en",
          rawHtml: "",
        };
      }
    } catch (e) {
      void e;
    }
  }

  // 4. General HTML scraping with graceful non-throwing error handling
  let html = "";
  try {
    const res = await fetch(sourceUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (res.ok) {
      html = await res.text();
    } else {
      console.warn(`[Crawler] Source fetch returned HTTP ${res.status} for ${sourceUrl}`);
    }
  } catch (fetchErr) {
    console.warn(`[Crawler] Direct HTML fetch failed for ${sourceUrl}:`, fetchErr);
  }

  let title: string | null = null;
  let description: string | null = null;
  let thumbnail: string | null = null;
  let duration: number | null = null;
  let language = "en";

  if (html) {
    const $ = load(html);
    const meta = (name: string) =>
      $(`meta[property="${name}"],meta[name="${name}"]`).first().attr("content")?.trim() || null;

    title = meta("og:title") || $("title").first().text().trim() || null;
    description = meta("og:description") || meta("description");
    thumbnail = meta("og:image");
    duration = meta("video:duration") ? Number(meta("video:duration")) : null;
    language = meta("og:locale") || "en";
  }

  // Clean title
  if (title) {
    title = title
      .replace(/\s*-\s*YouTube$/i, "")
      .replace(/\s*on Vimeo$/i, "")
      .trim();
  }

  const yearMatch = (title || "").match(/\b(19\d{2}|20\d{2})\b/);

  return {
    provider: p.name,
    sourceId: p.id,
    title: title || u.hostname,
    description: description || null,
    thumbnail: thumbnail || null,
    duration: Number.isFinite(duration) ? duration : null,
    releaseYear: yearMatch ? Number(yearMatch[1]) : null,
    language: language,
    rawHtml: html,
  };
}

// Discover related video links from page HTML
export function extractRelatedVideoUrls(
  sourceUrl: string,
  html: string,
  provider: string,
): string[] {
  const discovered = new Set<string>();

  try {
    if (provider === "youtube") {
      // 1. Regex search for video IDs in initialData or watch links
      const videoIdRegex = /(?:watch\?v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
      let match: RegExpExecArray | null;
      while ((match = videoIdRegex.exec(html)) !== null) {
        const id = match[1];
        if (id && !sourceUrl.includes(id)) {
          discovered.add(`https://www.youtube.com/watch?v=${id}`);
        }
        if (discovered.size >= 8) break;
      }
    } else if (provider === "vimeo") {
      const vimeoRegex = /vimeo\.com\/(\d{7,12})/g;
      let match: RegExpExecArray | null;
      while ((match = vimeoRegex.exec(html)) !== null) {
        const id = match[1];
        if (id && !sourceUrl.includes(id)) {
          discovered.add(`https://vimeo.com/${id}`);
        }
        if (discovered.size >= 6) break;
      }
    } else if (provider === "dailymotion") {
      const dmRegex = /dailymotion\.com\/video\/([a-zA-Z0-9]+)/g;
      let match: RegExpExecArray | null;
      while ((match = dmRegex.exec(html)) !== null) {
        const id = match[1];
        if (id && !sourceUrl.includes(id)) {
          discovered.add(`https://www.dailymotion.com/video/${id}`);
        }
        if (discovered.size >= 6) break;
      }
    }
  } catch (err) {
    console.warn("[Crawler] Error extracting related links:", err);
  }

  return Array.from(discovered);
}

// Crawl and discover related videos starting from seed links
export async function crawlSeedUrl(
  sourceUrl: string,
  categories: XserisCategory[] = [],
  depth = 1,
): Promise<CrawlSeedResult> {
  const now = new Date().toISOString();
  const normalized = normalizeUrl(sourceUrl);
  const meta = await extractVideoMetadata(normalized);

  const seedId = "xseries-" + crypto.randomUUID();
  const inferredCategories = inferCategories(meta.title, meta.description, categories);

  const seedCandidate: XserisCandidate = {
    id: seedId,
    title: meta.title,
    description: meta.description,
    thumbnail_url: meta.thumbnail,
    source_provider: meta.provider,
    source_url: normalized,
    source_id: meta.sourceId,
    duration: meta.duration,
    release_year: meta.releaseYear,
    language: meta.language,
    status: "pending_review",
    categories: inferredCategories,
    created_at: now,
    updated_at: now,
    last_checked: now,
    discovery_status: "manual",
    discovered_from: "manual_seed",
    parent_source_id: null,
    playback: {
      type: "embed",
      url: `/api/stream/embed/${seedId}`,
      provider: "xseries-proxy",
    },
    processing_status: "ready_for_review",
    error: null,
  };

  const discoveredCandidates: XserisCandidate[] = [];

  if (depth > 0 && meta.rawHtml) {
    const relatedUrls = extractRelatedVideoUrls(normalized, meta.rawHtml, meta.provider);

    // Concurrency limit: process max 2 discovered links at a time with delays
    for (const relatedUrl of relatedUrls) {
      try {
        await new Promise((r) => setTimeout(r, 200)); // Rate limit pause
        const relNormalized = normalizeUrl(relatedUrl);
        const relMeta = await extractVideoMetadata(relNormalized);
        const relId = "xseries-rel-" + crypto.randomUUID();

        const relItem: XserisCandidate = {
          id: relId,
          title: relMeta.title,
          description: relMeta.description,
          thumbnail_url: relMeta.thumbnail,
          source_provider: relMeta.provider,
          source_url: relNormalized,
          source_id: relMeta.sourceId,
          duration: relMeta.duration,
          release_year: relMeta.releaseYear,
          language: relMeta.language,
          status: "pending_review",
          categories: inferCategories(relMeta.title, relMeta.description, categories),
          created_at: now,
          updated_at: now,
          last_checked: now,
          discovery_status: "candidate",
          discovered_from: `seed:${normalized}`,
          parent_source_id: seedId,
          playback: {
            type: "embed",
            url: `/api/stream/embed/${relId}`,
            provider: "xseries-proxy",
          },
          processing_status: "ready_for_review",
          error: null,
        };

        discoveredCandidates.push(relItem);
      } catch (err) {
        // Individual failure must not break the whole crawler
        console.warn(
          "[Crawler] Skipped discovered related item:",
          relatedUrl,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  return {
    seed: seedCandidate,
    discovered: discoveredCandidates,
  };
}

// Batch crawl and persist to RTDB
export async function processSeedBatch(
  urls: string[],
  categories: XserisCategory[] = [],
  includeRelated = true,
): Promise<{ items: XserisCandidate[]; count: number }> {
  const allItems: XserisCandidate[] = [];

  for (const url of urls) {
    try {
      const normalized = normalizeUrl(url);
      const prov = detectProvider(new URL(normalized));
      const fp = getFingerprint(prov.name, prov.id, normalized);

      // Check if already processed
      const existing = await xseriesDbRead(`sourceFingerprints/${safeKey(fp)}`).catch(() => null);
      if (existing && existing.id) {
        const stored = await xseriesDbRead(`candidates/${safeKey(existing.id)}`).catch(() => null);
        if (stored) {
          allItems.push({
            ...stored,
            processing_status: "duplicate",
            error: null,
          });
          continue;
        }
      }

      // Crawl seed URL and related videos
      const result = await crawlSeedUrl(normalized, categories, includeRelated ? 1 : 0);

      // Persist seed candidate
      await xseriesDbWrite(`candidates/${safeKey(result.seed.id)}`, result.seed);
      await xseriesDbWrite(`sourceFingerprints/${safeKey(fp)}`, {
        id: result.seed.id,
        provider: result.seed.source_provider,
        sourceId: result.seed.source_id,
        sourceUrl: result.seed.source_url,
      });
      allItems.push(result.seed);

      // Persist discovered related candidates
      for (const rel of result.discovered) {
        const relFp = getFingerprint(rel.source_provider, rel.source_id, rel.source_url);
        await xseriesDbWrite(`candidates/${safeKey(rel.id)}`, rel);
        await xseriesDbWrite(`sourceFingerprints/${safeKey(relFp)}`, {
          id: rel.id,
          provider: rel.source_provider,
          sourceId: rel.source_id,
          sourceUrl: rel.source_url,
        });
        allItems.push(rel);
      }
    } catch (err) {
      console.warn("[Crawler] Error processing seed URL:", url, err);
      const fallbackId = "xseries-err-" + crypto.randomUUID();
      const failedItem: XserisCandidate = {
        id: fallbackId,
        title: url,
        description: null,
        thumbnail_url: null,
        source_provider: detectProvider(new URL(normalizeUrl(url))).name,
        source_url: url,
        source_id: detectProvider(new URL(normalizeUrl(url))).id,
        duration: null,
        release_year: null,
        language: null,
        status: "pending_review",
        categories: categories,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_checked: new Date().toISOString(),
        discovery_status: "failed",
        discovered_from: "manual_seed",
        parent_source_id: null,
        playback: null,
        processing_status: "failed",
        error: err instanceof Error ? err.message : "Metadata retrieval failed",
      };
      allItems.push(failedItem);
    }
  }

  return { items: allItems, count: allItems.length };
}
