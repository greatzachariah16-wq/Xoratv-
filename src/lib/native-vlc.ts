import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeVlcPlugin = {
  open(options: { url: string; title?: string }): Promise<void>;
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
  await NativeVlc.open({ ...options, url: absoluteUrl.toString() });
}
