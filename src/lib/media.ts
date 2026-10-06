import { useQuery } from "@tanstack/react-query";
import { isFirebaseConfigured } from "@/integrations/firebase/config";
import { recordMediaIndex } from "@/integrations/firebase/rtdb";
import { auth } from "@/integrations/firebase/config";
import {
  uploadToCloudinary,
  isCloudinaryConfigured,
  getOriginalVideoUrl,
  type CloudinaryUploadResult,
  type CloudinaryUploadOptions,
} from "./cloudinary";

export {
  uploadToCloudinary,
  isCloudinaryConfigured,
  get240pDeliveryUrl,
  type CloudinaryUploadResult,
  type CloudinaryUploadOptions,
};

export type MediaBucket = "videos" | "posters" | "avatars";

/**
 * Render Backend Streaming & API Base URL.
 * Set via VITE_RENDER_BACKEND_URL in environment or falls back to current origin when deployed.
 */
export const RENDER_BACKEND_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_RENDER_BACKEND_URL) || "";

async function uploadToSparkleVideoStorage(
  userId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ path: string; streamUrl: string } | null> {
  const renderBase = getRenderBaseUrl();
  if (!renderBase) return null;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("userId", userId);

  try {
    onProgress?.(10);
    const res = await fetch(`${renderBase}/api/storage/sparkle/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { ok?: boolean; path?: string; streamUrl?: string };
    if (!data.ok || !data.path || !data.streamUrl) return null;

    onProgress?.(100);
    return { path: data.path, streamUrl: `${renderBase}${data.streamUrl}` };
  } catch (error) {
    console.warn("[Media] Sparkle Hub video storage unavailable; using existing fallback:", error);
    return null;
  }
}

export function getRenderBaseUrl(): string {
  if (RENDER_BACKEND_URL) {
    return RENDER_BACKEND_URL.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }
  return "";
}

/**
 * Resolves a stored media path or key to a streamable URL.
 * Supports absolute HTTP/HTTPS URLs (Cloudinary, external), Cloudinary public IDs, or Render paths.
 */
export function resolveMediaUrl(
  bucket: MediaBucket,
  path: string | null | undefined,
): string | null {
  if (!path || typeof path !== "string") return null;

  const trimmed = path.trim();
  if (!trimmed) return null;

  // Blob or data URLs are local preview assets
  if (/^(blob:|data:)/i.test(trimmed)) {
    return trimmed;
  }

  // If already an absolute HTTP/HTTPS URL (e.g. Cloudinary, YouTube, external)
  if (/^https?:\/\//i.test(trimmed)) {
    if (bucket === "videos" && trimmed.includes("res.cloudinary.com")) {
      return getOriginalVideoUrl(trimmed);
    }
    return trimmed;
  }

  // Strip leading slashes
  const cleanPath = trimmed.replace(/^\/+/, "");

  // If bucket is videos and path is a Cloudinary public_id (e.g. xora/videos/...)
  if (bucket === "videos" && isCloudinaryConfigured() && !cleanPath.startsWith("videos/")) {
    const cloudinaryDelivery = getOriginalVideoUrl(cleanPath);
    if (cloudinaryDelivery) {
      return cloudinaryDelivery;
    }
  }

  // If path already starts with the bucket name, don't duplicate it
  const finalKey = cleanPath.startsWith(`${bucket}/`) ? cleanPath : `${bucket}/${cleanPath}`;

  const renderBase = getRenderBaseUrl();
  return renderBase ? `${renderBase}/${finalKey}` : `/${finalKey}`;
}

/**
 * Resolves media path into direct stream link.
 */
export async function signMedia(bucket: MediaBucket, path: string): Promise<string | null> {
  return resolveMediaUrl(bucket, path);
}

/**
 * Resolves a stored media path or key to a streamable Render backend URL.
 * Used by VideoPlayer and UserAvatar components across the application.
 */
export function useSignedUrl(bucket: MediaBucket, path: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ["media-stream-url", bucket, path],
    queryFn: () => resolveMediaUrl(bucket, path),
    enabled: Boolean(path),
    staleTime: 1000 * 60 * 60, // 1 hour caching
    gcTime: 1000 * 60 * 90,
  });
  return data ?? (path ? resolveMediaUrl(bucket, path) : null);
}

/**
 * Uploads media.
 * For videos: uses Cloudinary (Option 1 with 240p transformation) if configured.
 * Otherwise falls back to Render backend endpoint: POST /api/upload with a clear warning.
 */
export async function uploadMedia(
  bucket: MediaBucket,
  userId: string,
  file: File,
  onProgress?: (percent: number) => void,
  options?: { title?: string; description?: string },
): Promise<string> {
  // Cloudinary is the active creator-video storage/delivery path.
  // Do not route creator videos through the old Sparkle Hub bridge.
  // XoraTV Content Supabase will be added separately for selected videos only.

  // Existing Cloudinary path remains the primary video path.
  if (bucket === "videos" && isCloudinaryConfigured()) {
    const res = await uploadToCloudinary(file, {
      resourceType: "video",
      creatorId: userId,
      title: options?.title,
      description: options?.description,
      onProgress,
    });

    // Creator uploads must preserve their full-quality Cloudinary MP4. Do not save the 240p rendition as the canonical stream URL.\n    const finalUrl = res.playbackUrl || res.url;
    const finalPath = res.publicId || res.url;

    if (isFirebaseConfigured()) {
      try {
        await recordMediaIndex({
          objectKey: finalPath,
          renderUrl: finalUrl,
          bucket,
          ownerId: userId,
          created_at: new Date().toISOString(),
        });
      } catch (indexErr) {
        console.warn("[Media] Note recording mediaIndex in RTDB:", indexErr);
      }
    }

    return finalUrl;
  }

  if (bucket === "videos") {
    console.warn(
      "[Media] Cloudinary is not configured (missing VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET). Falling back to ephemeral Render disk upload.",
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const uniqueId =
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `f_${Date.now()}`;
  const key = `${bucket}/${userId}/${uniqueId}.${ext}`;

  onProgress?.(15);

  const renderBase = getRenderBaseUrl();
  const uploadEndpoint = `${renderBase}/api/upload`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("bucket", bucket);
  formData.append("key", key);

  const headers: Record<string, string> = {};
  if (auth?.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers["Authorization"] = `Bearer ${idToken}`;
      }
    } catch {
      // Optional auth token
    }
  }

  onProgress?.(40);

  let res: Response;
  try {
    res = await fetch(uploadEndpoint, {
      method: "POST",
      headers,
      body: formData,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    throw new Error(`Failed to connect to Render upload endpoint (${uploadEndpoint}): ${message}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Upload to Render failed with status ${res.status}: ${errText || res.statusText}`,
    );
  }

  const data = (await res.json()) as { url?: string; path?: string };
  if (!data || (!data.url && !data.path)) {
    throw new Error("Invalid response from Render upload endpoint: missing file url or path");
  }

  const finalPath = data.path || key;
  const finalUrl = data.url || resolveMediaUrl(bucket, finalPath) || finalPath;

  onProgress?.(90);

  // Record in RTDB mediaIndex if Firebase is configured
  if (isFirebaseConfigured()) {
    try {
      await recordMediaIndex({
        objectKey: finalPath,
        renderUrl: finalUrl,
        bucket,
        ownerId: userId,
        created_at: new Date().toISOString(),
      });
    } catch (indexErr) {
      console.warn("[Media] Note recording mediaIndex in RTDB:", indexErr);
    }
  }

  onProgress?.(100);
  return finalUrl;
}
