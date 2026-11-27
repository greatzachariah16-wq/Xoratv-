import { verifyAdminSession } from "./admin-auth";

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
interface D1Database { prepare(sql: string): D1Statement; batch<T = unknown>(statements: D1Statement[]): Promise<T[]>; }
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


const MOVIE_GENRES: Record<number, string> = {28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",878:"Sci-Fi",10770:"TV Movie",53:"Thriller",10752:"War",37:"Western"};
const TV_GENRES: Record<number, string> = {10759:"Action",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",10751:"Family",10762:"Kids",9648:"Mystery",10763:"News",10764:"Reality",10765:"Sci-Fi",10766:"Soap",10767:"Talk",10768:"War",37:"Western"};
async function seedPopularTmdb(db: D1Database, apiKey: string): Promise<number> {
  const requests = ["popular", "top_rated", "now_playing"].flatMap((kind) =>
    (kind === "now_playing" ? [1] : [1, 2]).map(async (page) => {
      const data = await tmdb<{ results?: Record<string, unknown>[] }>(
        "movie/" + kind + "?include_adult=false&language=en-US&page=" + page, apiKey);
      return { results: data.results || [] };
    }));
  const lists = await Promise.all(requests);
  const rows = new Map<string, Record<string, unknown>>();
  for (const list of lists) for (const item of list.results) {
    const id = Number(item.id);
    const genreIds = Array.isArray(item.genre_ids) ? item.genre_ids.map(Number) : [];
    if (!id || !text(item.title) || genreIds.includes(16)) continue;
    const current = rows.get(String(id));
    if (!current || Number(item.popularity || 0) > Number(current.popularity || 0)) rows.set(String(id), item);
  }
  const statements = Array.from(rows.values()).map((item) => {
    const date = text(item.release_date) || null;
    const title = text(item.title);
    const ids = Array.isArray(item.genre_ids) ? item.genre_ids.map(Number) : [];
    const genres = ids.map((id) => MOVIE_GENRES[id]).filter((genre) => genre && genre !== "Animation");
    return db.prepare("INSERT OR IGNORE INTO xseries_titles (tmdb_id, media_type, title, original_title, overview, release_date, release_year, poster_path, backdrop_path, genres_json, vote_average, runtime_minutes, category, match_status, is_published, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'confirmed', 1, CURRENT_TIMESTAMP)")
      .bind(Number(item.id), "movie", title, text(item.original_title) || null,
        text(item.overview) || null, date, date ? Number(date.slice(0, 4)) || null : null,
        text(item.poster_path) || null, text(item.backdrop_path) || null, JSON.stringify(genres),
        Number(item.vote_average) || null, genres[0] || "More");
  });
  for (let offset = 0; offset < statements.length; offset += 80) {
    await db.batch(statements.slice(offset, offset + 80));
  }
  return statements.length;
}
function tmdbSearchItem(item: Record<string, unknown>) {
  const type = text(item.media_type);
  if (type !== "movie") return null;
  const genreIds = Array.isArray(item.genre_ids) ? item.genre_ids.map(Number) : [];
  if (genreIds.includes(16)) return null;
  const date = text(item.release_date);
  const ids = genreIds;
  const categories = ids.map((id) => MOVIE_GENRES[id]).filter((genre) => genre && genre !== "Animation");
  return {
    id: type + "_" + Number(item.id),
    title: text(item.title) || text(item.name),
    description: text(item.overview),
    genre: categories[0] || "More",
    year: date ? Number(date.slice(0, 4)) || undefined : undefined,
    tag: type === "tv" ? "Series" : "Movie",
    thumbnailUrl: text(item.poster_path) ? IMAGE_BASE + "w500" + text(item.poster_path) : undefined,
    backdropUrl: text(item.backdrop_path) ? IMAGE_BASE + "w1280" + text(item.backdrop_path) : undefined,
    provider: "tmdb-search",
    createdAt: new Date().toISOString(),
    categories,
    playbackAvailable: false,
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
      const apiKey = text(env.TMDB_API_KEY);
      // X-Series is a live-action movie catalogue, not a TV or animation feed.
      await db.prepare("DELETE FROM xseries_titles WHERE media_type != 'movie' OR EXISTS (SELECT 1 FROM json_each(xseries_titles.genres_json) WHERE LOWER(value) = 'animation')").run();
      const count = await db.prepare("SELECT COUNT(*) AS total FROM xseries_titles WHERE is_published = 1 AND media_type = 'movie'").first<{ total: number }>();
      if (!count?.total && apiKey) await seedPopularTmdb(db, apiKey);
      const genre = text(url.searchParams.get("genre"));
      const query = text(url.searchParams.get("q"));
      const limit = Math.min(1000, Math.max(1, int(url.searchParams.get("limit"), 1000)));
      const page = Math.max(1, int(url.searchParams.get("page"), 1));
      const where = ["is_published = 1", "media_type = 'movie'", "NOT EXISTS (SELECT 1 FROM json_each(xseries_titles.genres_json) WHERE LOWER(value) = 'animation')"];
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
        " ORDER BY COALESCE(vote_average, 0) DESC, COALESCE(release_date, created_at) DESC, title COLLATE NOCASE ASC LIMIT ? OFFSET ?")
        .bind(...values, limit, (page - 1) * limit).all<TitleRow>();
      return json({ ok: true, items: result.results.map(publicItem), page, limit, hasMore: result.results.length === limit }, 200, {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      });
    }


    if (path === "/api/xtv-series/search" && request.method === "GET") {
      const apiKey = text(env.TMDB_API_KEY);
      if (!apiKey) return json({ ok: false, error: "TMDB search is not configured." }, 503);
      const query = text(url.searchParams.get("q"));
      const page = Math.max(1, Math.min(500, int(url.searchParams.get("page"), 1)));
      if (query.length < 2) return json({ ok: true, results: [], page, totalPages: 0, totalResults: 0 });
      const data = await tmdb<{ results?: Record<string, unknown>[]; page?: number; total_pages?: number; total_results?: number }>(
        "search/movie?query=" + encodeURIComponent(query) + "&include_adult=false&language=en-US&page=" + page, apiKey);
      const results = (data.results || []).map((item) => tmdbSearchItem({ ...item, media_type: "movie" })).filter((item) => item && item.title);
      return json({ ok: true, results, page: data.page || page, totalPages: Math.min(500, data.total_pages || 0), totalResults: data.total_results || 0 }, 200, {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
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
