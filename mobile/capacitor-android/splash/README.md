# Xora Android native splash kit

This is a reusable native splash/loading layer for the Capacitor Android shell. Xora is a web-first product with a Capacitor 8 Android shell. The same live XoraTV website is loaded inside the Android WebView, while the browser website and PWA remain fully supported. The startup handshake is a no-op in ordinary browsers and the installed PWA.

## Design

The splash is deliberately split into two layers:

1. **OS launch splash:** warm Xora cream background with a crisp Xora play mark. Android 12+ renders this using the system splash API; Android 6–11 use AndroidX compatibility support.
2. **Xora loading screen:** the existing warm XoraTV cream background is retained. A single bold X sits fixed in the centre, with three small clay dots bouncing one after another directly beneath it. This second screen uses a native Android adaptation of SpinKit's lightweight transform-and-opacity animation approach, shaped into the requested Facebook-style three-dot bounce. The animation is local, dependency-free and suitable for Android 8.1. The status and retry controls remain below the animation.
3. **Retry state:** after 50 seconds the loading view explains that the connection is taking longer than usual and shows a Retry button. When the React app hydrates, the website calls XoraStartup.ready() and the native overlay fades away.

The animation uses Android property animators rather than loading a remote asset, video, Lottie file, or JavaScript animation runtime. The original OS launch splash remains unchanged.

## Animation reference and licence

SpinKit is an MIT-licensed collection of CSS loading indicators. Xora adapts its lightweight transform/opacity animation technique to native Android property animators; no SpinKit source file or runtime dependency is bundled.

- SpinKit source and MIT licence: https://github.com/tobiasahlin/SpinKit

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

The template's MainActivity registers XoraStartupPlugin before the Capacitor bridge is created. Copy web/xora-startup.ts into src/lib/native-startup.ts after @capacitor/core is installed, then call notifyNativeShellReady() from a useEffect in RootComponent. The wrapper uses Capacitor's supported registerPlugin() API (not the removed legacy Capacitor.Plugins registry), checks Capacitor.isNativePlatform(), and ensures normal website and PWA users do nothing.

### Important remote-site note

This kit handles the startup visuals and readiness handshake only. It does not configure the production WebView URL. Capacitor documents server.url as a live-reload/development setting, not as its preferred production deployment strategy; Xora intentionally sets server.url to the live Render origin because the requested Android app loads the live website remotely. Keep the URL HTTPS and under Xora's control. The more hardened long-term architecture is a locally bundled web shell with Render retained as the backend/API service.
