import crypto from "node:crypto";
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

async function uploadToCloudinary(file: File, folder: string) {
  const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
  const timestamp = Math.round(Date.now() / 1000);
  const signature = crypto.createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");

  const form = new FormData();
  form.append("file", file, file.name || "xora-video");
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

  try {
    // Cloudinary is the permanent video store. Do not write creator uploads to a
    // temporary server file or re-encode them before storage.
    const compressedBytes = file.size;
    const cloudinary = await uploadToCloudinary(file, "xora/courses/videos");
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
  }

}
