/**
 * Open Video Discovery engine (server only).
 *
 * Queries three credential-free public sources, extracts rights + technical
 * metadata, scores each candidate and writes accepted / uncertain items into
 * the existing `posts` table with source <> 'creator'. Creator content and all
 * monetization code are never touched by this module.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CATEGORY_PRIORITY,
  DEFAULT_WEIGHTS,
  type ContentSource,
  type RightsStatus,
  type ScoreWeights,
} from "./types";

const UA = "XoraDiscoveryBot/1.0 (open video discovery; contact via xora app)";
const FETCH_TIMEOUT = 15000;

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": UA },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Only https media URLs from the expected source hosts are ever stored. */
const ALLOWED_HOSTS = [
  "archive.org",
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "svs.gsfc.nasa.gov",
];

function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (!ALLOWED_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`)))
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

export type Candidate = {
  source: ContentSource;
  external_id: string;
  canonical_url: string;
  playback_url: string;
  thumbnail_url: string | null;
  title: string;
  description: string;
  media_type: string;
  duration_seconds: number | null;
  resolution_height: number | null;
  frame_rate: number | null;
  audio_info: string | null;
  license: string;
  license_url: string | null;
  rights_status: RightsStatus;
  rights_confidence: number;
  external_creator: string | null;
  published_at: string | null;
  category: string;
  keywords: string[];
  is_color: boolean | null;
  source_metadata: Record<string, unknown>;
};

/* ------------------------------------------------------------------ rights */

function classifyRights(text: string): { status: RightsStatus; confidence: number } {
  const t = text.toLowerCase();
  if (/non-?commercial|\bnc\b|cc by-nc|no derivatives|\bnd\b/.test(t))
    return { status: "restricted", confidence: 0.95 };
  if (/rights reserved|copyrighted|licensed music|third[- ]party/.test(t))
    return { status: "restricted", confidence: 0.8 };
  if (/cc0|creativecommons\.org\/publicdomain\/zero/.test(t))
    return { status: "cc0", confidence: 0.95 };
  if (/public ?domain|publicdomain\/mark|pd-us|pd nasa|pd-usgov/.test(t))
    return { status: "public_domain", confidence: 0.9 };
  if (/cc[- ]by[- ]sa/.test(t)) return { status: "cc_by_sa", confidence: 0.9 };
  if (/cc[- ]by/.test(t)) return { status: "cc_by", confidence: 0.9 };
  if (/creative ?commons/.test(t)) return { status: "other_open", confidence: 0.6 };
  return { status: "unknown", confidence: 0.1 };
}

/* -------------------------------------------------------------- categories */

const CATEGORY_MATCHERS: Array<[string, RegExp]> = [
  ["vampire", /vampire|dracula|nosferatu/],
  ["zombie", /zombie|undead|living dead/],
  ["horror", /horror|haunt|ghost|monster|terror|creepy/],
  ["sci-fi", /sci-?fi|science fiction|space opera|robot|alien|ufo/],
  ["mystery", /mystery|thriller|detective|noir|suspense|crime/],
  ["space", /space|nasa|planet|galaxy|astronom|solar system|spacecraft|mars|moon|orbit/],
  ["science", /science|physics|biolog|chemistry|climate|research|simulation/],
  ["documentary", /documentar|newsreel|report|archive footage/],
  ["history", /history|historic|world war|ancient|1900s|vintage/],
  ["cartoons", /cartoon|looney|betty boop|toon/],
  ["animation", /animation|animated|cgi|visualization/],
  ["kids", /kids|children|child|family friendly|nursery/],
  ["educational", /education|lesson|tutorial|lecture|classroom|how it works/],
  ["comedy", /comedy|comic|funny|humor/],
  ["adventure", /adventure|western|quest|expedition/],
  ["drama", /drama|romance|melodrama/],
  ["classic", /classic|silent film|feature film|golden age/],
];

function categorize(text: string): { category: string; keywords: string[] } {
  const t = text.toLowerCase();
  const hits = CATEGORY_MATCHERS.filter(([, re]) => re.test(t)).map(([name]) => name);
  return { category: hits[0] ?? "general", keywords: hits.slice(0, 8) };
}

function looksBlackAndWhite(text: string, year: number | null): boolean | null {
  const t = text.toLowerCase();
  if (/black[- ]and[- ]white|b&w|\bbw\b|silent film|monochrome/.test(t)) return false;
  if (/technicolor|\bcolor\b|\bcolour\b|full color/.test(t)) return true;
  if (year && year < 1950) return false; // very likely monochrome
  return null; // unknown
}

/* --------------------------------------------------------------- scoring */

export type Scored = {
  quality_score: number;
  interestingness_score: number;
  recommendation_score: number;
  audio_quality: string;
  reasons: string[];
};

export function scoreCandidate(c: Candidate, w: ScoreWeights): Scored {
  const reasons: string[] = [];
  const height = c.resolution_height ?? 0;
  let quality = 0;

  if (height >= 1080) quality += w.res1080;
  else if (height >= 720) quality += w.res720;
  else if (height >= 480) quality += w.res480;
  else if (height > 0) {
    quality += w.quality_penalty;
    reasons.push(`Resolution below 480p (${height}p)`);
  } else reasons.push("Resolution unknown");

  // Picture quality proxy: resolution vs. bitrate/duration sanity + no damage words.
  const text = `${c.title} ${c.description}`.toLowerCase();
  const damaged = /damaged|incomplete|corrupt|blurry|unwatchable|test pattern|low quality/.test(
    text,
  );
  if (damaged) {
    quality += w.quality_penalty;
    reasons.push("Description indicates damaged or poor picture");
  } else if (height >= 720) quality += w.picture;
  else if (height >= 480) quality += Math.round(w.picture / 2);

  // Audio
  let audio_quality = "unknown";
  if (c.audio_info) {
    if (/no audio|silent|mute/.test(c.audio_info.toLowerCase())) {
      audio_quality = "missing";
      reasons.push("No audio track detected");
    } else if (/stereo|2 channels|aac|vorbis|opus|mp3/.test(c.audio_info.toLowerCase())) {
      audio_quality = "good";
      quality += w.audio;
    } else {
      audio_quality = "present";
      quality += Math.round(w.audio / 2);
    }
  } else {
    audio_quality = "unknown";
    quality += Math.round(w.audio / 3); // uncertain, not rejected
  }

  if (c.is_color === true) quality += w.color;
  else if (c.is_color === false) {
    quality += w.bw_penalty;
    reasons.push("Black-and-white footage");
  }

  // Interestingness
  let interesting = 0;
  const priority = CATEGORY_PRIORITY[c.category] ?? 0.4;
  interesting += priority * w.genre;
  if (c.title.length >= 8 && !/^untitled/i.test(c.title)) interesting += 4;
  if (c.description.length >= 120) interesting += 4;
  if (c.keywords.length >= 2) interesting += 3;
  if (c.thumbnail_url) interesting += 2;
  const secs = c.duration_seconds ?? 0;
  if (secs >= 30 && secs <= 7200) interesting += w.duration;
  else if (secs > 0) reasons.push("Unusual duration");
  if (height >= 720) interesting += 4;
  if (c.published_at) {
    const years = (Date.now() - Date.parse(c.published_at)) / 3.15e10;
    if (years < 3) interesting += w.recency;
  }
  interesting = Math.min(interesting, w.interesting + w.genre + w.duration + w.recency);

  let metadata = 0;
  if (c.license) metadata += 2;
  if (c.external_creator) metadata += 1;
  if (c.canonical_url) metadata += 1;
  if (c.published_at) metadata += 1;
  metadata = Math.min(metadata, w.metadata);

  const recommendation = Math.round(quality + interesting + metadata);
  return {
    quality_score: Math.round(quality),
    interestingness_score: Math.round(interesting),
    recommendation_score: recommendation,
    audio_quality,
    reasons,
  };
}

/* ------------------------------------------------------- source adapters */

const IA_QUERIES = [
  "vampire",
  "zombie",
  "horror",
  "science fiction",
  "documentary",
  "cartoon",
  "animation",
  "educational film",
  "historical film",
  "classic film",
];

type IaSearch = { response?: { docs?: Array<{ identifier: string }> } };
type IaMeta = {
  metadata?: Record<string, unknown>;
  files?: Array<Record<string, string>>;
  is_dark?: boolean;
};

export async function discoverInternetArchive(limit = 10): Promise<Candidate[]> {
  const term = IA_QUERIES[Math.floor(Math.random() * IA_QUERIES.length)]!;
  const q = encodeURIComponent(
    `(${term}) AND mediatype:(movies) AND (licenseurl:(*creativecommons*) OR collection:(feature_films) OR collection:(prelinger) OR collection:(classic_cartoons))`,
  );
  const search = await getJson<IaSearch>(
    `https://archive.org/advancedsearch.php?q=${q}&fl%5B%5D=identifier&rows=${limit}&page=1&sort%5B%5D=downloads+desc&output=json`,
  );
  const ids = (search.response?.docs ?? []).map((d) => d.identifier).filter(Boolean);
  const out: Candidate[] = [];

  for (const id of ids) {
    try {
      const meta = await getJson<IaMeta>(`https://archive.org/metadata/${encodeURIComponent(id)}`);
      if (meta.is_dark || !meta.metadata) continue;
      const m = meta.metadata as Record<string, string | string[]>;
      const str = (v: unknown) =>
        Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "";
      const files = meta.files ?? [];
      const mp4 = files
        .filter((f) => /MPEG4|h\.264/i.test(f["format"] ?? "") && f["name"]?.endsWith(".mp4"))
        .sort((a, b) => Number(b["height"] ?? 0) - Number(a["height"] ?? 0))[0];
      if (!mp4?.["name"]) continue;

      const playback = safeUrl(
        `https://archive.org/download/${encodeURIComponent(id)}/${encodeURI(mp4["name"])}`,
      );
      if (!playback) continue;

      const licenseText = `${str(m["licenseurl"])} ${str(m["rights"])} ${str(m["collection"])}`;
      const rights = classifyRights(licenseText);
      const title = str(m["title"]) || id;
      const description = str(m["description"])
        .replace(/<[^>]+>/g, "")
        .slice(0, 1200);
      const blob = `${title} ${description} ${str(m["subject"])}`;
      const year = Number((str(m["date"]) || "").slice(0, 4)) || null;

      out.push({
        source: "internet_archive",
        external_id: id,
        canonical_url: `https://archive.org/details/${id}`,
        playback_url: playback,
        thumbnail_url: `https://archive.org/services/img/${id}`,
        title,
        description,
        media_type: "video/mp4",
        duration_seconds: Math.round(Number(mp4["length"] ?? 0)) || null,
        resolution_height: Number(mp4["height"] ?? 0) || null,
        frame_rate: null,
        audio_info: files.some((f) => /audio/i.test(f["format"] ?? ""))
          ? "audio track present"
          : null,
        license: str(m["licenseurl"]) || str(m["rights"]) || "Unspecified (Internet Archive)",
        license_url: safeUrl(str(m["licenseurl"])) ?? null,
        rights_status: rights.status,
        rights_confidence: rights.confidence,
        external_creator: str(m["creator"]) || "Internet Archive",
        published_at: year ? `${year}-01-01T00:00:00Z` : null,
        ...categorize(blob),
        is_color: looksBlackAndWhite(blob, year),
        source_metadata: { collection: m["collection"], file: mp4["name"] },
      });
    } catch {
      // one item failing must never break the run
    }
  }
  return out;
}

const COMMONS_QUERIES = [
  "documentary",
  "science",
  "history",
  "space",
  "animation",
  "cartoon",
  "educational",
  "public domain film",
];

type CommonsResp = {
  query?: {
    pages?: Record<
      string,
      {
        pageid: number;
        title: string;
        imageinfo?: Array<{
          url: string;
          width?: number;
          height?: number;
          duration?: number;
          mime?: string;
          descriptionurl?: string;
          extmetadata?: Record<string, { value: string }>;
        }>;
      }
    >;
  };
};

export async function discoverWikimediaCommons(limit = 10): Promise<Candidate[]> {
  const term = COMMONS_QUERIES[Math.floor(Math.random() * COMMONS_QUERIES.length)]!;
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search` +
    `&gsrsearch=${encodeURIComponent(`filetype:video ${term}`)}&gsrnamespace=6&gsrlimit=${limit}` +
    `&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cextmetadata`;
  const data = await getJson<CommonsResp>(url);
  const pages = Object.values(data.query?.pages ?? {});
  const out: Candidate[] = [];

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const playback = safeUrl(info.url?.split("?")[0]);
    if (!playback || !/\.(webm|ogv|mp4)$/i.test(playback)) continue;
    const ex = info.extmetadata ?? {};
    const val = (k: string) => (ex[k]?.value ?? "").replace(/<[^>]+>/g, "").trim();
    const licenseText = `${val("LicenseShortName")} ${val("License")} ${val("UsageTerms")} ${val("Categories")}`;
    const rights = classifyRights(licenseText);
    const title = page.title.replace(/^File:/, "").replace(/\.(webm|ogv|mp4)$/i, "");
    const description = val("ImageDescription").slice(0, 1200);
    const blob = `${title} ${description} ${val("Categories")}`;
    const dateVal = val("DateTimeOriginal") || val("DateTime");
    const year = Number((dateVal.match(/\d{4}/) ?? [])[0]) || null;

    out.push({
      source: "wikimedia_commons",
      external_id: String(page.pageid),
      canonical_url:
        safeUrl(info.descriptionurl) ??
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      playback_url: playback,
      thumbnail_url: null,
      title,
      description,
      media_type: info.mime ?? "video/webm",
      duration_seconds: info.duration ? Math.round(info.duration) : null,
      resolution_height: info.height ?? null,
      frame_rate: null,
      audio_info: null,
      license: val("LicenseShortName") || val("UsageTerms") || "Unspecified",
      license_url: safeUrl(ex["LicenseUrl"]?.value) ?? null,
      rights_status: rights.status,
      rights_confidence: rights.confidence,
      external_creator: val("Artist") || "Wikimedia Commons contributor",
      published_at: year ? `${year}-01-01T00:00:00Z` : null,
      ...categorize(blob),
      is_color: looksBlackAndWhite(blob, year),
      source_metadata: { categories: val("Categories") },
    });
  }
  return out;
}

const NASA_QUERIES = [
  "galaxy",
  "planets",
  "solar system",
  "spacecraft",
  "climate",
  "earth science",
  "black hole",
  "mission",
];

type SvsSearch = { results?: Array<{ id: number; title: string }> };
type SvsItem = {
  id: number;
  url: string;
  title: string;
  description?: string;
  release_date?: string;
  keywords?: string[];
  nasa_science_categories?: string[];
  main_credits?: string[];
  main_image?: { url?: string };
  main_video?: { url?: string; width?: number; height?: number; alt_text?: string };
};

export async function discoverNasaSvs(limit = 8): Promise<Candidate[]> {
  const term = NASA_QUERIES[Math.floor(Math.random() * NASA_QUERIES.length)]!;
  const search = await getJson<SvsSearch>(
    `https://svs.gsfc.nasa.gov/api/search/?q=${encodeURIComponent(term)}&limit=${limit}`,
  );
  const out: Candidate[] = [];

  for (const hit of search.results ?? []) {
    try {
      const item = await getJson<SvsItem>(`https://svs.gsfc.nasa.gov/api/${hit.id}/`);
      const playback = safeUrl(item.main_video?.url);
      if (!playback || !/\.mp4$/i.test(playback)) continue;
      const notes = `${item.description ?? ""} ${item.main_video?.alt_text ?? ""} ${(item.main_credits ?? []).join(" ")}`;
      // NASA SVS is public domain unless individual notes say otherwise.
      const flagged = /licensed music|universal production music|third[- ]party|courtesy of/i.test(
        notes,
      );
      const rights: { status: RightsStatus; confidence: number } = flagged
        ? { status: "unknown", confidence: 0.4 }
        : { status: "public_domain", confidence: 0.85 };
      const blob = `${item.title} ${notes} ${(item.keywords ?? []).join(" ")}`;
      const cat = categorize(blob);

      out.push({
        source: "nasa_svs",
        external_id: String(item.id),
        canonical_url: safeUrl(item.url) ?? `https://svs.gsfc.nasa.gov/${item.id}/`,
        playback_url: playback,
        thumbnail_url: safeUrl(item.main_image?.url),
        title: item.title,
        description: (item.description ?? "").replace(/<[^>]+>/g, "").slice(0, 1200),
        media_type: "video/mp4",
        duration_seconds: null,
        resolution_height: item.main_video?.height ?? null,
        frame_rate: null,
        audio_info: /narrat|music|voice/i.test(notes) ? "narration or music present" : null,
        license: flagged
          ? "Public domain with possible third-party material"
          : "NASA public domain",
        license_url: "https://svs.gsfc.nasa.gov/help/",
        rights_status: rights.status,
        rights_confidence: rights.confidence,
        external_creator: "NASA Scientific Visualization Studio",
        published_at: item.release_date ?? null,
        category: cat.category === "general" ? "space" : cat.category,
        keywords: (item.keywords ?? []).slice(0, 8).map((k) => k.toLowerCase()),
        is_color: true,
        source_metadata: {
          categories: item.nasa_science_categories,
          third_party_notice: flagged,
        },
      });
    } catch {
      // skip individual failures
    }
  }
  return out;
}

/* ------------------------------------------------------------ persistence */

export async function loadWeights(): Promise<ScoreWeights> {
  const { data } = await supabaseAdmin
    .from("discovery_settings")
    .select("weights")
    .eq("id", true)
    .maybeSingle();
  return { ...DEFAULT_WEIGHTS, ...((data?.weights as Partial<ScoreWeights>) ?? {}) };
}

type RunTotals = {
  examined: number;
  inserted: number;
  pending: number;
  rejected: number;
  duplicates: number;
};

function decide(c: Candidate, s: Scored, w: ScoreWeights) {
  // Rights are a hard requirement.
  if (c.rights_status === "restricted")
    return { approval: "rejected" as const, reason: "Restricted or non-commercial license" };
  if (c.rights_status === "unknown")
    return { approval: "pending_review" as const, reason: "Rights could not be verified" };

  if ((c.resolution_height ?? 0) > 0 && (c.resolution_height ?? 0) < 480)
    return { approval: "rejected" as const, reason: "Resolution below 480p" };

  if (c.is_color === false)
    return {
      approval: "pending_review" as const,
      reason: "Black-and-white — needs admin review",
    };

  if (s.recommendation_score >= w.min_publish_score)
    return { approval: "approved" as const, reason: null };
  if (s.recommendation_score >= w.min_review_score)
    return { approval: "pending_review" as const, reason: "Score below publish threshold" };
  return { approval: "rejected" as const, reason: "Low quality / low interest score" };
}

export async function persistCandidates(
  candidates: Candidate[],
  weights: ScoreWeights,
): Promise<RunTotals> {
  const totals: RunTotals = { examined: 0, inserted: 0, pending: 0, rejected: 0, duplicates: 0 };

  for (const c of candidates) {
    totals.examined += 1;
    const { data: existing } = await supabaseAdmin
      .from("posts")
      .select("id")
      .eq("source", c.source)
      .eq("external_id", c.external_id)
      .maybeSingle();
    if (existing) {
      totals.duplicates += 1;
      continue;
    }

    const scored = scoreCandidate(c, weights);
    const decision = decide(c, scored, weights);
    if (decision.approval === "rejected") totals.rejected += 1;
    else if (decision.approval === "pending_review") totals.pending += 1;
    else totals.inserted += 1;

    const secs = c.duration_seconds ?? 0;
    const shortsEligible = secs > 0 && secs <= 180;

    const { error } = await supabaseAdmin.from("posts").insert({
      author_id: null,
      kind: "video",
      feed: shortsEligible ? "shorts" : "home",
      title: c.title.slice(0, 200),
      caption: c.description,
      status: "published",
      source: c.source,
      external_id: c.external_id,
      canonical_url: c.canonical_url,
      playback_url: c.playback_url,
      thumbnail_url: c.thumbnail_url,
      media_type: c.media_type,
      license: c.license,
      license_url: c.license_url,
      rights_status: c.rights_status,
      rights_confidence: c.rights_confidence,
      resolution_height: c.resolution_height,
      frame_rate: c.frame_rate,
      audio_info: c.audio_info,
      audio_quality: scored.audio_quality,
      is_color: c.is_color,
      external_creator: c.external_creator,
      published_at: c.published_at,
      category: c.category,
      keywords: c.keywords,
      duration_seconds: c.duration_seconds,
      quality_score: scored.quality_score,
      interestingness_score: scored.interestingness_score,
      recommendation_score: scored.recommendation_score,
      approval_status: decision.approval,
      home_eligible: !shortsEligible,
      shorts_eligible: shortsEligible,
      rejection_reason: decision.reason ?? scored.reasons.join("; ") ?? null,
      discovered_at: new Date().toISOString(),
      source_metadata: c.source_metadata as never,
    });
    if (error) {
      totals.inserted = Math.max(0, totals.inserted - 1);
    }
  }

  return totals;
}

const SOURCES: Array<{ source: ContentSource; run: () => Promise<Candidate[]> }> = [
  { source: "internet_archive", run: () => discoverInternetArchive() },
  { source: "wikimedia_commons", run: () => discoverWikimediaCommons() },
  { source: "nasa_svs", run: () => discoverNasaSvs() },
];

export type RunResult = {
  source: ContentSource;
  ok: boolean;
  error?: string;
  examined?: number;
  inserted?: number;
  pending?: number;
  rejected?: number;
  duplicates?: number;
};

/** Recomputes the scores of an already-stored discovered post. */
export async function rescorePost(postId: string) {
  const weights = await loadWeights();
  const { data: post, error } = await supabaseAdmin
    .from("posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();
  if (error || !post) throw new Error("Post not found");

  const candidate = {
    source: post.source,
    external_id: post.external_id ?? "",
    canonical_url: post.canonical_url ?? "",
    playback_url: post.playback_url ?? "",
    thumbnail_url: post.thumbnail_url,
    title: post.title,
    description: post.caption,
    media_type: post.media_type ?? "video/mp4",
    duration_seconds: post.duration_seconds,
    resolution_height: post.resolution_height,
    frame_rate: post.frame_rate,
    audio_info: post.audio_info,
    license: post.license ?? "",
    license_url: post.license_url,
    rights_status: post.rights_status,
    rights_confidence: Number(post.rights_confidence ?? 0),
    external_creator: post.external_creator,
    published_at: post.published_at,
    category: post.category ?? "general",
    keywords: post.keywords ?? [],
    is_color: post.is_color,
    source_metadata: {},
  } as Candidate;

  const scored = scoreCandidate(candidate, weights);
  await supabaseAdmin
    .from("posts")
    .update({
      quality_score: scored.quality_score,
      interestingness_score: scored.interestingness_score,
      recommendation_score: scored.recommendation_score,
      audio_quality: scored.audio_quality,
    })
    .eq("id", postId);

  return {
    quality_score: scored.quality_score,
    interestingness_score: scored.interestingness_score,
    recommendation_score: scored.recommendation_score,
  };
}

/** Runs every source independently — one failure never breaks the others. */
export async function runDiscovery(only?: ContentSource) {
  const weights = await loadWeights();
  const results: RunResult[] = [];

  for (const entry of SOURCES) {
    if (only && only !== entry.source) continue;
    const startedAt = new Date().toISOString();
    try {
      const candidates = await entry.run();
      const totals = await persistCandidates(candidates, weights);
      await supabaseAdmin.from("discovery_runs").insert({
        source: entry.source,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        ok: true,
        ...totals,
      });
      results.push({ source: entry.source, ok: true, ...totals });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await supabaseAdmin.from("discovery_runs").insert({
        source: entry.source,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        ok: false,
        error: message,
      });
      results.push({ source: entry.source, ok: false, error: message });
    }
  }

  return results;
}
