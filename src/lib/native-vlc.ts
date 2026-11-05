import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeVlcPlugin = {
  open(options: { url: string; title?: string; fallbackUrl1?: string; fallbackUrl2?: string }): Promise<void>;
};

const NativeVlc = registerPlugin<NativeVlcPlugin>("XoraVlc");

export function isNativeVlcPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/** Open the native Android LibVLC player. Never fall back to the WebView player. */
export async function openNativeVlc(options: { url: string; title?: string }): Promise<void> {
  if (!isNativeVlcPlatform()) {
    throw new Error("Native LibVLC is available only in the XoraTV Android app.");
  }
  const absoluteUrl = new URL(options.url, window.location.origin);
  if (absoluteUrl.protocol !== "https:") {
    throw new Error("LibVLC requires a secure HTTPS stream URL.");
  }
  // Nexus publishes multiple ranked stream candidates. The old native bridge
  // opened only attempt=0, so a dead first URL stopped playback even when the
  // same channel had other candidates. Pass all three through to LibVLC.
  const fallbackUrls: string[] = [];
  if (absoluteUrl.pathname === "/api/tv/stream" && absoluteUrl.searchParams.get("provider") === "nexus" && absoluteUrl.searchParams.has("channel")) {
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
