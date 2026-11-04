# Xora Android native splash kit

This is a reusable native splash/loading layer for the Capacitor Android shell. Xora is a web-first product with a Capacitor 8 Android shell. The same live XoraTV website is loaded inside the Android WebView, while the browser website and PWA remain fully supported. The startup handshake is a no-op in ordinary browsers and the installed PWA.

## Design

The splash is deliberately split into two layers:

1. **OS launch splash:** warm Xora cream background with a crisp Xora play mark. Android 12+ renders this using the system splash API; Android 6–11 use AndroidX compatibility support.
2. **Xora loading screen:** a full-screen midnight-plum / soft-violet view with a slowly rotating orbit, XORA wordmark, progress bar and connection message. It remains visible while the WebView loads the website. At 1.1 seconds the OS launch splash is released, so a sleeping Render service cannot hold the Android system splash indefinitely.
3. **Retry state:** after 50 seconds the loading view explains that the connection is taking longer than usual and shows a Retry button. When the React app hydrates, the website calls XoraStartup.ready() and the native overlay fades away.

The look is lightweight: XML vector/shape drawables and Android property animation, with no Lottie, video, remote image, or extra animation library. It is suitable for the user's Android 8.1 device and newer Android versions.

## Native files

Copy the contents of this folder into the matching paths in the generated Capacitor Android project:

- res/values/colors.xml → android/app/src/main/res/values/colors.xml
- res/values/styles.xml → android/app/src/main/res/values/styles.xml (merge the styles; do not overwrite unrelated app styles)
- res/drawable/* → android/app/src/main/res/drawable/
- res/layout/xora_startup_overlay.xml → android/app/src/main/res/layout/
- java/io/xora/app/MainActivity.java and XoraStartupPlugin.java → android/app/src/main/java/io/xora/app/

The template uses package/application ID io.xora.app. Change the Java package and Android namespace together if the final Xora application ID differs.

### Gradle dependency

In android/app/build.gradle, ensure the AndroidX SplashScreen compatibility library is present:

~~~gradle
dependencies {
    implementation "androidx.core:core-splashscreen:1.0.1"
}
~~~

If the generated Capacitor Android project already includes a compatible version, keep its existing version instead of adding a duplicate.

### Theme and manifest

Merge the styles from res/values/styles.xml into the generated styles file. In AndroidManifest.xml, add the Internet permission and apply the launch theme to the launcher activity:

~~~xml
<uses-permission android:name="android.permission.INTERNET" />

<application android:theme="@style/Theme.Xora">
    <activity
        android:name="io.xora.app.MainActivity"
        android:exported="true"
        android:launchMode="singleTask"
        android:theme="@style/Theme.Xora.Launch">
        <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent-filter>
    </activity>
</application>
~~~

Keep the app's other permissions, activities and manifest attributes.

### Register the native plugin

The template's MainActivity registers XoraStartupPlugin before the Capacitor bridge is created. Copy web/xora-startup.ts into src/lib/native-startup.ts after @capacitor/core is installed, then call notifyNativeShellReady() from a useEffect in RootComponent. The wrapper uses Capacitor's supported registerPlugin() API and checks Capacitor.isNativePlatform(), so normal website and PWA users do nothing.

### Website-side bridge hook

The web-side module is included at web/xora-startup.ts. It uses @capacitor/core's registerPlugin() API (not the removed legacy Capacitor.Plugins registry). The bridge is now installed in src/lib/native-startup.ts and RootComponent calls it after hydration.

### Important remote-site note

This kit handles the startup visuals and readiness handshake only. It does not configure the production WebView URL. Capacitor documents server.url as a live-reload/development setting, not a production deployment strategy; Xora intentionally sets server.url to the live Render origin because the requested Android app loads the live website remotely. Capacitor documents this option as intended for live reload, not as its preferred production deployment mode. This is a deliberate architecture trade-off: keep the URL HTTPS and under Xora's control, do not add broad navigation allowlists, and treat XSS on the hosted site as a native-app security risk. The more hardened long-term architecture is a locally bundled web shell with Render retained as the backend/API service.

## References used

- Android platform splash-screen guide: https://developer.android.com/develop/ui/views/launch/splash-screen
- Capacitor Splash Screen plugin: https://github.com/ionic-team/capacitor-plugins/tree/main/splash-screen
- Capacitor splash-screen asset generation: https://capacitorjs.com/docs/guides/splash-screens-and-icons
