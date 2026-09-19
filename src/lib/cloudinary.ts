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

  // If already has transformation
  if (rawUrl.includes(transform)) {
    return rawUrl;
  }

  // Match Cloudinary video URL: https://res.cloudinary.com/<cloud>/video/upload/(v<version>/)?<path>
  const match = rawUrl.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/);
  if (match) {
    const base = match[1];
    let rest = match[2];
    // Strip redundant leading transformation if any
    rest = rest.replace(/^[^/]+,\w+\//, "");
    // Force .mp4 container for universal playback
    rest = rest.replace(/\.[a-zA-Z0-9]+$/, ".mp4");
    return `${base}${transform}/${rest}`;
  }

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
