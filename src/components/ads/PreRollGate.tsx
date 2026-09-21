import { useState, useEffect } from "react";
import { XoraVideoAdPlayer } from "./XoraVideoAdPlayer";
import {
  getMediaSessionKey,
  isSessionAdCleared,
  markSessionAdCleared,
  type AdPlaybackState,
} from "@/lib/preroll-session";
import { trackEvent } from "@/lib/events";

interface PreRollGateProps {
  mediaPath?: string | null;
  externalUrl?: string | null;
  streamUrl?: string | null;
  source?: string | null;
  postId?: string | null;
  authorId?: string | null;
  genre?: string | null;
  title?: string;
  isExternalProvider?: boolean;
  className?: string;
  children: React.ReactNode;
}

interface PrerollConfigResponse {
  enabled: boolean;
  adTagUrl: string;
  applyToExternal: boolean;
  applyToDirect: boolean;
}

export function PreRollGate({
  mediaPath,
  externalUrl,
  streamUrl,
  postId,
  authorId,
  genre,
  title,
  isExternalProvider = false,
  className,
  children,
}: PreRollGateProps) {
  const sessionKey = getMediaSessionKey(mediaPath, externalUrl, streamUrl, postId);

  const [adState, setAdState] = useState<AdPlaybackState>(() =>
    isSessionAdCleared(sessionKey) ? "completed" : "idle",
  );
  const [adTagUrl, setAdTagUrl] = useState<string>(
    "https://youradexchange.com/video/select.php?r=12201910",
  );

  useEffect(() => {
    // If session ad already cleared, skip check
    if (isSessionAdCleared(sessionKey)) {
      setAdState("completed");
      return;
    }

    let isMounted = true;

    const checkPreRollConfig = async () => {
      try {
        const res = await fetch("/api/preroll/config");
        if (!isMounted) return;

        if (res.ok) {
          const json = await res.json();
          if (json.ok && json.config) {
            const config: PrerollConfigResponse = json.config;

            if (!config.enabled) {
              markSessionAdCleared(sessionKey);
              setAdState("completed");
              return;
            }

            if (isExternalProvider && !config.applyToExternal) {
              markSessionAdCleared(sessionKey);
              setAdState("completed");
              return;
            }

            if (!isExternalProvider && !config.applyToDirect) {
              markSessionAdCleared(sessionKey);
              setAdState("completed");
              return;
            }

            setAdTagUrl(
              config.adTagUrl || "https://youradexchange.com/video/select.php?r=12201910",
            );
            setAdState("playing");
            return;
          }
        }
      } catch (err) {
        console.warn("[PreRollGate] Failed checking preroll config:", err);
      }

      // Default fallback if fetch fails: enable preroll with tag
      if (isMounted) {
        setAdState("playing");
      }
    };

    void checkPreRollConfig();

    return () => {
      isMounted = false;
    };
  }, [isExternalProvider, sessionKey]);

  const handleAdEnded = () => {
    markSessionAdCleared(sessionKey);
    setAdState("completed");
    trackEvent({
      type: "content_started_after_preroll",
      postId,
      authorId,
      genre,
      meta: { sessionKey },
    });
  };

  if (adState === "playing" || adState === "loading") {
    return (
      <XoraVideoAdPlayer
        adTagUrl={adTagUrl}
        onAdEnded={handleAdEnded}
        title={title}
        postId={postId}
        authorId={authorId}
        genre={genre}
        className={className}
      />
    );
  }

  return <>{children}</>;
}
