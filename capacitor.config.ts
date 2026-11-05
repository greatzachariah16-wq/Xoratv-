import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Xora intentionally loads the live Render-hosted website in the Capacitor
 * WebView so web updates reach Android without rebuilding the APK.
 *
 * Capacitor documents server.url as a live-reload feature rather than its
 * preferred production deployment mode. This is a deliberate remote-site
 * architecture choice; keep the URL HTTPS and under Xora's control.
 */
const config: CapacitorConfig = {
  appId: "io.xora.app",
  appName: "XoraTV",
  webDir: "mobile/capacitor-web",
  backgroundColor: "#140F20",
  loggingBehavior: "none",
  server: {
    url: process.env.CAPACITOR_SERVER_URL || "https://xoratv-x.onrender.com",
    cleartext: false,
  },
  android: {
    backgroundColor: "#140F20",
    minWebViewVersion: 60,
    loggingBehavior: "none",
  },
};

export default config;
