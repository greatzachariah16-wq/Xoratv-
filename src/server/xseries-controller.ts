import { verifyAdminSession } from "./admin-auth";
import {
  XSERIS_CATEGORIES,
  type XserisCandidate,
  type XserisCategory,
  type XserisMediaItem,
} from "../lib/xseris/types";
import { checkFirebaseAdminStatus, xseriesDbRead, xseriesDbWrite } from "./xseries-service-account";
import { normalizeUrl, processSeedBatch, extractVideoMetadata } from "./xseries-crawler";

const headers = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

const safeKey = (v: string) => v.replace(/[.#$[\]/]/g, "_");

function parseCategories(value: unknown): XserisCategory[] {
  return Array.isArray(value)
    ? value.filter(
        (x): x is XserisCategory =>
          typeof x === "string" && (XSERIS_CATEGORIES as readonly string[]).includes(x),
      )
    : [];
}

// Unified route handler for /api/xseries, /api/xseris, and viewer-facing /api/catalog
export async function handleXseriesRoute(request: Request, url: URL): Promise<Response | null> {
  const pathname = url.pathname;

  // Only handle relevant paths
  const isXseries = pathname.startsWith("/api/xseries");
  const isLegacyXseris = pathname.startsWith("/api/xseris");
  const isCatalog = pathname.startsWith("/api/catalog");

  if (!isXseries && !isLegacyXseris && !isCatalog) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return reply({ ok: true }, 204);
  }

  // Diagnostic health/config status endpoint
  if (
    (pathname === "/api/xseries/status" ||
      pathname === "/api/xseris/status" ||
      pathname === "/api/xseries/config-status" ||
      pathname === "/api/xseris/config-status") &&
    request.method === "GET"
  ) {
    const adminStatus = checkFirebaseAdminStatus();
    return reply({
      ok: true,
      service: "xseries-controller",
      version: "2.0.0",
      firebase: adminStatus,
    });
  }

  // ==========================================
  // PUBLIC VIEWER-FACING CATALOG ENDPOINTS
  // ==========================================

  // 1. Catalog categories: GET /api/catalog/categories (or /api/xseries/categories)
  if (
    (pathname === "/api/catalog/categories" ||
      pathname === "/api/xseries/categories" ||
      pathname === "/api/xseris/categories") &&
    request.method === "GET"
  ) {
    try {
      const stored = (await xseriesDbRead("categories").catch(() => null)) as Record<
        string,
        { name: string }
      > | null;
      if (stored && Object.keys(stored).length) {
        return reply({ categories: Object.values(stored).map((x) => x.name) });
      }
      const all = (await xseriesDbRead("mediaItems").catch(() => null)) as Record<
        string,
        XserisMediaItem
      > | null;
      const found = new Set<string>();
      Object.values(all || {}).forEach((x) => (x.categories || []).forEach((c) => found.add(c)));
      const list = Array.from(found).sort();
      return reply({ categories: list.length ? list : Array.from(XSERIS_CATEGORIES) });
    } catch {
      return reply({ categories: Array.from(XSERIS_CATEGORIES) });
    }
  }

  // 2. Catalog listing: GET /api/catalog (or /api/xseries/catalog)
  if (
    (pathname === "/api/catalog" ||
      pathname === "/api/xseries/catalog" ||
      pathname === "/api/xseris/catalog") &&
    request.method === "GET"
  ) {
    try {
      const category = url.searchParams.get("category") || "";
      const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || "20")));

      const all = (await xseriesDbRead("mediaItems").catch(() => null)) as Record<
        string,
        XserisMediaItem
      > | null;
      let list = Object.values(all || {}).filter((x) => x.status === "approved");
      if (category) {
        list = list.filter((x) => (x.categories || []).includes(category as XserisCategory));
      }
      list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

      // Ensure playback URL points to secure proxy
      const sanitized = list.map((item) => ({
        ...item,
        playback: {
          type: "embed" as const,
          url: `/api/stream/embed/${encodeURIComponent(item.id)}`,
          provider: "xseries-proxy",
        },
      }));

      const start = (page - 1) * limit;
      return reply({
        items: sanitized.slice(start, start + limit),
        page,
        limit,
        hasMore: start + limit < sanitized.length,
      });
    } catch (err) {
      console.warn("[Catalog API] Error fetching catalog:", err);
      return reply({ items: [], page: 1, limit: 20, hasMore: false });
    }
  }

  // 3. Playback resolution: GET /api/catalog/:id/playback (or /api/xseries/:id/playback)
  const playbackMatch =
    pathname.match(/^\/api\/catalog\/([^/]+)\/playback$/) ||
    pathname.match(/^\/api\/xseries\/([^/]+)\/playback$/) ||
    pathname.match(/^\/api\/xseris\/([^/]+)\/playback$/);

  if (playbackMatch && request.method === "GET") {
    const rawId = decodeURIComponent(playbackMatch[1]);
    try {
      const item = ((await xseriesDbRead(`mediaItems/${safeKey(rawId)}`).catch(() => null)) ||
        (await xseriesDbRead(`candidates/${safeKey(rawId)}`).catch(
          () => null,
        ))) as XserisMediaItem | null;

      if (!item) {
        return reply({ ok: false, error: "Playback source unavailable or item not found." }, 404);
      }

      // Return proxied stream embed URL
      return reply({
        ok: true,
        playback: {
          type: "embed",
          url: `/api/stream/embed/${encodeURIComponent(rawId)}`,
          provider: "xseries-proxy",
        },
      });
    } catch (err) {
      return reply(
        {
          ok: false,
          error: "Failed to resolve playback.",
          details: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
  }

  // ==========================================
  // ADMIN-PROTECTED CONTROLLER ENDPOINTS
  // ==========================================

  // Verify admin authorization for management operations
  const auth = verifyAdminSession(request);
  if (!auth.valid) {
    return reply(
      {
        ok: false,
        error: "Administrator authorization required. Please log in through the admin dashboard.",
        code: "UNAUTHORIZED",
      },
      401,
    );
  }

  // Check Firebase configuration status
  const firebaseStatus = checkFirebaseAdminStatus();

  try {
    // 4. Process seed URLs & crawl related videos: POST /api/xseries/process (or /api/xseris/process)
    if (
      (pathname === "/api/xseries/process" || pathname === "/api/xseris/process") &&
      request.method === "POST"
    ) {
      if (!firebaseStatus.configured) {
        console.warn(
          `[Xseries Controller] Firebase Admin not configured (${firebaseStatus.error}). Processing seed batch in local cache mode.`,
        );
      }

      const body = (await request.json().catch(() => ({}))) as {
        urls?: unknown;
        categories?: unknown[];
        crawlRelated?: boolean;
      };

      const raw = Array.isArray(body.urls)
        ? body.urls.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : [];

      if (!raw.length || raw.length > 20) {
        return reply({ ok: false, error: "Provide between 1 and 20 URLs." }, 400);
      }

      const urls = raw.map((u) => {
        try {
          return normalizeUrl(u);
        } catch {
          return u.trim();
        }
      });

      if (new Set(urls).size !== urls.length) {
        return reply({ ok: false, error: "Duplicate URLs are not allowed in one batch." }, 400);
      }

      const categories = parseCategories(body.categories);
      const includeRelated = body.crawlRelated !== false; // Default true

      // Run production-ready scraper & crawler pipeline
      const result = await processSeedBatch(urls, categories, includeRelated);

      return reply({
        ok: true,
        count: result.count,
        items: result.items,
        storageMode: "firebase",
        warning: undefined,
      });
    }

    // 5. Get review candidates: GET /api/xseries/candidates (or /api/xseris/candidates)
    if (
      (pathname === "/api/xseries/candidates" || pathname === "/api/xseris/candidates") &&
      request.method === "GET"
    ) {
      const all = (await xseriesDbRead("candidates").catch(() => null)) as Record<
        string,
        XserisCandidate
      > | null;
      const items = Object.values(all || {}).sort((a, b) =>
        (b.updated_at || "").localeCompare(a.updated_at || ""),
      );
      return reply({ ok: true, items });
    }

    // 6. Candidate management (retry | remove): POST /api/xseries/candidates/:id/(retry|remove)
    const controlMatch =
      pathname.match(/^\/api\/xseries\/candidates\/([^/]+)\/(retry|remove)$/) ||
      pathname.match(/^\/api\/xseris\/candidates\/([^/]+)\/(retry|remove)$/);

    if (controlMatch && request.method === "POST") {
      const id = decodeURIComponent(controlMatch[1]);
      const action = controlMatch[2];

      const candidate = (await xseriesDbRead(`candidates/${safeKey(id)}`).catch(
        () => null,
      )) as XserisCandidate | null;
      if (!candidate) {
        return reply({ ok: false, error: "Candidate not found." }, 404);
      }

      if (action === "remove") {
        await xseriesDbWrite(`candidates/${safeKey(id)}`, null, "DELETE");
        return reply({ ok: true });
      }

      // Retry: re-scrape metadata
      try {
        const m = await extractVideoMetadata(candidate.source_url);
        const updated: XserisCandidate = {
          ...candidate,
          title: m.title || candidate.title,
          description: m.description || candidate.description,
          thumbnail_url: m.thumbnail || candidate.thumbnail_url,
          duration: m.duration || candidate.duration,
          release_year: m.releaseYear || candidate.release_year,
          language: m.language || candidate.language,
          last_checked: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          processing_status: "ready_for_review",
          playback: {
            type: "embed",
            url: `/api/stream/embed/${safeKey(id)}`,
            provider: "xseries-proxy",
          },
          error: null,
        };
        await xseriesDbWrite(`candidates/${safeKey(id)}`, updated);
        return reply({ ok: true, item: updated });
      } catch (err) {
        return reply(
          {
            ok: false,
            error: err instanceof Error ? err.message : "Retry metadata extraction failed",
          },
          500,
        );
      }
    }

    // 7. Candidate moderation (publish | reject): POST /api/xseries/candidates/:id/(publish|reject)
    const modMatch =
      pathname.match(/^\/api\/xseries\/candidates\/([^/]+)\/(publish|reject)$/) ||
      pathname.match(/^\/api\/xseris\/candidates\/([^/]+)\/(publish|reject)$/);

    if (modMatch && request.method === "POST") {
      const id = decodeURIComponent(modMatch[1]);
      const action = modMatch[2];

      const candidate = (await xseriesDbRead(`candidates/${safeKey(id)}`).catch(
        () => null,
      )) as XserisCandidate | null;
      if (!candidate) {
        return reply({ ok: false, error: "Candidate not found." }, 404);
      }

      if (action === "reject") {
        const rejected = {
          ...candidate,
          status: "rejected" as const,
          processing_status: "failed" as const,
        };
        await xseriesDbWrite(`candidates/${safeKey(id)}`, rejected);
        return reply({ ok: true });
      }

      // Publish candidate to live catalog
      const body = (await request.json().catch(() => ({}))) as Partial<XserisCandidate>;
      const categories = parseCategories(body.categories || candidate.categories);

      if (!categories.length) {
        return reply({ ok: false, error: "Select at least one category before publishing." }, 400);
      }

      const publishedMedia: XserisMediaItem = {
        ...candidate,
        title:
          typeof body.title === "string" && body.title.trim() ? body.title.trim() : candidate.title,
        description:
          typeof body.description === "string" ? body.description : candidate.description,
        categories,
        status: "approved",
        updated_at: new Date().toISOString(),
        discovery_status: "processed",
        playback: {
          type: "embed",
          url: `/api/stream/embed/${safeKey(id)}`,
          provider: "xseries-proxy",
        },
      };

      await xseriesDbWrite(`mediaItems/${safeKey(id)}`, publishedMedia);
      await xseriesDbWrite(`candidates/${safeKey(id)}`, {
        ...publishedMedia,
        processing_status: "published",
      });

      for (const cat of categories) {
        await xseriesDbWrite(`mediaItemsByCategory/${safeKey(cat)}/${safeKey(id)}`, true);
      }

      return reply({ ok: true, item: publishedMedia });
    }

    return reply({ ok: false, error: `Xseries endpoint not found: ${pathname}` }, 404);
  } catch (e) {
    console.error("[Xseries Controller Error]", e);
    return reply(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Xseries internal server error",
      },
      500,
    );
  }
}
