import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { sendPresencePing, markSessionOffline } from "@/integrations/firebase/presence";

function getOrCreateSessionId(): { sessionId: string; startedAt: number } {
  if (typeof window === "undefined") {
    return { sessionId: "ssr_session", startedAt: Date.now() };
  }

  let sessionId = sessionStorage.getItem("xora_session_id");
  const startedAtStr = sessionStorage.getItem("xora_session_started_at");

  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem("xora_session_id", sessionId);
  }

  let startedAt = startedAtStr ? parseInt(startedAtStr, 10) : 0;
  if (!startedAt || Number.isNaN(startedAt)) {
    startedAt = Date.now();
    sessionStorage.setItem("xora_session_started_at", startedAt.toString());
  }

  return { sessionId, startedAt };
}

export function usePresenceTracker() {
  const { user, profile } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const { sessionId, startedAt } = getOrCreateSessionId();

    const doPing = () => {
      const displayName =
        profile?.display_name || user?.displayName || (user ? "Registered User" : "Guest Viewer");
      const username = profile?.username || (user ? `user_${user.id.slice(0, 6)}` : "guest");
      const email = user?.email || null;
      const photoURL = profile?.avatar_url || user?.photoURL || null;
      const path = window.location.pathname || "/";

      sendPresencePing({
        sessionId,
        userId: user?.id || `guest_${sessionId}`,
        displayName,
        username,
        email,
        photoURL,
        path,
        startedAt,
        lastSeenAt: Date.now(),
      }).catch(() => {});
    };

    // Ping immediately on mount
    doPing();

    // Ping every 2 seconds (2000ms)
    const interval = setInterval(doPing, 2000);

    // Handle tab close or unload
    const handleUnload = () => {
      markSessionOffline(sessionId).catch(() => {});
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [user, profile]);
}
