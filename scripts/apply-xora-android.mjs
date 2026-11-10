import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidRoot = path.join(root, "android");
const splashRoot = path.join(root, "mobile/capacitor-android/splash");
const appMain = path.join(androidRoot, "app/src/main");
const appRes = path.join(appMain, "res");

if (!fs.existsSync(path.join(appMain, "AndroidManifest.xml"))) {
  throw new Error("Android project not found. Run 'npm run cap:add:android' first.");
}

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, destinationPath);
    else fs.copyFileSync(sourcePath, destinationPath);
  }
}

copyDirectory(path.join(splashRoot, "res"), appRes);

const javaDestination = path.join(appMain, "java/io/xora/app");
fs.mkdirSync(javaDestination, { recursive: true });
for (const name of [
  "MainActivity.java",
  "XoraStartupPlugin.java",
  "XoraVlcPlugin.java",
  "LocalHlsProxy.java",
]) {
  fs.copyFileSync(
    path.join(splashRoot, "java/io/xora/app", name),
    path.join(javaDestination, name),
  );
}

const manifestPath = path.join(appMain, "AndroidManifest.xml");
let manifest = fs.readFileSync(manifestPath, "utf8");
manifest = manifest
  .replace(/android:icon="[^"]+"/, 'android:icon="@mipmap/xora_launcher"')
  .replace(/android:roundIcon="[^"]+"/, 'android:roundIcon="@mipmap/xora_launcher"');
if (!manifest.includes('android:roundIcon="@mipmap/xora_launcher"')) {
  manifest = manifest.replace(
    /<application\b/,
    '<application android:roundIcon="@mipmap/xora_launcher"',
  );
}
manifest = manifest
  .replace(
    'android:theme="@style/AppTheme.NoActionBarLaunch"',
    'android:theme="@style/Theme.Xora.Launch"',
  )
  .replace('android:theme="@style/AppTheme"', 'android:theme="@style/Theme.Xora"');
// Enable Android's native picture-in-picture action for the inline LibVLC surface.
const mainActivityTag = /<activity\b(?=[^>]*android:name="[^"]*MainActivity")[^>]*>/;
if (mainActivityTag.test(manifest)) {
  manifest = manifest.replace(mainActivityTag, (tag) => {
    let updated = tag;
    if (!updated.includes("android:supportsPictureInPicture=")) {
      updated = updated.replace(/>$/, ' android:supportsPictureInPicture="true">');
    }
    const requiredConfigChanges = [
      "orientation",
      "screenSize",
      "keyboardHidden",
      "smallestScreenSize",
      "screenLayout",
      "uiMode",
    ];
    const configChangesMatch = updated.match(/android:configChanges="([^"]*)"/);
    const mergedConfigChanges = new Set([
      ...(configChangesMatch ? configChangesMatch[1].split("|") : []),
      ...requiredConfigChanges,
    ]);
    const configChangesValue =
      `android:configChanges="${Array.from(mergedConfigChanges).join("|")}"`;
    if (configChangesMatch) {
      updated = updated.replace(configChangesMatch[0], configChangesValue);
    } else {
      updated = updated.replace(/>$/, " " + configChangesValue + ">");
    }
    return updated;
  });
}
manifest = manifest.replace(
  /<application\b(?![^>]*android:resizeableActivity=)/,
  '<application android:resizeableActivity="true"',
);

// The native Live TV plugin reads ConnectivityManager state and registers a
// default-network callback, which requires ACCESS_NETWORK_STATE at runtime.
for (const permission of [
  "android.permission.INTERNET",
  "android.permission.ACCESS_NETWORK_STATE",
]) {
  if (!manifest.includes(permission)) {
    manifest = manifest.replace(
      "</manifest>",
      `    <uses-permission android:name="${permission}" />\n</manifest>`,
    );
  }
}
// The live player is an inline native view over the WebView, not a separate Activity.
manifest = manifest.replace(
  /\s*<activity\b(?=[^>]*android:name="io\.xora\.app\.XoraVlcActivity")[^>]*\/>\s*/g,
  "\n",
);
const legacyPlayerActivity = path.join(javaDestination, "XoraVlcActivity.java");
if (fs.existsSync(legacyPlayerActivity)) fs.unlinkSync(legacyPlayerActivity);
fs.writeFileSync(manifestPath, manifest);

const stringsPath = path.join(appRes, "values/strings.xml");
if (fs.existsSync(stringsPath)) {
  let strings = fs.readFileSync(stringsPath, "utf8");
  strings = strings.replace(
    /<string name="app_name">[^<]*<\/string>/,
    '<string name="app_name">XoraTV</string>',
  );
  fs.writeFileSync(stringsPath, strings);
}

const appGradlePath = path.join(androidRoot, "app/build.gradle");
let appGradle = fs.readFileSync(appGradlePath, "utf8");
// The Java package, Android namespace, application ID and relative manifest
// activity name must agree so Android can launch io.xora.app.MainActivity.
appGradle = appGradle
  .replace(/namespace\s*=\s*"[^"]+"/, 'namespace = "io.xora.app"')
  .replace(/applicationId\s+"[^"]+"/, 'applicationId "io.xora.app"');
if (
  !appGradle.includes('namespace = "io.xora.app"') ||
  !appGradle.includes('applicationId "io.xora.app"')
) {
  throw new Error("Could not apply Xora Android namespace/applicationId to app/build.gradle.");
}
// Keep every LibVLC ABI supplied by the official full artifact. Do not filter architectures.
appGradle = appGradle.replace(/\s*ndk\s*\{\s*abiFilters[^}]*\}/, "");
if (!appGradle.includes("libvlc-all")) {
  appGradle = appGradle.replace(
    "dependencies {",
    'dependencies {\n    implementation "org.videolan.android:libvlc-all:3.7.7"',
  );
}
if (!appGradle.includes("com.squareup.okhttp3:okhttp")) {
  appGradle = appGradle.replace(
    "dependencies {",
    'dependencies {\n    implementation "com.squareup.okhttp3:okhttp:4.12.0"',
  );
}
if (!appGradle.includes("org.nanohttpd:nanohttpd")) {
  appGradle = appGradle.replace(
    "dependencies {",
    'dependencies {\n    implementation "org.nanohttpd:nanohttpd:2.3.1"',
  );
}
if (!appGradle.includes("core-splashscreen")) {
  appGradle = appGradle.replace(
    "dependencies {",
    'dependencies {\n    implementation "androidx.core:core-splashscreen:$coreSplashScreenVersion"',
  );
}
fs.writeFileSync(appGradlePath, appGradle);

const variablesPath = path.join(androidRoot, "variables.gradle");
if (fs.existsSync(variablesPath)) {
  let variables = fs.readFileSync(variablesPath, "utf8");
  variables = variables.replace(/minSdkVersion\s*=\s*\d+/, "minSdkVersion = 26");
  fs.writeFileSync(variablesPath, variables);
}

console.log("Xora native splash, startup and inline player applied to android/.");
