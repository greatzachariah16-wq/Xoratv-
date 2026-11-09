import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeVlcStatus =
  | "IDLE"
  | "OFFLINE"
  | "CONNECTING"
  | "BUFFERING"
  | "PLAYING"
  | "ERR_REGION"
  | "ERR_CHANNEL_DOWN"
  | "ERR_TIMEOUT"
  | "ERR_UNKNOWN";

export type NativeVlcStateChangedEvent = {
  state: NativeVlcStatus;
  channelId: string;
  message: string;
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
  switchChannel(options: {
    url: string;
    title?: string;
    channelId?: string;
    fallbackUrl1?: string;
    fallbackUrl2?: string;
  }): Promise<void>;
  togglePlayback(): Promise<void>;
  toggleMute(): Promise<void>;
  cycleMode(): Promise<void>;
  retry(): Promise<void>;
  lockLandscape(): Promise<void>;
  unlockOrientation(): Promise<void>;
  enterPictureInPicture(): Promise<void>;
  addListener(
    eventName: "playbackState",
    listenerFunc: (state: NativeVlcPlaybackState) => void,
  ): Promise<ListenerHandle>;
  addListener(
    eventName: "stateChanged",
    listenerFunc: (state: NativeVlcStateChangedEvent) => void,
  ): Promise<ListenerHandle>;
};

const NativeVlc = registerPlugin<NativeVlcPlugin>("XoraVlc");

export function isNativeVlcPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/** Open the native LibVLC player above the scrolling XoraTV WebView. */
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
    fallbackUrl1: fallbackUrls[0],
    fallbackUrl2: fallbackUrls[1],
  });
}

export async function closeNativeVlc(): Promise<void> {
  if (isNativeVlcPlatform()) await NativeVlc.close();
}

export function addNativeVlcStateListener(
  listener: (state: NativeVlcStateChangedEvent) => void,
): Promise<ListenerHandle> {
  return NativeVlc.addListener("stateChanged", listener);
}

export function addNativeVlcPlaybackListener(
  listener: (state: NativeVlcPlaybackState) => void,
): Promise<ListenerHandle> {
  return NativeVlc.addListener("playbackState", listener);
}

export function addNativeVlcListener(
  listener: (state: NativeVlcPlaybackState) => void,
): Promise<ListenerHandle> {
  return addNativeVlcPlaybackListener(listener);
}


/** Switches the source on the existing native LibVLC surface when one is already open. */
export async function switchNativeVlcChannel(options: {
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

  await NativeVlc.switchChannel({
    ...options,
    url: absoluteUrl.toString(),
    fallbackUrl1: fallbackUrls[0],
    fallbackUrl2: fallbackUrls[1],
  });
}

export async function retryNativeVlc(): Promise<void> {
  if (isNativeVlcPlatform()) await NativeVlc.retry();
}

export async function toggleNativeVlcPlayback(): Promise<void> {
  if (isNativeVlcPlatform()) await NativeVlc.togglePlayback();
}

export async function lockNativeVlcLandscape(): Promise<void> {
  if (isNativeVlcPlatform()) await NativeVlc.lockLandscape();
}

export async function unlockNativeVlcOrientation(): Promise<void> {
  if (isNativeVlcPlatform()) await NativeVlc.unlockOrientation();
}
