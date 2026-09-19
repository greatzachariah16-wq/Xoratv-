import type { XserisMediaItem } from "./types";

export async function resolvePlayback(mediaItem: Pick<XserisMediaItem, "id" | "playback">) {
  const response = await fetch("/api/catalog/" + encodeURIComponent(mediaItem.id) + "/playback", {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Playback source unavailable.");
  return (await response.json()) as {
    ok: boolean;
    playback: { type: "embed" | "external"; url: string; provider: string };
  };
}
