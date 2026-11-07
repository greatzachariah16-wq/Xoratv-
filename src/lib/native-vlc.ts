import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeVlcPlaybackState = {
  playing: boolean;
  waiting: boolean;
  failed: boolean;
  closed: boolean;
  userClosed?: boolean;
  muted?: boolean;
  mode?: "pinned" | "theater" | "fullscreen" | "tablet";
  pip?: boolean;
};

type ListenerHandle = { remove(): Promise<void> };

type NativeVlcPlugin = {
  open(options: {
    url: string;
    title?: string;
    fallbackUrl1?: string;
    fallbackUrl2?: string;
  }): Promise<void>;
  close(): Promise<void>;
  togglePlayback(): Promise<void>;
  toggleMute(): Promise<void>;
  cycleMode(): Promise<void>;
  retry(): Promise<void>;
  enterPictureInPicture(): Promise<void>;
  addListener(
    eventName: "playbackState",
    listenerFunc: (state: NativeVlcPlaybackState) => void,
  ): Promise<ListenerHandle>;
};

const NativeVlc = registerPlugin<NativeVlcPlugin>("XoraVlc");

export function isNativeVlcPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/** Open the fixed native LibVLC surface above the scrolling XoraTV WebView. */
export async function openNativeVlc(options: {
  url: string;
  title?: string;
}): Promise<void> {
  if (!isNativeVlcPlatform()) {
    throw new Error("Native playback is available only in the XoraTV Android app.");
  }

  const absoluteUrl = new URL(options.url, window.location.origin);
  if (absoluteUrl.protocol !== "https:") {
    throw new Error("A secure stream URL is required.");
  }

  const fallbackUrls: string[] = [];
  if (
    absoluteUrl.pathname === "/api/tv/stream" &&
    absoluteUrl.searchParams.get("provider") === "nexus" &&
    absoluteUrl.searchParams.has("channel")
  ) {
    for (const attempt of [1, 2]) {
      const candidate = new URL(absoluteUrl.toString());
      candidate.searchParams.set("attempt", String(attempt));
      fallbackUrls.push(candidate.toString());
    }
  }

  await NativeVlc.open({
    ...options,
    url: absoluteUrl.toString(),
    fallbackUrl1: fallbackUrls[0],
    fallbackUrl2: fallbackUrls[1],
  });
}

export async function closeNativeVlc(): Promise<void> {
  if (isNativeVlcPlatform()) await NativeVlc.close();
}

export function addNativeVlcListener(
  listener: (state: NativeVlcPlaybackState) => void,
): Promise<ListenerHandle> {
  return NativeVlc.addListener("playbackState", listener);
}
