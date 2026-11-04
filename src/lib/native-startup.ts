import { Capacitor, registerPlugin } from "@capacitor/core";

type XoraStartupPlugin = {
  ready(): Promise<void>;
};

const XoraStartup = registerPlugin<XoraStartupPlugin>("XoraStartup");

/** Called once the Xora React shell has hydrated. Browser/PWA use is a no-op. */
export async function notifyNativeShellReady(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await XoraStartup.ready();
  } catch (error) {
    console.warn("[Xora] Could not notify the native Android shell.", error);
  }
}
