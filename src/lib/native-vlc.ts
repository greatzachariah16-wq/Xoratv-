import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeVlcStateName =
  | "IDLE"
  | "OFFLINE"
  | "CONNECTING"
  | "BUFFERING"
  | "PLAYING"
  | "ERR_REGION"
  | "ERR_CHANNEL_DOWN"
  | "ERR_TIMEOUT"
  | "ERR_UNKNOWN";

export type NativeVlcStateChanged = {
  state: NativeVlcStateName;
  channelId: string;
  message: string;
  userClosed?: boolean;
};

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
    channelId?: string;
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
  addListener(
    eventName: "stateChanged",
    listenerFunc: (state: NativeVlcStateChanged) => void,
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
  channelId?: string;
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
    channelId: options.channelId || absoluteUrl.searchParams.get("channel") || undefined,
    fallbackUrl1: fallbackUrls[0],
    fallbackUrl2: fallbackUrls[1],
  });
}

export async function closeNativeVlc(): Promise<void> {
  if (isNativeVlcPlatform()) await NativeVlc.close();
}

export async function retryNativeVlc(): Promise<void> {
  if (isNativeVlcPlatform()) await NativeVlc.retry();
}

export function addNativeVlcListener(
  listener: (state: NativeVlcPlaybackState) => void,
): Promise<ListenerHandle> {
  return NativeVlc.addListener("playbackState", listener);
}

export function addNativeVlcStateListener(
  listener: (state: NativeVlcStateChanged) => void,
): Promise<ListenerHandle> {
  return NativeVlc.addListener("stateChanged", listener);
}
