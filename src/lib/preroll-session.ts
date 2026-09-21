export type AdPlaybackState = "idle" | "loading" | "playing" | "completed" | "skipped" | "failed";

const clearedAdSessions = new Set<string>();

/**
 * Normalizes a media identifier into a unique session key.
 */
export function getMediaSessionKey(
  mediaPath?: string | null,
  externalUrl?: string | null,
  streamUrl?: string | null,
  postId?: string | null,
): string {
  const raw = postId || streamUrl || externalUrl || mediaPath || "default-media-session";
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Returns true if the advertisement for this media session has already completed or been skipped.
 */
export function isSessionAdCleared(sessionKey: string): boolean {
  return clearedAdSessions.has(sessionKey);
}

/**
 * Marks the advertisement for this media session as completed / skipped / cleared.
 */
export function markSessionAdCleared(sessionKey: string): void {
  if (sessionKey) {
    clearedAdSessions.add(sessionKey);
  }
}

/**
 * Resets the cleared state for a session (e.g., if manually restarted).
 */
export function resetSessionAd(sessionKey: string): void {
  if (sessionKey) {
    clearedAdSessions.delete(sessionKey);
  }
}
