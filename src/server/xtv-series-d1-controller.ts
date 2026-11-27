import { verifyAdminSession } from "./admin-auth";

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
interface D1Database { prepare(sql: string): D1Statement; }
interface XSeriesEnv { XORATV_XSERIES_DB?: D1Database; TMDB_API_KEY?: string; }
interface TitleRow {
  id: number; tmdb_id: number; media_type: "movie" | "tv"; title: string;
  original_title: string | null; overview: string | null; release_date: string | null;
  release_year: number | null; poster_path: string | null; backdrop_path: string | null;
  genres_json: string; vote_average: number | null; runtime_minutes: number | null;
  category: string | null; match_status: string; is_published: number;
  created_at: string; updated_at: string;
}
const IMAGE_BASE = "https://image.tmdb.org/t/p/";
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const int = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const parseGenres = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch { return []; }
};
function publicItem(row: TitleRow) {
  const categories = parseGenres(row.genres_json);
  return {
    id: row.media_type + "_" + row.tmdb_id,
    title: row.title,
    description: row.overview || "",
    genre: row.category || categories[0] || "More",
    year: row.release_year || undefined,
    tag: row.media_type === "tv" ? "Series" : "Movie",
    thumbnailUrl: row.poster_path ? IMAGE_BASE + "w500" + row.poster_path : undefined,
    backdropUrl: row.backdrop_path ? IMAGE_BASE + "w1280" + row.backdrop_path : undefined,
    provider: "xora-catalog",
    durationSeconds: row.runtime_minutes ? row.runtime_minutes * 60 : undefined,
    createdAt: row.created_at,
    categories,
    playbackAvailable: false,
  };
}
function adminItem(row: TitleRow) {
  return {
    ...publicItem(row), tmdbId: row.tmdb_id, mediaType: row.media_type,
    originalTitle: row.original_title, releaseDate: row.release_date,
    voteAverage: row.vote_average, runtimeMinutes: row.runtime_minutes,
    matchStatus: row.match_status, isPublished: row.is_published === 1,
    updatedAt: row.updated_at,
  };
}
function requireAdmin(request: Request): boolean { return verifyAdminSession(request).valid; }
async function tmdb<T>(path: string, apiKey: string): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch("https://api.themoviedb.org/3/" + path + separator + "api_key=" + encodeURIComponent(apiKey), {
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error("TMDB title was not found.");
    if (response.status === 429) throw new Error("TMDB is rate-limiting requests. Try again shortly.");
    throw new Error("TMDB request failed (" + response.status + ").");
  }
  return response.json() as Promise<T>;
}
function tmdbResult(item: Record<string, unknown>, mediaType: "movie" | "tv") {
  const date = text(item.release_date) || text(item.first_air_date);
  const title = text(item.title) || text(item.name);
  return {
    tmdbId: Number(item.id), mediaType, title,
    originalTitle: text(item.original_title) || text(item.original_name),
    overview: text(item.overview), releaseDate: date || null,
    year: date ? Number(date.slice(0, 4)) || null : null,
    posterUrl: text(item.poster_path) ? IMAGE_BASE + "w500" + text(item.poster_path) : null,
    backdropUrl: text(item.backdrop_path) ? IMAGE_BASE + "w1280" + text(item.backdrop_path) : null,
    voteAverage: Number(item.vote_average) || 0,
  };
}

export async function handleXtvSeriesRoute(request: Request, url: URL, rawEnv: Record<string, unknown>): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/xtv-series/")) return null;
  if (request.method === "OPTIONS") return json({ ok: true }, 204);
  const env = rawEnv as XSeriesEnv;
  const db = env.XORATV_XSERIES_DB;
  if (!db) return json({ ok: false, error: "X-Series database binding is unavailable." }, 503);

  try {
    if (path === "/api/xtv-series/status" && request.method === "GET") {
      const row = await db.prepare("SELECT COUNT(*) AS total, SUM(is_published) AS published FROM xseries_titles")
        .first<{ total: number; published: number | null }>();
      return json({ ok: true, database: "connected", total: row?.total || 0, published: row?.published || 0 });
    }

    if (path === "/api/xtv-series/items" && request.method === "GET") {
      const genre = text(url.searchParams.get("genre"));
      const query = text(url.searchParams.get("q"));
      const limit = Math.min(1000, Math.max(1, int(url.searchParams.get("limit"), 1000)));
      const page = Math.max(1, int(url.searchParams.get("page"), 1));
      const where = ["is_published = 1"];
      const values: unknown[] = [];
      if (genre && genre.toLowerCase() !== "all") {
        where.push("(LOWER(COALESCE(category, '')) = LOWER(?) OR EXISTS (SELECT 1 FROM json_each(xseries_titles.genres_json) WHERE LOWER(value) = LOWER(?)))");
        values.push(genre, genre);
      }
      if (query) {
        where.push("(LOWER(title) LIKE LOWER(?) OR LOWER(COALESCE(overview, '')) LIKE LOWER(?))");
        values.push("%" + query + "%", "%" + query + "%");
      }
      const result = await db.prepare("SELECT * FROM xseries_titles WHERE " + where.join(" AND ") +
        " ORDER BY COALESCE(release_date, created_at) DESC, title COLLATE NOCASE ASC LIMIT ? OFFSET ?")
        .bind(...values, limit, (page - 1) * limit).all<TitleRow>();
      return json({ ok: true, items: result.results.map(publicItem), page, limit, hasMore: result.results.length === limit }, 200, {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      });
    }

    if (path.startsWith("/api/xtv-series/admin/")) {
      if (!requireAdmin(request)) return json({ ok: false, error: "Administrator authorization required." }, 401);
      const apiKey = text(env.TMDB_API_KEY);

      if (path === "/api/xtv-series/admin/tmdb-search" && request.method === "GET") {
        if (!apiKey) return json({ ok: false, error: "TMDB metadata service is not configured." }, 503);
        const query = text(url.searchParams.get("q"));
        const media = text(url.searchParams.get("type")) || "all";
        if (query.length < 2) return json({ ok: false, error: "Enter at least two characters to search." }, 400);
        if (!["all", "movie", "tv"].includes(media)) return json({ ok: false, error: "Invalid media type." }, 400);
        const types: ("movie" | "tv")[] = media === "all" ? ["movie", "tv"] : [media as "movie" | "tv"];
        const batches = await Promise.all(types.map(async (type) => {
          const data = await tmdb<{ results?: Record<string, unknown>[] }>(
            "search/" + type + "?query=" + encodeURIComponent(query) + "&include_adult=false&page=1", apiKey);
          return (data.results || []).map((item) => tmdbResult(item, type));
        }));
        const results = batches.flat().filter((item) => item.tmdbId && item.title)
          .sort((a, b) => b.voteAverage - a.voteAverage).slice(0, 30);
        return json({ ok: true, results });
      }

      if (path === "/api/xtv-series/admin/titles" && request.method === "GET") {
        const result = await db.prepare("SELECT * FROM xseries_titles ORDER BY updated_at DESC, title COLLATE NOCASE ASC LIMIT 500").all<TitleRow>();
        return json({ ok: true, items: result.results.map(adminItem) });
      }

      if (path === "/api/xtv-series/admin/import" && request.method === "POST") {
        if (!apiKey) return json({ ok: false, error: "TMDB metadata service is not configured." }, 503);
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const tmdbId = int(body.tmdbId, 0);
        const mediaType = text(body.mediaType);
        const category = text(body.category) || null;
        if (!tmdbId || !["movie", "tv"].includes(mediaType)) {
          return json({ ok: false, error: "A valid TMDB title ID and media type are required." }, 400);
        }
        const details = await tmdb<Record<string, unknown>>(mediaType + "/" + tmdbId, apiKey);
        const title = text(details.title) || text(details.name);
        if (!title) return json({ ok: false, error: "TMDB did not return a valid title." }, 422);
        const releaseDate = text(details.release_date) || text(details.first_air_date) || null;
        const year = releaseDate ? Number(releaseDate.slice(0, 4)) || null : null;
        const genres = Array.isArray(details.genres)
          ? details.genres.map((item) => text((item as Record<string, unknown>).name)).filter(Boolean)
          : [];
        const runtime = int(details.runtime, Array.isArray(details.episode_run_time) ? int(details.episode_run_time[0], 0) : 0) || null;
        await db.prepare("INSERT INTO xseries_titles " +
          "(tmdb_id, media_type, title, original_title, overview, release_date, release_year, poster_path, backdrop_path, genres_json, vote_average, runtime_minutes, category, match_status, is_published, updated_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 0, CURRENT_TIMESTAMP) " +
          "ON CONFLICT(tmdb_id) DO UPDATE SET media_type=excluded.media_type, title=excluded.title, original_title=excluded.original_title, " +
          "overview=excluded.overview, release_date=excluded.release_date, release_year=excluded.release_year, poster_path=excluded.poster_path, " +
          "backdrop_path=excluded.backdrop_path, genres_json=excluded.genres_json, vote_average=excluded.vote_average, runtime_minutes=excluded.runtime_minutes, " +
          "category=COALESCE(excluded.category, xseries_titles.category), match_status='confirmed', updated_at=CURRENT_TIMESTAMP")
          .bind(tmdbId, mediaType, title, text(details.original_title) || text(details.original_name) || null,
            text(details.overview) || null, releaseDate, year, text(details.poster_path) || null,
            text(details.backdrop_path) || null, JSON.stringify(genres), Number(details.vote_average) || null,
            runtime, category).run();
        const row = await db.prepare("SELECT * FROM xseries_titles WHERE tmdb_id = ?").bind(tmdbId).first<TitleRow>();
        return json({ ok: true, item: row ? adminItem(row) : null, published: false });
      }

      const titleAction = path.match(/^\/api\/xtv-series\/admin\/titles\/(\d+)\/(publish|unpublish)$/);
      if (titleAction && request.method === "POST") {
        const id = Number(titleAction[1]);
        const publish = titleAction[2] === "publish" ? 1 : 0;
        await db.prepare("UPDATE xseries_titles SET is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(publish, id).run();
        const row = await db.prepare("SELECT * FROM xseries_titles WHERE id = ?").bind(id).first<TitleRow>();
        if (!row) return json({ ok: false, error: "Title not found." }, 404);
        return json({ ok: true, item: adminItem(row) });
      }

      const titleId = path.match(/^\/api\/xtv-series\/admin\/titles\/(\d+)$/);
      if (titleId && request.method === "DELETE") {
        await db.prepare("DELETE FROM xseries_titles WHERE id = ?").bind(Number(titleId[1])).run();
        return json({ ok: true });
      }
    }
    return json({ ok: false, error: "X-Series endpoint not found." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "X-Series request failed.";
    console.error("[X-Series API]", message);
    return json({ ok: false, error: message }, 500);
  }
}
