import { ref, get, set, update, onValue, remove } from "@/integrations/firebase/rtdb";
import { isFirebaseConfigured, rtdb } from "@/integrations/firebase/config";

export interface ActiveUserSession {
  sessionId: string;
  userId: string;
  displayName: string;
  username: string;
  email: string | null;
  photoURL: string | null;
  path: string;
  startedAt: number;
  lastSeenAt: number;
  isOnline: boolean;
  durationSeconds?: number;
}

export interface SessionHistoryRecord {
  sessionId: string;
  userId: string;
  displayName: string;
  username: string;
  email: string | null;
  photoURL: string | null;
  path: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
}

// Local fallback memory store when RTDB is unavailable
const localSessionsMemory: Record<string, ActiveUserSession> = {};
const localHistoryMemory: SessionHistoryRecord[] = [];

/**
 * Format session duration into human readable format (e.g. "14m 20s" or "1h 05m 12s")
 */
export function formatSessionDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) {
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins.toString().padStart(2, "0")}m ${secs.toString().padStart(2, "0")}s`;
}

/**
 * Ping heartbeat every 2 seconds for live user tracking
 */
export async function sendPresencePing(data: Omit<ActiveUserSession, "isOnline">): Promise<void> {
  const now = Date.now();
  const session: ActiveUserSession = {
    ...data,
    lastSeenAt: now,
    isOnline: true,
  };

  if (isFirebaseConfigured()) {
    try {
      const sessionRef = ref(rtdb, `presence/${data.sessionId}`);
      await set(sessionRef, session);
    } catch (err) {
      console.warn("[Presence] RTDB ping fallback:", err);
      localSessionsMemory[data.sessionId] = session;
    }
  } else {
    localSessionsMemory[data.sessionId] = session;
  }
}

/**
 * Mark a user session as offline and record final session duration
 */
export async function markSessionOffline(sessionId: string): Promise<void> {
  const now = Date.now();
  if (isFirebaseConfigured()) {
    try {
      const sessionRef = ref(rtdb, `presence/${sessionId}`);
      const snap = await get(sessionRef);
      if (snap.exists()) {
        const val = snap.val() as ActiveUserSession;
        const durationSeconds = Math.max(1, Math.round((now - val.startedAt) / 1000));

        // Save into presence history
        const historyRecord: SessionHistoryRecord = {
          sessionId: val.sessionId,
          userId: val.userId,
          displayName: val.displayName,
          username: val.username,
          email: val.email,
          photoURL: val.photoURL,
          path: val.path,
          startedAt: val.startedAt,
          endedAt: now,
          durationSeconds,
        };

        const historyRef = ref(rtdb, `presenceHistory/${sessionId}`);
        await set(historyRef, historyRecord);

        // Update presence to offline
        await update(sessionRef, {
          isOnline: false,
          lastSeenAt: now,
          durationSeconds,
        });
      }
    } catch (err) {
      console.warn("[Presence] Failed to mark offline:", err);
    }
  } else if (localSessionsMemory[sessionId]) {
    const s = localSessionsMemory[sessionId];
    s.isOnline = false;
    s.lastSeenAt = now;
    s.durationSeconds = Math.max(1, Math.round((now - s.startedAt) / 1000));
    localHistoryMemory.unshift({
      sessionId: s.sessionId,
      userId: s.userId,
      displayName: s.displayName,
      username: s.username,
      email: s.email,
      photoURL: s.photoURL,
      path: s.path,
      startedAt: s.startedAt,
      endedAt: now,
      durationSeconds: s.durationSeconds,
    });
  }
}

/**
 * Subscribe to all live presence data (active + previous sessions)
 */
export function subscribeToPresence(
  callback: (data: {
    currentActiveUsers: ActiveUserSession[];
    previousActiveUsers: SessionHistoryRecord[];
  }) => void,
): () => void {
  const processPresence = (
    presenceData: Record<string, ActiveUserSession> | null,
    historyData: Record<string, SessionHistoryRecord> | null,
  ) => {
    const now = Date.now();
    const currentActive: ActiveUserSession[] = [];
    const previousActiveMap = new Map<string, SessionHistoryRecord>();

    // Process history records first
    if (historyData) {
      Object.values(historyData).forEach((item) => {
        if (item && item.sessionId) {
          previousActiveMap.set(item.sessionId, item);
        }
      });
    }

    // Process live presence nodes
    if (presenceData) {
      Object.values(presenceData).forEach((session) => {
        if (!session) return;
        // If pinged within the last 6 seconds (allowing for network jitter on 2s interval)
        const isRecentlyActive = session.isOnline && now - session.lastSeenAt <= 6000;
        if (isRecentlyActive) {
          currentActive.push({
            ...session,
            durationSeconds: Math.max(1, Math.round((now - session.startedAt) / 1000)),
          });
        } else {
          // Session went offline
          const durationSeconds =
            session.durationSeconds ||
            Math.max(1, Math.round((session.lastSeenAt - session.startedAt) / 1000));
          if (!previousActiveMap.has(session.sessionId)) {
            previousActiveMap.set(session.sessionId, {
              sessionId: session.sessionId,
              userId: session.userId,
              displayName: session.displayName,
              username: session.username,
              email: session.email,
              photoURL: session.photoURL,
              path: session.path,
              startedAt: session.startedAt,
              endedAt: session.lastSeenAt,
              durationSeconds,
            });
          }
        }
      });
    }

    // Sort previous users by endedAt descending
    const previousActive = Array.from(previousActiveMap.values()).sort(
      (a, b) => b.endedAt - a.endedAt,
    );

    callback({
      currentActiveUsers: currentActive,
      previousActiveUsers: previousActive,
    });
  };

  if (isFirebaseConfigured()) {
    let rawPresence: Record<string, ActiveUserSession> | null = null;
    let rawHistory: Record<string, SessionHistoryRecord> | null = null;

    const unsubPresence = onValue(ref(rtdb, "presence"), (snap) => {
      rawPresence = snap.exists() ? snap.val() : null;
      processPresence(rawPresence, rawHistory);
    });

    const unsubHistory = onValue(ref(rtdb, "presenceHistory"), (snap) => {
      rawHistory = snap.exists() ? snap.val() : null;
      processPresence(rawPresence, rawHistory);
    });

    return () => {
      unsubPresence();
      unsubHistory();
    };
  } else {
    const timer = setInterval(() => {
      processPresence(
        localSessionsMemory,
        localHistoryMemory.reduce((acc, curr) => ({ ...acc, [curr.sessionId]: curr }), {}),
      );
    }, 2000);
    return () => clearInterval(timer);
  }
}
