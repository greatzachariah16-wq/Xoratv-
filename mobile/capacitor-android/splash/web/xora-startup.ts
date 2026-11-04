import { Capacitor, registerPlugin } from "@capacitor/core";

type XoraStartupPlugin = {
  ready(): Promise<void>;
};

const XoraStartup = registerPlugin<XoraStartupPlugin>("XoraStartup");

/**
 * Call after the first Xora app shell has hydrated.
 * It is intentionally a no-op in browsers and the standalone PWA.
 */
export async function notifyNativeShellReady(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await XoraStartup.ready();
  } catch (error) {
    console.warn("[Xora] Could not notify the native Android shell.", error);
  }
}
