import "./lib/error-capture";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

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

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health check endpoint for Render
    if (url.pathname === "/health" || url.pathname === "/api/health") {
      return new Response(
        JSON.stringify({ ok: true, status: "healthy", service: "xoratv-render" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
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
