type NativeStartupPlugin = {
  ready?: () => Promise<unknown> | unknown;
};

type CapacitorWindow = Window & {
  Capacitor?: {
    Plugins?: {
      XoraStartup?: NativeStartupPlugin;
    };
  };
};

/**
 * Signals that the Xora web app has hydrated and its first app shell is ready.
 * Browsers and the PWA do nothing; the Android shell uses this to dismiss its
 * native startup overlay.
 */
export function notifyNativeShellReady(): void {
  if (typeof window === "undefined") return;

  const plugin = (window as CapacitorWindow).Capacitor?.Plugins?.XoraStartup;
  if (typeof plugin?.ready !== "function") return;

  try {
    void Promise.resolve(plugin.ready()).catch((error: unknown) => {
      console.warn("[Xora] Native startup handoff failed.", error);
    });
  } catch (error) {
    console.warn("[Xora] Native startup handoff failed.", error);
  }
}
