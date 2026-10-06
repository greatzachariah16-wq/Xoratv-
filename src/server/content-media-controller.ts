import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

// ffmpeg-static is CommonJS and expects __dirname. Keep it external to Nitro's ESM bundle.
const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string | null;
import { registerCloudinaryVideo } from "./content-repository";

const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

function cloudinaryConfig() {
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || "").trim();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary server credentials are not configured.");
  }
  return { cloudName, apiKey, apiSecret };
}

export async function deleteCloudinaryVideo(publicId: string): Promise<void> {
  const cleanPublicId = String(publicId || "").trim();
  if (!cleanPublicId) return;
  const { cloudName, apiSecret } = cloudinaryConfig();
  const timestamp = Math.round(Date.now() / 1000);
  const signature = crypto.createHash("sha1")
    .update(`invalidate=true&public_id=${cleanPublicId}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");

  const form = new URLSearchParams();
  form.set("public_id", cleanPublicId);
  form.set("timestamp", String(timestamp));
  form.set("invalidate", "true");
  form.set("api_key", cloudinaryConfig().apiKey);
  form.set("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/destroy`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || (body?.result && !["ok", "not found"].includes(String(body.result)))) {
    throw new Error(body?.error?.message || `Cloudinary video deletion failed (${response.status}).`);
  }
}

async function runFfmpeg(input: string, output: string) {
  if (!ffmpegPath) throw new Error("FFmpeg binary is unavailable on this server.");
  await new Promise<void>((resolve, reject) => {
    const args = [
      "-y", "-i", input,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      "-pix_fmt", "yuv420p",
      output,
    ];
    const child = spawn(ffmpegPath as string, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg compression failed (${code}): ${stderr.slice(-1200)}`));
    });
  });
}

async function uploadToCloudinary(filePath: string, folder: string) {
  const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
  const timestamp = Math.round(Date.now() / 1000);
  const signature = crypto.createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");

  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "video/mp4" }), path.basename(filePath));
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.secure_url || !body?.public_id) {
    throw new Error(body?.error?.message || `Cloudinary upload failed (${response.status}).`);
  }
  return body;
}

function cloudinary240pUrl(secureUrl: string): string {
  const marker = "/video/upload/";
  const markerIndex = secureUrl.indexOf(marker);
  if (markerIndex === -1) return secureUrl;
  const base = secureUrl.slice(0, markerIndex + marker.length);
  const rest = secureUrl.slice(markerIndex + marker.length).split("/").filter(Boolean);
  if (!rest.length) return secureUrl;

  while (rest.length > 0) {
    const first = rest[0];
    const isVersion = /^v\d+$/.test(first);
    const isTransformation =
      !isVersion &&
      (first.includes(",") || first.startsWith("h_") || first.startsWith("w_") ||
        first.startsWith("c_") || first.startsWith("q_") || first.startsWith("f_") ||
        first.startsWith("sp_") || first.startsWith("br_") || first.startsWith("vc_") ||
        first.startsWith("fl_") || first.startsWith("d_"));
    if (!isTransformation) break;
    rest.shift();
  }

  const last = rest.length - 1;
  if (last < 0) return secureUrl;
  rest[last] = rest[last].replace(/\.[a-zA-Z0-9]+$/, "") + ".mp4";
  return base + "h_240,c_scale,q_auto:low,f_mp4/" + rest.join("/");
}
export async function handleContentVideoUpload(request: Request): Promise<Response> {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return new Response(JSON.stringify({ ok: false, error: "Video file is required." }), { status: 400 });
  if (!file.type.startsWith("video/")) return new Response(JSON.stringify({ ok: false, error: "Only video uploads are accepted." }), { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return new Response(JSON.stringify({ ok: false, error: "Video is larger than the 250MB upload limit." }), { status: 413 });

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xora-video-"));
  const inputPath = path.join(tempDir, "input");
  const outputPath = path.join(tempDir, "compressed.mp4");

  try {
    await fs.writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
    // Preserve the creator's uploaded video instead of re-encoding it with a lossy CRF 24 pass.
    // Cloudinary remains the storage/CDN layer and can generate optimized delivery renditions.
    const compressedBytes = file.size;
    const cloudinary = await uploadToCloudinary(inputPath, "xora/courses/videos");
    const id = `video_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;

    await registerCloudinaryVideo({
      id,
      creatorId: typeof form.get("creatorId") === "string" ? String(form.get("creatorId")) : null,
      title: typeof form.get("title") === "string" ? String(form.get("title")) : "",
      description: typeof form.get("description") === "string" ? String(form.get("description")) : "",
      cloudinaryPublicId: String(cloudinary.public_id),
      cloudinaryUrl: String(cloudinary.secure_url),
      durationSeconds: typeof cloudinary.duration === "number" ? Math.round(cloudinary.duration) : null,
      originalBytes: file.size,
      compressedBytes,
      contentType: "video",
      metadata: { sourceMimeType: file.type, compression: "source-preserved", cloudinaryFormat: cloudinary.format || "mp4" },
    });

    return new Response(JSON.stringify({
      ok: true,
      url: cloudinary.secure_url,
      playbackUrl: cloudinary.secure_url,
      deliveryUrl240p: cloudinary240pUrl(String(cloudinary.secure_url)),
      publicId: cloudinary.public_id,
      duration: typeof cloudinary.duration === "number" ? Math.round(cloudinary.duration) : undefined,
      bytes: file.size,
      compressedBytes,
      format: cloudinary.format,
      width: cloudinary.width,
      height: cloudinary.height,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Video processing failed." }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
