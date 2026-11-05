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
for (const name of ["MainActivity.java", "XoraStartupPlugin.java", "XoraVlcPlugin.java", "XoraVlcActivity.java"]) {
  fs.copyFileSync(path.join(splashRoot, "java/io/xora/app", name), path.join(javaDestination, name));
}

const manifestPath = path.join(appMain, "AndroidManifest.xml");
let manifest = fs.readFileSync(manifestPath, "utf8");
manifest = manifest
  .replace('android:theme="@style/AppTheme.NoActionBarLaunch"', 'android:theme="@style/Theme.Xora.Launch"')
  .replace('android:theme="@style/AppTheme"', 'android:theme="@style/Theme.Xora"');
if (!manifest.includes("android.permission.INTERNET")) {
  manifest = manifest.replace("</manifest>", '    <uses-permission android:name="android.permission.INTERNET" />\n</manifest>');
}
if (!manifest.includes("io.xora.app.XoraVlcActivity")) {
  manifest = manifest.replace(
    "</application>",
    '        <activity android:name="io.xora.app.XoraVlcActivity" android:exported="false" android:configChanges="orientation|screenSize|keyboardHidden" />\n    </application>',
  );
}
fs.writeFileSync(manifestPath, manifest);

const stringsPath = path.join(appRes, "values/strings.xml");
if (fs.existsSync(stringsPath)) {
  let strings = fs.readFileSync(stringsPath, "utf8");
  strings = strings.replace(/<string name="app_name">[^<]*<\/string>/, '<string name="app_name">XoraTV</string>');
  fs.writeFileSync(stringsPath, strings);
}

const appGradlePath = path.join(androidRoot, "app/build.gradle");
let appGradle = fs.readFileSync(appGradlePath, "utf8");
// The Java package, Android namespace, application ID and relative manifest
// activity name must agree so Android can launch io.xora.app.MainActivity.
appGradle = appGradle
  .replace(/namespace\s*=\s*"[^"]+"/, 'namespace = "io.xora.app"')
  .replace(/applicationId\s+"[^"]+"/, 'applicationId "io.xora.app"');
if (!appGradle.includes('namespace = "io.xora.app"') || !appGradle.includes('applicationId "io.xora.app"')) {
  throw new Error("Could not apply Xora Android namespace/applicationId to app/build.gradle.");
}
if (!appGradle.includes('abiFilters "arm64-v8a", "armeabi-v7a"')) {
  appGradle = appGradle.replace(
    /defaultConfig\s*\{/,
    'defaultConfig {\n        ndk { abiFilters "arm64-v8a", "armeabi-v7a" }',
  );
}
if (!appGradle.includes("libvlc-all")) {
  appGradle = appGradle.replace(
    "dependencies {",
    'dependencies {\n    implementation "org.videolan.android:libvlc-all:3.7.7"',
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

console.log("Xora native splash and startup bridge applied to android/.");
