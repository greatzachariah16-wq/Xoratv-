import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MediaBucket = "videos" | "posters" | "avatars";

const SIGN_TTL = 60 * 60;

export async function signMedia(bucket: MediaBucket, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, SIGN_TTL);
  return data?.signedUrl ?? null;
}

/** Resolves a stored object path to a temporary viewable URL. */
export function useSignedUrl(bucket: MediaBucket, path: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ["signed", bucket, path],
    queryFn: () => signMedia(bucket, path as string),
    enabled: Boolean(path),
    staleTime: 1000 * 60 * 40,
    gcTime: 1000 * 60 * 50,
  });
  return data ?? null;
}

export async function uploadMedia(
  bucket: MediaBucket,
  userId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  onProgress?.(10);
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    ...(file.type ? { contentType: file.type } : {}),
  });
  if (error) throw error;
  onProgress?.(100);
  return path;
}
