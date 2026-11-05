import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeVlcPlugin = {
  open(options: { url: string; title?: string }): Promise<void>;
};

const NativeVlc = registerPlugin<NativeVlcPlugin>("XoraVlc");

export function isNativeVlcPlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** Open the Android LibVLC player. Returns false on web or when the native plugin is unavailable. */
export async function openNativeVlc(options: { url: string; title?: string }): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await NativeVlc.open(options);
    return true;
  } catch (error) {
    console.warn("[Xora] Native VLC playback is unavailable; falling back to the web player.", error);
    return false;
  }
}
