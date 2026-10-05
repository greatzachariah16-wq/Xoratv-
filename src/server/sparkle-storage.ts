import crypto from "node:crypto";

const DEFAULT_SPARKLE_SUPABASE_URL = "https://blwxtzhvxebcethathkt.supabase.co";
const BUCKET = "videos";
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

function getConfig() {
  const url = (process.env.SPARKLE_SUPABASE_URL || DEFAULT_SPARKLE_SUPABASE_URL).replace(/\/+$/, "");
  const key = (process.env.SPARKLE_SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!key) throw new Error("SPARKLE_SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return { url, key };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    },
  });
}

function safeExtension(name: string, mime: string) {
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
  if (ext && /^[a-z0-9]{1,8}$/.test(ext)) return ext;
  if (mime === "video/webm") return "webm";
  return "mp4";
}

/**
 * Stores creator videos in the Xora Sparkle Hub Supabase Storage project.
 * Render only receives the upload request and forwards the bytes; it does not
 * persist the video on its local disk.
 */
export async function handleSparkleStorageRoute(request: Request, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/storage/sparkle/")) return null;

  try {
    const { url: supabaseUrl, key } = getConfig();

    if (url.pathname === "/api/storage/sparkle/upload" && request.method === "POST") {
      const form = await request.formData();
      const file = form.get("file");
      const userId = String(form.get("userId") || "creator").replace(/[^a-zA-Z0-9_-]/g, "_");

      if (!(file instanceof File)) return json({ ok: false, error: "Video file is required." }, 400);
      if (!file.type.startsWith("video/")) return json({ ok: false, error: "Only video uploads are accepted." }, 400);
      if (file.size > MAX_UPLOAD_BYTES) return json({ ok: false, error: "Video is larger than the 250MB upload limit." }, 413);

      const ext = safeExtension(file.name || "video.mp4", file.type);
      const objectPath = `creators/${userId}/${crypto.randomUUID()}.${ext}`;
      const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${objectPath}`;

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": file.type || "video/mp4",
          "Cache-Control": "31536000",
          "x-upsert": "false",
        },
        body: await file.arrayBuffer(),
        signal: AbortSignal.timeout(180000),
      });

      const uploadBody = await uploadResponse.json().catch(() => null);
      if (!uploadResponse.ok) {
        console.error("[SparkleStorage] Upload failed:", uploadResponse.status, uploadBody);
        return json({ ok: false, error: uploadBody?.message || uploadBody?.error || `Storage upload failed (${uploadResponse.status}).` }, 502);
      }

      const streamUrl = `/api/storage/sparkle/stream?path=${encodeURIComponent(objectPath)}`;
      return json({
        ok: true,
        bucket: BUCKET,
        path: objectPath,
        streamUrl,
        size: file.size,
        contentType: file.type || "video/mp4",
      });
    }

    if (url.pathname === "/api/storage/sparkle/stream" && request.method === "GET") {
      const objectPath = url.searchParams.get("path")?.trim();
      if (!objectPath || objectPath.includes("..") || objectPath.startsWith("/")) {
        return json({ ok: false, error: "Invalid storage path." }, 400);
      }

      const signUrl = `${supabaseUrl}/storage/v1/object/sign/${BUCKET}/${objectPath}`;
      const signResponse = await fetch(signUrl, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
        signal: AbortSignal.timeout(15000),
      });

      const signBody = await signResponse.json().catch(() => null);
      if (!signResponse.ok || !signBody?.signedURL) {
        console.error("[SparkleStorage] Signing failed:", signResponse.status, signBody);
        return json({ ok: false, error: signBody?.message || signBody?.error || `Could not sign video (${signResponse.status}).` }, 502);
      }

      const signedUrl = String(signBody.signedURL).startsWith("http")
        ? String(signBody.signedURL)
        : `${supabaseUrl}${signBody.signedURL}`;

      return new Response(null, {
        status: 302,
        headers: {
          Location: signedUrl,
          "Cache-Control": "private, max-age=300",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    return null;
  } catch (error) {
    console.error("[SparkleStorage] Route error:", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Sparkle storage error." }, 500);
  }
}
