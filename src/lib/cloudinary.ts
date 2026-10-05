/**
 * Cloudinary client upload and 240p delivery transformation helpers.
 *
 * Implements Option 1 (Cloudinary on upload):
 * - Direct unsigned upload to Cloudinary (POST https://api.cloudinary.com/v1_1/<cloud_name>/video/upload)
 * - Automatic URL transformation to ~240p delivery (h_240,c_scale,q_auto:low,f_mp4)
 * - Retains public_id in metadata for rebuilding delivery URLs.
 */

export interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
  folder: string;
  isConfigured: boolean;
}

export interface CloudinaryUploadOptions {
  resourceType?: "video" | "image" | "auto";
  folder?: string;
  onProgress?: (percent: number) => void;
  creatorId?: string;
  title?: string;
  description?: string;
}

export interface CloudinaryUploadResult {
  url: string;
  deliveryUrl240p: string;
  playbackUrl: string;
  publicId: string;
  duration?: number;
  bytes?: number;
  format?: string;
  width?: number;
  height?: number;
}

/**
 * Reads Cloudinary configuration from Vite client or universal runtime environment.
 */
export function getCloudinaryConfig(): CloudinaryConfig {
  let cloudName = "";
  let uploadPreset = "";
  let folder = "xora/videos";

  if (typeof import.meta !== "undefined" && import.meta.env) {
    cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "";
    uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "";
    folder = import.meta.env.VITE_CLOUDINARY_FOLDER || folder;
  }

  // Fallback for SSR / Node environment
  if (typeof process !== "undefined" && process.env) {
    if (!cloudName) {
      cloudName = process.env.VITE_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || "";
    }
    if (!uploadPreset) {
      uploadPreset =
        process.env.VITE_CLOUDINARY_UPLOAD_PRESET || process.env.CLOUDINARY_UPLOAD_PRESET || "";
    }
    if (folder === "xora/videos") {
      folder = process.env.VITE_CLOUDINARY_FOLDER || process.env.CLOUDINARY_FOLDER || "xora/videos";
    }
  }

  cloudName = cloudName.trim();
  uploadPreset = uploadPreset.trim();
  folder = folder.trim();

  return {
    cloudName,
    uploadPreset,
    folder,
    isConfigured: Boolean(cloudName),
  };
}

/**
 * Returns true if Cloudinary client upload is configured.
 */
export function isCloudinaryConfigured(): boolean {
  return getCloudinaryConfig().isConfigured;
}

/**
 * Converts a raw Cloudinary video URL or public_id into a constrained ~240p delivery URL.
 * Transformation: h_240,c_scale,q_auto:low,f_mp4
 */
export function getAdaptiveStreamingUrl(rawUrl: string, publicId?: string, maxResolution = 360): string {
  const maxres = maxResolution >= 720 ? "720p" : maxResolution >= 540 ? "540p" : "360p";
  const transform = `sp_auto:maxres_${maxres}`;

  if (!rawUrl && publicId) {
    const { cloudName } = getCloudinaryConfig();
    if (!cloudName) return "";
    const dot = publicId.lastIndexOf(".");
    const cleanId = dot > publicId.lastIndexOf("/") ? publicId.slice(0, dot) : publicId;
    return `https://res.cloudinary.com/${cloudName}/video/upload/${transform}/${cleanId}.m3u8`;
  }

  if (!rawUrl) return "";

  const marker = "/video/upload/";
  const markerIndex = rawUrl.indexOf(marker);
  if (markerIndex === -1 || !rawUrl.includes("res.cloudinary.com")) return rawUrl;

  const base = rawUrl.slice(0, markerIndex + marker.length);
  const parts = rawUrl.slice(markerIndex + marker.length).split("/").filter(Boolean);
  if (parts.length === 0) return rawUrl;

  const first = parts[0];
  const isVersion = first.startsWith("v") && Number.isFinite(Number(first.slice(1)));
  const isTransformation =
    first.includes(",") ||
    first.startsWith("h_") ||
    first.startsWith("w_") ||
    first.startsWith("c_") ||
    first.startsWith("q_") ||
    first.startsWith("f_") ||
    first.startsWith("sp_") ||
    first.startsWith("br_") ||
    first.startsWith("vc_");

  if (isTransformation && !isVersion) parts.shift();

  const last = parts.length - 1;
  const extensionIndex = parts[last].lastIndexOf(".");
  if (extensionIndex > parts[last].lastIndexOf("/")) {
    parts[last] = parts[last].slice(0, extensionIndex);
  }

  return `${base}${transform}/${parts.join("/")}.m3u8`;
}

export function getOriginalVideoUrl(rawUrl: string): string {
  if (!rawUrl) return "";

  const match = rawUrl.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/);
  if (!match) return rawUrl;

  const base = match[1];
  const parts = match[2].split("/").filter(Boolean);

  while (parts.length > 0) {
    const first = parts[0];
    const isVersion = /^v\d+$/.test(first);
    const looksLikeTransformation =
      !isVersion &&
      (first.includes(",") ||
        first.startsWith("h_") ||
        first.startsWith("w_") ||
        first.startsWith("c_") ||
        first.startsWith("q_") ||
        first.startsWith("f_") ||
        first.startsWith("sp_") ||
        first.startsWith("br_") ||
        first.startsWith("vc_") ||
        first.startsWith("fl_") ||
        first.startsWith("d_"));
    if (!looksLikeTransformation) break;
    parts.shift();
  }

  if (!parts.length) return rawUrl;

  const last = parts.length - 1;
  parts[last] = parts[last].replace(/\.[a-zA-Z0-9]+$/, "") + ".mp4";
  return base + parts.join("/");
}

export function get240pDeliveryUrl(rawUrl: string, publicId?: string): string {
  const transform = "h_240,c_scale,q_auto:low,f_mp4";

  if (!rawUrl && publicId) {
    const { cloudName } = getCloudinaryConfig();
    if (cloudName) {
      const cleanId = publicId.replace(/\.[a-zA-Z0-9]+$/, "");
      return `https://res.cloudinary.com/${cloudName}/video/upload/${transform}/${cleanId}.mp4`;
    }
    return "";
  }

  if (!rawUrl) return "";

  const match = rawUrl.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/);
  if (match) {
    const base = match[1];
    const parts = match[2].split("/").filter(Boolean);

    // Remove every Cloudinary transformation component already present.
    // This prevents URLs such as h_240,.../h_240,.../video.mp4 after a
    // creator upload is resolved more than once by the feed/player.
    while (parts.length > 0) {
      const first = parts[0];
      const isVersion = /^v\\d+$/.test(first);
      const looksLikeTransformation =
        !isVersion &&
        (first.includes(",") ||
          first.startsWith("h_") ||
          first.startsWith("w_") ||
          first.startsWith("c_") ||
          first.startsWith("q_") ||
          first.startsWith("f_") ||
          first.startsWith("sp_") ||
          first.startsWith("br_") ||
          first.startsWith("vc_") ||
          first.startsWith("fl_") ||
          first.startsWith("d_"));
      if (!looksLikeTransformation) break;
      parts.shift();
    }

    const last = parts.length - 1;
    if (last < 0) return rawUrl;

    // Keep Cloudinary version/public ID, but always deliver an MP4 rendition.
    parts[last] = parts[last].replace(/\.[a-zA-Z0-9]+$/, "") + ".mp4";
    return `${base}${transform}/${parts.join("/")}`;
  }

  // Non-Cloudinary URLs must remain untouched.
  return rawUrl;
}
/**
 * Uploads a video or media file directly to Cloudinary.
 * Supports:
 * 1. Unsigned upload preset (if VITE_CLOUDINARY_UPLOAD_PRESET is defined)
 * 2. Signed upload via /api/cloudinary/sign (using CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)
 *
 * Endpoint: POST https://api.cloudinary.com/v1_1/<cloud_name>/<resource_type>/upload
 */
export async function uploadToCloudinary(
  file: File,
  options: CloudinaryUploadOptions = {},
): Promise<CloudinaryUploadResult> {
  const { cloudName, uploadPreset, folder: defaultFolder, isConfigured } = getCloudinaryConfig();

  if (!isConfigured) {
    return Promise.reject(
      new Error("Cloudinary is not configured. Please provide VITE_CLOUDINARY_CLOUD_NAME."),
    );
  }

  const isImage = file.type.startsWith("image/");
  const resourceType = options.resourceType || (isImage ? "image" : "video");
  const targetFolder = options.folder || (isImage ? "xora/posters" : defaultFolder);

  // Videos are processed server-side with FFmpeg before reaching Cloudinary.
  // Cloudinary remains the delivery/CDN layer; the original upload never becomes
  // the playback source and no video binary is written to Supabase or MongoDB.
  if (resourceType === "video") {
    const formData = new FormData();
    formData.append("file", file);
    if (options.creatorId) formData.append("creatorId", options.creatorId);
    if (options.title) formData.append("title", options.title);
    if (options.description) formData.append("description", options.description);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/content/video-upload", true);
      if (options.onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            options.onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 80)));
          }
        };
      }
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
            options.onProgress?.(100);
            resolve(data);
          } else reject(new Error(data.error || `Video processing failed with status ${xhr.status}`));
        } catch { reject(new Error("Invalid video processing response.")); }
      };
      xhr.onerror = () => reject(new Error("Network error processing video."));
      xhr.send(formData);
    });
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  const formData = new FormData();
  formData.append("file", file);

  if (uploadPreset) {
    formData.append("upload_preset", uploadPreset);
    if (targetFolder) {
      formData.append("folder", targetFolder);
    }
  } else {
    // Request server signature using configured CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET
    try {
      const signRes = await fetch(
        `/api/cloudinary/sign?folder=${encodeURIComponent(targetFolder)}`,
      );
      if (!signRes.ok) {
        throw new Error(`Signature request failed with status ${signRes.status}`);
      }
      const signData = await signRes.json();
      if (!signData.ok || !signData.signature || !signData.apiKey) {
        throw new Error(signData.error || "Failed to generate Cloudinary upload signature.");
      }

      formData.append("api_key", signData.apiKey);
      formData.append("timestamp", String(signData.timestamp));
      formData.append("signature", signData.signature);
      if (signData.folder) {
        formData.append("folder", signData.folder);
      }
    } catch (signErr) {
      const msg = signErr instanceof Error ? signErr.message : "Upload signature failed";
      return Promise.reject(
        new Error(
          `Unable to authorize Cloudinary upload: ${msg}. Provide VITE_CLOUDINARY_UPLOAD_PRESET or check CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.`,
        ),
      );
    }
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);

    if (options.onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.round((event.loaded / event.total) * 100);
          options.onProgress?.(Math.min(percent, 99));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          const rawUrl: string = data.secure_url || data.url || "";
          const publicId: string = data.public_id || "";
          const duration =
            typeof data.duration === "number" ? Math.round(data.duration) : undefined;
          const bytes = typeof data.bytes === "number" ? data.bytes : file.size;
          const deliveryUrl240p =
            resourceType === "video" ? get240pDeliveryUrl(rawUrl, publicId) : rawUrl;

          options.onProgress?.(100);

          resolve({
            url: rawUrl,
            deliveryUrl240p,
            playbackUrl: deliveryUrl240p,
            publicId,
            duration,
            bytes,
            format: data.format,
            width: data.width,
            height: data.height,
          });
        } catch (parseError) {
          reject(new Error("Failed to parse Cloudinary response."));
        }
      } else {
        let message = `Cloudinary upload failed with status ${xhr.status}`;
        try {
          const errorJson = JSON.parse(xhr.responseText);
          if (errorJson?.error?.message) {
            message = errorJson.error.message;
          }
        } catch {
          // ignore
        }
        reject(new Error(message));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error uploading video to Cloudinary."));
    };

    xhr.send(formData);
  });
}
