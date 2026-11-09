import { useEffect, useState, useCallback } from "react";
import { isNativeVlcPlatform, lockNativeVlcLandscape, unlockNativeVlcOrientation } from "@/lib/native-vlc";

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

export interface OrientationState {
  isLandscape: boolean;
  isLockSupported: boolean;
  angle: number;
  type: string;
}

/**
 * Hook to monitor device/viewport orientation and manage screen orientation locks.
 */
export function useOrientation() {
  const [orientation, setOrientation] = useState<OrientationState>({
    isLandscape: false,
    isLockSupported: false,
    angle: 0,
    type: "portrait-primary",
  });

  const updateOrientation = useCallback(() => {
    if (typeof window === "undefined") return;

    const screenOrientation = typeof screen !== "undefined"
      ? screen.orientation as LockableScreenOrientation | undefined
      : undefined;
    const isLandscapeByMedia = window.matchMedia("(orientation: landscape)").matches;
    const isLandscapeByDims = window.innerWidth > window.innerHeight;
    const isLandscapeByType = screenOrientation
      ? screenOrientation.type.startsWith("landscape")
      : isLandscapeByMedia || isLandscapeByDims;

    const isLandscape = isLandscapeByType || isLandscapeByMedia || isLandscapeByDims;
    const isLockSupported =
      typeof screen !== "undefined" &&
      typeof screen.orientation !== "undefined" &&
      typeof screenOrientation?.lock === "function";

    setOrientation({
      isLandscape,
      isLockSupported,
      angle: screenOrientation ? screenOrientation.angle : 0,
      type: screenOrientation
        ? screenOrientation.type
        : isLandscape
          ? "landscape-primary"
          : "portrait-primary",
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    updateOrientation();

    // Listen to screen orientation change
    if (typeof screen !== "undefined" && screen.orientation) {
      screen.orientation.addEventListener("change", updateOrientation);
    }

    // Media query fallback listener
    const mediaQuery = window.matchMedia("(orientation: landscape)");
    const handleMediaChange = () => updateOrientation();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleMediaChange);
    } else {
      // Compatibility for older browsers
      mediaQuery.addListener(handleMediaChange);
    }

    window.addEventListener("resize", updateOrientation);

    return () => {
      if (typeof screen !== "undefined" && screen.orientation) {
        screen.orientation.removeEventListener("change", updateOrientation);
      }
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }
      window.removeEventListener("resize", updateOrientation);
    };
  }, [updateOrientation]);

  // Request Landscape orientation lock
  const lockLandscape = useCallback(
    async (element?: HTMLElement | null): Promise<boolean> => {
      try {
        if (isNativeVlcPlatform()) {
          await lockNativeVlcLandscape();
          updateOrientation();
          return true;
        }
        // Web fallback: orientation lock may require fullscreen in some browsers.
        if (element && !document.fullscreenElement && element.requestFullscreen) {
          await element.requestFullscreen().catch(() => {});
        }

        const lockableOrientation = typeof screen !== "undefined" && screen.orientation
          ? screen.orientation as LockableScreenOrientation
          : undefined;
        if (lockableOrientation && typeof lockableOrientation.lock === "function") {
          const lock = lockableOrientation.lock.bind(lockableOrientation);
          await lock("landscape").catch(async () => {
            // Fallback to landscape-primary if generic landscape is rejected
            await lock("landscape-primary").catch(() => {});
          });
          updateOrientation();
          return true;
        }
      } catch (err) {
        console.info("[Orientation] Landscape lock note:", err);
      }
      return false;
    },
    [updateOrientation],
  );

  // Request Portrait or Unlock orientation
  const unlockOrientation = useCallback(async (): Promise<void> => {
    try {
      if (isNativeVlcPlatform()) {
        await unlockNativeVlcOrientation();
        updateOrientation();
        return;
      }
      const lockableOrientation = typeof screen !== "undefined" && screen.orientation
        ? screen.orientation as LockableScreenOrientation
        : undefined;
      lockableOrientation?.unlock?.();
    } catch {
      // ignore unlock error
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }

    updateOrientation();
  }, [updateOrientation]);

  return {
    isLandscape: orientation.isLandscape,
    isLockSupported: orientation.isLockSupported,
    angle: orientation.angle,
    orientationType: orientation.type,
    lockLandscape,
    unlockOrientation,
  };
}

/** Live TV uses the shared orientation controller rather than registering a second listener set. */
export const useLandscapeMode = useOrientation;
