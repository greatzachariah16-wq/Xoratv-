import "./lib/error-capture";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleAdminRoute } from "./server/admin-auth";
import { handleXseriesRoute } from "./server/xseries-controller";
import { handleRewardsRoute } from "./server/rewards-controller";
import { loadCredentialsFromRtdb } from "./server/vtushare-service";
import { handleCampaignsRoute } from "./server/campaigns-controller";
import { startXseriesDiscoveryScheduler } from "./server/xseries-discovery-runner";
import { handleStreamProxyRoute } from "./server/stream-proxy";
import { runFullAutomatedDiscovery, startDiscoveryScheduler } from "./server/discovery-runner";
import { runXTvSeriesDiscovery, startXTvSeriesScheduler } from "./server/xtv-series-runner";
import { getFaoTvStreamUrl } from "./integrations/providers/faotv";
import { executeYouTubeApiSearch } from "./integrations/providers/youtube";
import { executeVimeoApiSearch } from "./integrations/providers/vimeo";
import { xseriesDbRead } from "./server/xseries-service-account";
import type { XserisMediaItem } from "./lib/xseris/types";
import type { XTvSeriesItem } from "./integrations/firebase/rtdb";

// Warm up VTUshare credentials from RTDB on startup
void loadCredentialsFromRtdb().catch(() => {});

// Initialize discovery background scheduler on server startup
try {
  startDiscoveryScheduler();
} catch (e) {
  console.warn("[Server] Could not initialize discovery scheduler:", e);
}

// Initialize continuous Xseries metadata discovery queue
try {
  startXseriesDiscoveryScheduler();
} catch (e) {
  console.warn("[Server] Could not initialize Xseries discovery scheduler:", e);
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

const MEDIA_ROOT = process.env.MEDIA_ROOT || "./media";
const PUBLIC_MEDIA_BASE_URL = process.env.PUBLIC_MEDIA_BASE_URL || "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range, X-Requested-With",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

const DEFAULT_FIREBASE_DATABASE_URL = "https://xora-tv-default-rtdb.firebaseio.com";

function getServerDbUrl(): string | null {
  const raw =
    process.env.VITE_FIREBASE_DATABASE_URL ||
    process.env.FIREBASE_DATABASE_URL ||
    DEFAULT_FIREBASE_DATABASE_URL;
  if (!raw) return null;
  const cleaned = raw
    .replace(/[",;\x27]/g, "")
    .trim()
    .replace(/\/+$/, "");
  return cleaned || null;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mkv":
      return "video/x-matroska";
    case ".mov":
      return "video/quicktime";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

async function handleMediaStreaming(request: Request, url: URL): Promise<Response | null> {
  const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  // Prevent directory traversal attacks
  const safeRelativePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullFilePath = path.resolve(MEDIA_ROOT, safeRelativePath);

  // Check if file exists within MEDIA_ROOT
  if (!fs.existsSync(fullFilePath)) {
    return null;
  }

  try {
    const stat = await fs.promises.stat(fullFilePath);
    if (!stat.isFile()) return null;

    const mimeType = getMimeType(fullFilePath);
    const rangeHeader = request.headers.get("range");

    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

      if (isNaN(start) || start >= stat.size || end >= stat.size || start > end) {
        return new Response(null, {
          status: 416,
          headers: {
            ...CORS_HEADERS,
            "Content-Range": `bytes */${stat.size}`,
          },
        });
      }

      const chunkSize = end - start + 1;
      const nodeStream = fs.createReadStream(fullFilePath, { start, end });
      const webStream = Readable.toWeb(nodeStream);

      return new Response(webStream as unknown as BodyInit, {
        status: 206,
        headers: {
          ...CORS_HEADERS,
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    const nodeStream = fs.createReadStream(fullFilePath);
    const webStream = Readable.toWeb(nodeStream);

    return new Response(webStream as unknown as BodyInit, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Accept-Ranges": "bytes",
        "Content-Length": String(stat.size),
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("[MediaStream] Error streaming file:", err);
    return null;
  }
}

async function handleUpload(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const bucket = (formData.get("bucket") as string) || "videos";
    const customKey = (formData.get("key") as string) || "";
    const userId = (formData.get("userId") as string) || "creator";

    if (!file || typeof file === "string") {
      return new Response(JSON.stringify({ error: "Missing file in multipart upload" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const fileBuffer = Buffer.from(await (file as File).arrayBuffer());
    const originalName = (file as File).name || "upload.bin";
    const ext = path.extname(originalName) || ".bin";

    let relativePath = "";
    if (customKey && !customKey.includes("..")) {
      relativePath = customKey.replace(/^\/+/, "");
    } else {
      const fileId = crypto.randomUUID();
      relativePath = `${bucket}/${userId}/${fileId}${ext}`;
    }

    const targetFilePath = path.resolve(MEDIA_ROOT, relativePath);
    await fs.promises.mkdir(path.dirname(targetFilePath), { recursive: true });
    await fs.promises.writeFile(targetFilePath, fileBuffer);

    const baseUrl = PUBLIC_MEDIA_BASE_URL.replace(/\/+$/, "");
    const publicUrl = baseUrl ? `${baseUrl}/${relativePath}` : `/${relativePath}`;

    return new Response(
      JSON.stringify({
        ok: true,
        path: relativePath,
        url: publicUrl,
        size: fileBuffer.length,
        bucket,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (uploadErr: unknown) {
    const message = uploadErr instanceof Error ? uploadErr.message : "Internal upload error";
    console.error("[Upload] Error processing upload:", uploadErr);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}

async function handleStaticRootFile(request: Request, url: URL): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const pathname = url.pathname;

  if (
    pathname === "/exoclick.txt" ||
    pathname === "/89cfa11e5cd3529d8d2fee19321fc484.html" ||
    pathname === "/89cfa11e5cd3529d8d2fee19321fc484.txt" ||
    pathname === "/89cfa11e5cd3529d8d2fee19321fc484"
  ) {
    return new Response("89cfa11e5cd3529d8d2fee19321fc484", {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/plain",
        "Content-Length": "32",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (
    pathname === "/4b48232c4ffdb43fa729a37bf8008b73b97009f5.txt" ||
    pathname === "/4b48232c4ffdb43fa729a37bf8008b73b97009f5" ||
    pathname === "/4b48232c4ffdb43fa729a37bf8008b73b97009f5.html" ||
    pathname === "/4b48232c4ffdb43fa729.txt" ||
    pathname === "/4b48232c4ffdb43fa729" ||
    pathname === "/4b48232c4ffdb43fa729.html"
  ) {
    return new Response("4b48232c4ffdb43fa729a37bf8008b73b97009f5", {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/plain",
        "Content-Length": "40",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Only handle root-level files like /sw.js, /robots.txt, /manifest.webmanifest, etc.
  if (pathname.startsWith("/api/") || pathname.startsWith("/videos/")) return null;

  const fileName = pathname.replace(/^\/+/, "");
  if (!fileName || fileName.includes("/")) return null;

  // Priority candidate directories
  const candidateDirs = [
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd(), "dist/client"),
    path.resolve(process.cwd(), ".output/public"),
    path.resolve("./public"),
  ];

  for (const dir of candidateDirs) {
    const filePath = path.join(dir, fileName);
    if (fs.existsSync(filePath)) {
      try {
        const stat = await fs.promises.stat(filePath);
        if (stat.isFile()) {
          const ext = path.extname(fileName).toLowerCase();
          let contentType = "text/plain; charset=utf-8";
          if (ext === ".js") contentType = "application/javascript; charset=utf-8";
          else if (ext === ".webmanifest" || ext === ".json")
            contentType = "application/manifest+json; charset=utf-8";
          else if (ext === ".png") contentType = "image/png";
          else if (ext === ".ico") contentType = "image/x-icon";
          else if (ext === ".txt") contentType = "text/plain; charset=utf-8";
          else if (ext === ".html") contentType = "text/html; charset=utf-8";

          const content = await fs.promises.readFile(filePath);
          return new Response(content, {
            status: 200,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": contentType,
              "Content-Length": String(stat.size),
              "Cache-Control":
                fileName.endsWith(".txt") || fileName === "sw.js"
                  ? "no-cache, no-store, must-revalidate"
                  : "public, max-age=86400",
              ...(fileName === "sw.js" ? { "Service-Worker-Allowed": "/" } : {}),
            },
          });
        }
      } catch {
        // Continue checking
      }
    }
  }

  return null;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Direct Root Static Files (sw.js, robots.txt, manifest, etc.)
    const staticRootRes = await handleStaticRootFile(request, url);
    if (staticRootRes) {
      return staticRootRes;
    }

    // Health check endpoint for Render
    if (url.pathname === "/health" || url.pathname === "/api/health") {
      return new Response(
        JSON.stringify({ ok: true, status: "healthy", service: "xoratv-render" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Dynamic Stream Proxy & Embedded Player Service (with temporary chunk caching & 30-min TTL)
    if (url.pathname.startsWith("/api/stream") || url.pathname.startsWith("/api/proxy")) {
      const streamRes = await handleStreamProxyRoute(request, url);
      if (streamRes) return streamRes;
    }

    // Xseries & Legacy Xseris Controller & Viewer Catalog Endpoints
    if (
      url.pathname.startsWith("/api/xseries") ||
      url.pathname.startsWith("/api/xseris") ||
      url.pathname.startsWith("/api/catalog")
    ) {
      const xseriesRes = await handleXseriesRoute(request, url);
      if (xseriesRes) return xseriesRes;
    }

    // Automated VTUshare MTN Data Rewards & Engagement Endpoints (User & Admin)
    if (
      url.pathname.startsWith("/api/rewards") ||
      url.pathname.startsWith("/api/admin/rewards") ||
      url.pathname.startsWith("/api/engagement") ||
      url.pathname.startsWith("/api/admin/engagement") ||
      url.pathname.startsWith("/api/admin/fraud")
    ) {
      const rewardsRes = await handleRewardsRoute(request, url);
      if (rewardsRes) return rewardsRes;
    }

    // In-House Ads & Promotional Campaigns (User & Admin)
    if (
      url.pathname.startsWith("/api/campaigns") ||
      url.pathname.startsWith("/api/admin/campaigns")
    ) {
      const campaignsRes = await handleCampaignsRoute(request, url);
      if (campaignsRes) return campaignsRes;
    }

    // Sovereign Admin Authentication and Management Endpoints
    if (url.pathname.startsWith("/api/admin")) {
      const adminRes = await handleAdminRoute(request, url);
      if (adminRes) {
        return adminRes;
      }
    }

    // Chat 7-day auto-delete purge endpoint
    if (url.pathname === "/api/chat/purge") {
      try {
        const dbUrl = getServerDbUrl();
        if (!dbUrl) {
          return new Response(
            JSON.stringify({ ok: false, message: "Firebase database URL not configured" }),
            { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
          );
        }

        const messagesRes = await fetch(`${dbUrl}/chatMessages.json`);
        if (!messagesRes.ok) {
          return new Response(JSON.stringify({ ok: false, status: messagesRes.status }), {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        const roomsMap = (await messagesRes.json()) as Record<
          string,
          Record<string, { expiresAt?: string; created_at?: string }>
        > | null;
        let purgedCount = 0;
        const now = Date.now();
        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

        if (roomsMap) {
          for (const [roomId, messages] of Object.entries(roomsMap)) {
            if (!messages) continue;
            for (const [msgId, msg] of Object.entries(messages)) {
              if (!msg) continue;
              const exp = msg.expiresAt ? new Date(msg.expiresAt).getTime() : 0;
              const created = msg.created_at ? new Date(msg.created_at).getTime() : 0;
              if ((exp > 0 && exp <= now) || (created > 0 && now - created >= SEVEN_DAYS)) {
                purgedCount++;
                void fetch(`${dbUrl.replace(/\/+$/, "")}/chatMessages/${roomId}/${msgId}.json`, {
                  method: "DELETE",
                }).catch(() => {});
              }
            }
          }
        }

        return new Response(
          JSON.stringify({ ok: true, purgedCount, timestamp: new Date().toISOString() }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Purge error";
        return new Response(JSON.stringify({ ok: false, error: message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    // Cloudinary signature endpoint for signed client uploads
    if (
      url.pathname === "/api/cloudinary/sign" &&
      (request.method === "GET" || request.method === "POST")
    ) {
      try {
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;
        const cloudName =
          process.env.VITE_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;

        if (!apiKey || !apiSecret || !cloudName) {
          return new Response(
            JSON.stringify({
              ok: false,
              error:
                "Cloudinary server credentials (CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET / VITE_CLOUDINARY_CLOUD_NAME) not configured.",
            }),
            { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
          );
        }

        const folder = url.searchParams.get("folder") || "xora/videos";
        const timestamp = Math.round(Date.now() / 1000);

        const params: Record<string, string | number> = { folder, timestamp };
        const sortedKeys = Object.keys(params).sort();
        const toSign = sortedKeys.map((k) => `${k}=${params[k]}`).join("&") + apiSecret;

        const crypto = await import("crypto");
        const signature = crypto.createHash("sha1").update(toSign).digest("hex");

        return new Response(
          JSON.stringify({
            ok: true,
            cloudName,
            apiKey,
            timestamp,
            folder,
            signature,
          }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Cloudinary signature error";
        return new Response(JSON.stringify({ ok: false, error: msg }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    // YouTube Data API v3 Proxy endpoint (secure server-side discovery)
    if (url.pathname === "/api/youtube/search" && request.method === "GET") {
      try {
        const query = url.searchParams.get("q") || url.searchParams.get("query") || "";
        const limit = parseInt(url.searchParams.get("limit") || "12", 10);
        const feed = url.searchParams.get("feed") as "home" | "shorts" | "learn" | undefined;

        if (!query.trim()) {
          return new Response(JSON.stringify({ ok: true, count: 0, candidates: [] }), {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        const referer =
          request.headers.get("referer") || request.headers.get("origin") || undefined;

        const result = await executeYouTubeApiSearch(
          {
            query,
            limit,
            feed,
          },
          { referer },
        );

        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "YouTube search error";
        return new Response(JSON.stringify({ ok: false, count: 0, candidates: [], error: msg }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    // Vimeo API Proxy endpoint (secure server-side multi-token discovery)
    if (url.pathname === "/api/vimeo/search" && request.method === "GET") {
      try {
        const query = url.searchParams.get("q") || url.searchParams.get("query") || "";
        const limit = parseInt(url.searchParams.get("limit") || "10", 10);
        const feed = url.searchParams.get("feed") as "home" | "shorts" | "learn" | undefined;

        if (!query.trim()) {
          return new Response(JSON.stringify({ ok: true, count: 0, candidates: [] }), {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        const result = await executeVimeoApiSearch({
          query,
          limit,
          feed,
        });

        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Vimeo search error";
        return new Response(JSON.stringify({ ok: false, count: 0, candidates: [], error: msg }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    // XTv Series Content Engine endpoints (Exclusively serves media published from admin)
    if (url.pathname === "/api/xtv-series/items" && request.method === "GET") {
      try {
        // Fetch all approved media items published from the Xseris Admin
        const xseriesMedia = (await xseriesDbRead("mediaItems").catch(() => null)) as Record<
          string,
          XserisMediaItem
        > | null;

        const tones: Array<"clay" | "sage" | "ink" | "sand"> = ["clay", "sage", "ink", "sand"];
        const convertedXseries: XTvSeriesItem[] = Object.values(xseriesMedia || {})
          .filter(
            (it) => it && (it.status === "approved" || it.status === "published" || !it.status),
          )
          .map((it, idx) => {
            const primaryCat = (it.categories && it.categories[0]) || "Movies";
            return {
              id: it.id,
              title: it.title,
              description: it.description || "Curated X Series production.",
              genre: primaryCat,
              year: it.release_year || 2026,
              seasons: 1,
              episodesCount: 1,
              tag: primaryCat.toUpperCase(),
              tone: tones[idx % tones.length],
              videoUrl: it.playback?.url || `/api/stream/embed/${encodeURIComponent(it.id)}`,
              thumbnailUrl: it.thumbnail_url || "",
              provider: "xseries",
              durationSeconds: it.duration || 5400,
              createdAt: it.created_at || new Date().toISOString(),
              categories: it.categories || [primaryCat],
            };
          });

        const genre = url.searchParams.get("genre");
        let filtered = convertedXseries;
        if (genre && genre !== "All") {
          const g = genre.toLowerCase();
          filtered = filtered.filter(
            (it) =>
              it.genre?.toLowerCase() === g ||
              it.tag?.toLowerCase() === g ||
              (it.categories &&
                it.categories.some((c) => c.toLowerCase() === g || c.toLowerCase().includes(g))),
          );
        }
        filtered.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        return new Response(JSON.stringify({ ok: true, count: filtered.length, items: filtered }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "XTv Series items error";
        return new Response(JSON.stringify({ ok: false, count: 0, items: [], error: msg }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    if (
      url.pathname === "/api/xtv-series/run" &&
      (request.method === "POST" || request.method === "GET")
    ) {
      try {
        const result = await runXTvSeriesDiscovery();
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "XTv Series run error";
        return new Response(JSON.stringify({ ok: false, error: msg }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    // XTv playback endpoint. Resolves either FAO TV channels or X Series media streams
    if (
      (url.pathname === "/api/xtv-series/stream" ||
        url.pathname.startsWith("/api/xtv-series/stream/")) &&
      request.method === "GET"
    ) {
      try {
        const pathParam = url.pathname.startsWith("/api/xtv-series/stream/")
          ? decodeURIComponent(url.pathname.replace("/api/xtv-series/stream/", "").trim())
          : "";
        const rawId =
          pathParam || url.searchParams.get("channelId") || url.searchParams.get("id") || "";
        if (!rawId) {
          return new Response(JSON.stringify({ ok: false, error: "Missing channelId or id" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        // Check if this item is a known X Series media item
        let mediaItem = (await xseriesDbRead(`mediaItems/${rawId}`).catch(
          () => null,
        )) as XserisMediaItem | null;
        if (!mediaItem) {
          const allMedia = (await xseriesDbRead("mediaItems").catch(() => null)) as Record<
            string,
            XserisMediaItem
          > | null;
          if (allMedia) {
            mediaItem =
              Object.values(allMedia).find(
                (it) => it && (it.id === rawId || it.id?.toLowerCase() === rawId.toLowerCase()),
              ) || null;
          }
        }

        if (mediaItem) {
          const streamUrl =
            mediaItem.playback?.url || `/api/stream/embed/${encodeURIComponent(mediaItem.id)}`;
          const primaryCat = (mediaItem.categories && mediaItem.categories[0]) || "Movies";
          const tones: Array<"clay" | "sage" | "ink" | "sand"> = ["clay", "sage", "ink", "sand"];
          return new Response(
            JSON.stringify({
              ok: true,
              provider: mediaItem.source_provider || "xseries",
              channelId: rawId,
              streamUrl,
              item: {
                id: mediaItem.id,
                title: mediaItem.title,
                description: mediaItem.description || "",
                genre: primaryCat,
                seasons: 1,
                tag: (mediaItem.categories && mediaItem.categories[1]) || "Feature Cinema",
                tone: tones[0],
                videoUrl: streamUrl,
                thumbnailUrl: mediaItem.thumbnail_url || "",
                provider: "xseries",
                durationSeconds: mediaItem.duration || 5400,
                createdAt: mediaItem.created_at || new Date().toISOString(),
                categories: mediaItem.categories || [primaryCat],
              },
            }),
            {
              status: 200,
              headers: {
                ...CORS_HEADERS,
                "Content-Type": "application/json",
                "Cache-Control": "private, max-age=60",
              },
            },
          );
        }

        const channelId = rawId.replace(/^fao_/, "");
        const streamUrl = await getFaoTvStreamUrl(channelId);
        if (!streamUrl) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "XTv could not resolve a playable stream for this channel.",
              provider: "faotv",
              channelId,
            }),
            { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ ok: true, provider: "faotv", channelId, streamUrl }), {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=60",
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "XTv stream resolution error";
        return new Response(JSON.stringify({ ok: false, error: msg, provider: "faotv" }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    // Backwards-compatible alias for existing clients.
    if (url.pathname === "/api/faotv/stream" && request.method === "GET") {
      const channelId = url.searchParams.get("channelId") || "";
      if (!channelId) {
        return new Response(JSON.stringify({ ok: false, error: "Missing channelId" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      const streamUrl = await getFaoTvStreamUrl(channelId);
      return new Response(JSON.stringify({ ok: !!streamUrl, streamUrl }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Automated Discovery Job (Cron / Webhook / On-Demand endpoint)
    if (
      url.pathname === "/api/discovery/run" &&
      (request.method === "POST" || request.method === "GET")
    ) {
      try {
        const secret = process.env.DISCOVERY_SECRET;
        const authHeader =
          request.headers.get("x-discovery-secret") ||
          request.headers.get("authorization") ||
          url.searchParams.get("secret");

        if (secret && secret.trim() !== "") {
          const cleanAuth = authHeader?.replace(/^Bearer\s+/i, "").trim();
          if (cleanAuth !== secret.trim()) {
            return new Response(
              JSON.stringify({ ok: false, error: "Unauthorized: Invalid discovery secret" }),
              {
                status: 401,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
              },
            );
          }
        }

        const summary = await runFullAutomatedDiscovery();
        return new Response(
          JSON.stringify({ ok: true, summary, timestamp: new Date().toISOString() }),
          {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          },
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Discovery execution error";
        console.error("[Discovery Endpoint] Error:", err);
        return new Response(JSON.stringify({ ok: false, error: msg }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    // Render file upload API
    if (url.pathname === "/api/upload" && request.method === "POST") {
      return await handleUpload(request);
    }

    // Render video, poster, and avatar streaming
    if (
      url.pathname.startsWith("/videos/") ||
      url.pathname.startsWith("/posters/") ||
      url.pathname.startsWith("/avatars/")
    ) {
      const streamResponse = await handleMediaStreaming(request, url);
      if (streamResponse) {
        return streamResponse;
      }
    }

    // Fall back to TanStack Start SSR handler
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error("[SSR] Error handling request:", error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
