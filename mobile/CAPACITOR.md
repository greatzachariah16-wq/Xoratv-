# Xora Android Capacitor setup

XoraTV uses Capacitor 8.6.0 for its Android shell while keeping the existing web app and PWA fully supported.

## Install and prepare the Android shell

```bash
npm install
npm run cap:add:android
```

The first command installs @capacitor/core, @capacitor/android and the Capacitor CLI. The second generates the native Android project and applies Xora's native splash screen, Java plugin, theme and manifest settings.

For later web/Capacitor updates:

```bash
npm run cap:sync:android
npm run cap:open:android
```

Build a local debug APK (requires Android SDK and JDK 21):

```bash
npm run android:debug
```

A GitHub Actions workflow also generates the Android project, builds a debug APK and uploads it as a test artifact.

## Remote website loading

The Android shell loads `https://xoratv-x.onrender.com` through Capacitor's WebView. This keeps one live web app for website, PWA and Android users. The native loading screen appears immediately and waits until the web app hydrates. It changes status after 6.5 seconds and shows Retry after 50 seconds. The native overlay stays visible until the app signals readiness.

**Architecture note:** Capacitor officially describes `server.url` as intended for live reload, not its preferred production deployment mode. Xora is deliberately using it to satisfy the requested remote-live-website approach. The hosted website therefore has access to the native Capacitor bridge. Protect the Xora origin, keep HTTPS, avoid broad navigation allowlists and fix XSS vulnerabilities promptly. The hardened long-term architecture is a locally bundled web shell with Render retained as the backend/API service.

## Splash timing

- Android's OS launch splash is released after about 1.1 seconds.
- Xora's native loading overlay remains above the WebView.
- At 6.5 seconds, the message explains that the server may be waking up.
- At 50 seconds, a Retry button appears.
- When the root React app hydrates, it calls the native `XoraStartup.ready()` plugin and the overlay fades away.

Capacitor's Android target supports Android 8.0+ (API 26+), including Android 8.1 / API 27.

## References

- Capacitor installation: https://capacitorjs.com/docs/getting-started
- Capacitor configuration and `server.url` warning: https://capacitorjs.com/docs/config
- Android custom native plugins: https://capacitorjs.com/docs/plugins/android
- Capacitor Android requirements: https://capacitorjs.com/docs/android
- AndroidX SplashScreen: https://developer.android.com/develop/ui/views/launch/splash-screen
