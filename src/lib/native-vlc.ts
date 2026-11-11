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
  transport?: "local" | "proxy";
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

export type NativeVlcCandidate = { url: string; headers?: Record<string, string> };
export type NativeVlcResolution = {
  mode: "direct" | "proxy";
  url: string;
  headers?: Record<string, string>;
  candidates: NativeVlcCandidate[];
  proxyUrl?: string;
  proxyFallbackUrls?: string[];
  reason?: string;
};

type ListenerHandle = { remove(): Promise<void> };

type NativeVlcPlugin = {
  open(options: {
    url: string;
    title?: string;
    channelId?: string;
    qualityMode?: "auto" | "data-saver" | "high";
    fallbackUrl1?: string;
    fallbackUrl2?: string;
    candidates?: NativeVlcCandidate[];
    proxyFallbackUrl?: string;
  }): Promise<void>;
  close(): Promise<void>;
  switchChannel(options: {
    url: string;
    title?: string;
    channelId?: string;
    fallbackUrl1?: string;
    fallbackUrl2?: string;
    candidates?: NativeVlcCandidate[];
    proxyFallbackUrl?: string;
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

/** Resolve upstream candidates for LocalHlsProxy plus its emergency server-proxy fallback. */
export async function resolveNativeVlcPlayback(
  provider: "nexus" | "iptv-org",
  channelId: string,
): Promise<NativeVlcResolution> {
  const endpoint = new URL("/api/tv/stream", window.location.origin);
  endpoint.searchParams.set("provider", provider);
  endpoint.searchParams.set("channel", channelId);
  endpoint.searchParams.set("resolve", "1");
  const response = await fetch(endpoint.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Could not resolve this channel (HTTP " + response.status + ").");
  }
  const payload = (await response.json()) as NativeVlcResolution;
  if (!payload || (payload.mode !== "direct" && payload.mode !== "proxy") || !payload.url) {
    throw new Error("The channel resolver returned an invalid playback response.");
  }
  return payload;
}

/** Open the native LibVLC player above the scrolling XoraTV WebView. */
export async function openNativeVlc(options: {
  url: string;
  title?: string;
  channelId?: string;
  candidates?: NativeVlcCandidate[];
  proxyFallbackUrl?: string;
  fallbackUrl1?: string;
  fallbackUrl2?: string;
}): Promise<void> {
  if (!isNativeVlcPlatform()) {
    throw new Error("Native playback is available only in the XoraTV Android app.");
  }

  const absoluteUrl = new URL(options.url, window.location.origin);
  if (absoluteUrl.protocol !== "https:") {
    throw new Error("A secure stream URL is required.");
  }

  await NativeVlc.open({
    ...options,
    url: absoluteUrl.toString(),
    candidates: options.candidates,
    qualityMode: options.qualityMode,
    proxyFallbackUrl: options.proxyFallbackUrl,
    fallbackUrl1: options.fallbackUrl1,
    fallbackUrl2: options.fallbackUrl2,
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
  candidates?: NativeVlcCandidate[];
  proxyFallbackUrl?: string;
  fallbackUrl1?: string;
  fallbackUrl2?: string;
}): Promise<void> {
  if (!isNativeVlcPlatform()) {
    throw new Error("Native playback is available only in the XoraTV Android app.");
  }

  const absoluteUrl = new URL(options.url, window.location.origin);
  if (absoluteUrl.protocol !== "https:") {
    throw new Error("A secure stream URL is required.");
  }

  await NativeVlc.switchChannel({
    ...options,
    url: absoluteUrl.toString(),
    candidates: options.candidates,
    proxyFallbackUrl: options.proxyFallbackUrl,
    fallbackUrl1: options.fallbackUrl1,
    fallbackUrl2: options.fallbackUrl2,
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
