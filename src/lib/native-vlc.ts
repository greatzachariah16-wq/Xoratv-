import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeVlcBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
};

export type NativeVlcPlaybackState = {
  playing: boolean;
  waiting: boolean;
  failed: boolean;
  closed: boolean;
};

type ListenerHandle = { remove(): Promise<void> };

type NativeVlcPlugin = {
  open(options: {
    url: string;
    title?: string;
    fallbackUrl1?: string;
    fallbackUrl2?: string;
    bounds: NativeVlcBounds;
  }): Promise<void>;
  updateBounds(options: { bounds: NativeVlcBounds }): Promise<void>;
  close(): Promise<void>;
  addListener(
    eventName: "playbackState",
    listenerFunc: (state: NativeVlcPlaybackState) => void,
  ): Promise<ListenerHandle>;
};

const NativeVlc = registerPlugin<NativeVlcPlugin>("XoraVlc");

export function isNativeVlcPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/** Read the player element's position so its native video surface stays inline. */
export function getNativeVlcBounds(element: HTMLElement | null): NativeVlcBounds {
  if (!element) {
    return { left: 0, top: 0, width: 0, height: 0, visible: false };
  }

  const rect = element.getBoundingClientRect();
  const visible =
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth;

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    visible,
  };
}

/** Start playback in the existing XoraTV player rectangle, without opening another screen. */
export async function openNativeVlc(options: {
  url: string;
  title?: string;
  bounds: NativeVlcBounds;
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

export async function updateNativeVlcBounds(bounds: NativeVlcBounds): Promise<void> {
  await NativeVlc.updateBounds({ bounds });
}

export async function closeNativeVlc(): Promise<void> {
  if (isNativeVlcPlatform()) await NativeVlc.close();
}

export function addNativeVlcListener(
  listener: (state: NativeVlcPlaybackState) => void,
): Promise<ListenerHandle> {
  return NativeVlc.addListener("playbackState", listener);
}
