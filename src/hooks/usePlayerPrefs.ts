import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "xoratv:live-tv-player-prefs";

type StoredPlayerPrefs = {
  favorites: string[];
  recent: string[];
  lastWatched: string | null;
};

function isStoredPlayerPrefs(value: unknown): value is StoredPlayerPrefs {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.favorites) &&
    record.favorites.every((item) => typeof item === "string") &&
    Array.isArray(record.recent) &&
    record.recent.every((item) => typeof item === "string") &&
    (typeof record.lastWatched === "string" || record.lastWatched === null)
  );
}

/** Local-only preferences for the Live TV experience. Storage is accessed in effects only. */
export function usePlayerPrefs() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [lastWatched, setLastWatched] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isStoredPlayerPrefs(parsed)) {
          setFavorites(parsed.favorites);
          setRecent(parsed.recent.slice(0, 10));
          setLastWatched(parsed.lastWatched);
        }
      }
    } catch {
      // Private browsing or storage-disabled environments keep in-memory preferences.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ favorites, recent, lastWatched } satisfies StoredPlayerPrefs),
      );
    } catch {
      // Preferences remain usable for the current session if storage is unavailable.
    }
  }, [favorites, recent, lastWatched, hydrated]);

  const rememberChannel = useCallback((channelId: string) => {
    setRecent((current) => [channelId, ...current.filter((id) => id !== channelId)].slice(0, 10));
    setLastWatched(channelId);
  }, []);

  const toggleFavorite = useCallback((channelId: string) => {
    setFavorites((current) =>
      current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId],
    );
  }, []);

  return { favorites, recent, lastWatched, rememberChannel, toggleFavorite };
}
