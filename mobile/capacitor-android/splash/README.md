# Xora Android native splash kit

This is a reusable native splash/loading layer for the Capacitor Android shell. The current Xora repository is still a web/PWA project, so these Android source files are a drop-in template for the Android project when that shell is generated. The web app now includes a safe startup-ready signal; it is a no-op in Chrome, Firefox and the installed PWA.

## Design

The splash is deliberately split into two layers:

1. **OS launch splash:** warm Xora cream background with a crisp Xora play mark. Android 12+ renders this using the system splash API; Android 6–11 use AndroidX compatibility support.
2. **Xora loading screen:** a full-screen midnight-plum / soft-violet view with a slowly rotating orbit, XORA wordmark, progress bar and connection message. It remains visible while the WebView loads the website. At 1.1 seconds the OS launch splash is released, so a sleeping Render service cannot hold the Android system splash indefinitely.
3. **Retry state:** after 25 seconds the loading view explains that the connection is taking longer than usual and shows a Retry button. When the React app hydrates, the website calls XoraStartup.ready() and the native overlay fades away.

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

The template's MainActivity registers XoraStartupPlugin before the Capacitor bridge is created. The website's src/lib/native-startup.ts calls the plugin after the root React app hydrates. This is intentionally guarded: normal website and PWA users never see a native-only dependency or behavior.

### Important remote-site note

This kit handles the startup visuals and readiness handshake only. It does not configure the production WebView URL. Capacitor documents server.url as a live-reload/development setting, not a production deployment strategy; do not put the Render URL into server.url just to make this splash work. The production remote-site transport must be wired and tested separately before building an APK.

## References used

- Android platform splash-screen guide: https://developer.android.com/develop/ui/views/launch/splash-screen
- Capacitor Splash Screen plugin: https://github.com/ionic-team/capacitor-plugins/tree/main/splash-screen
- Capacitor splash-screen asset generation: https://capacitorjs.com/docs/guides/splash-screens-and-icons
