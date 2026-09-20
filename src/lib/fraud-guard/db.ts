import { get, ref, set, update } from "firebase/database";
import { rtdb } from "@/integrations/firebase/config";

/**
 * Sanitizes keys for Firebase Realtime Database paths.
 * RTDB forbids `.`, `#`, `$`, `[`, `]`, and `/` in path keys.
 */
export function sanitizePathKey(raw: string): string {
  if (!raw) return "unknown";
  return raw
    .replace(/[.#$[\]/]/g, "_")
    .replace(/\s+/g, "_")
    .trim();
}

/**
 * Wraps a promise with a timeout to guarantee no hangs on Render's free tier.
 */
export async function withTimeout<T>(promise: Promise<T>, ms = 4000, fallbackValue: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallbackValue);
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Single, stateless read from Firebase Realtime Database.
 */
export async function rtdbGet<T>(path: string): Promise<T | null> {
  try {
    const dbRef = ref(rtdb, path);
    const snapshot = await withTimeout(get(dbRef), 3500, null);
    if (!snapshot || !snapshot.exists()) return null;
    return snapshot.val() as T;
  } catch (error) {
    console.warn(`[FraudGuard DB] Read failed for ${path}:`, error);
    return null;
  }
}

/**
 * Single, stateless write to Firebase Realtime Database.
 */
export async function rtdbSet<T>(path: string, data: T): Promise<boolean> {
  try {
    const dbRef = ref(rtdb, path);
    await withTimeout(set(dbRef, data), 3500, false);
    return true;
  } catch (error) {
    console.warn(`[FraudGuard DB] Set failed for ${path}:`, error);
    return false;
  }
}

/**
 * Single, stateless update to Firebase Realtime Database.
 */
export async function rtdbUpdate(path: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    const dbRef = ref(rtdb, path);
    await withTimeout(update(dbRef, data), 3500, false);
    return true;
  } catch (error) {
    console.warn(`[FraudGuard DB] Update failed for ${path}:`, error);
    return false;
  }
}
