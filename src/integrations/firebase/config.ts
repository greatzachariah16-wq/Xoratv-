import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
import { getAuth, type Auth } from "firebase/auth";

export const DEFAULT_FIREBASE_DATABASE_URL = "https://xora-tv-default-rtdb.firebaseio.com";

/**
 * Firebase Configuration for Xora TV Metadata & Auth.
 * Uses Firebase Realtime Database (RTDB) as the primary and only metadata database.
 */
function parseFirebaseEnv() {
  const clean = (val?: string): string => {
    if (!val) return "";
    return val.replace(/^[",'\s]+|[",';\s]+$/g, "").trim();
  };

  const rawKey =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_API_KEY) || "";

  // If user pasted the whole `const firebaseConfig = { ... }` or JSON snippet into VITE_FIREBASE_API_KEY
  const extractField = (fieldName: string): string | undefined => {
    const regex = new RegExp(`${fieldName}["']?\\s*:\\s*["']([^"']+)["']`);
    const match = rawKey.match(regex);
    return match ? clean(match[1]) : undefined;
  };

  const parsedApiKey = extractField("apiKey") || clean(rawKey);
  const parsedAuthDomain = extractField("authDomain");
  const parsedProjectId = extractField("projectId");
  const parsedStorageBucket = extractField("storageBucket");
  const parsedMessagingSenderId = extractField("messagingSenderId");
  const parsedAppId = extractField("appId");
  const parsedDatabaseUrl = extractField("databaseURL");

  const databaseURL =
    clean(typeof import.meta !== "undefined" ? import.meta.env?.VITE_FIREBASE_DATABASE_URL : "") ||
    parsedDatabaseUrl ||
    DEFAULT_FIREBASE_DATABASE_URL;

  return {
    apiKey: parsedApiKey || "AIzaSyAPtmWP9CPeSLLqu4HEW_JVe61axsn0IJc",
    authDomain:
      clean(typeof import.meta !== "undefined" ? import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN : "") ||
      parsedAuthDomain ||
      "xora-tv.firebaseapp.com",
    projectId:
      clean(typeof import.meta !== "undefined" ? import.meta.env?.VITE_FIREBASE_PROJECT_ID : "") ||
      parsedProjectId ||
      "xora-tv",
    databaseURL,
    storageBucket:
      clean(
        typeof import.meta !== "undefined" ? import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET : "",
      ) ||
      parsedStorageBucket ||
      "xora-tv.firebasestorage.app",
    messagingSenderId:
      clean(
        typeof import.meta !== "undefined"
          ? import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID
          : "",
      ) ||
      parsedMessagingSenderId ||
      "977340710920",
    appId:
      clean(typeof import.meta !== "undefined" ? import.meta.env?.VITE_FIREBASE_APP_ID : "") ||
      parsedAppId ||
      "1:977340710920:web:f567f6ced49ea56e05d1bd",
  };
}

export const firebaseConfig = parseFirebaseEnv();

export const isFirebaseConfigured = (): boolean => {
  const key = firebaseConfig.apiKey;
  const dbUrl = firebaseConfig.databaseURL;
  const hasValidKey = Boolean(
    key && !key.includes("Dummy") && !key.includes("Placeholder") && key.startsWith("AIzaSy"),
  );
  const hasValidDbUrl = Boolean(
    dbUrl &&
    /^https:\/\/[a-z0-9-]+(\.firebasedatabase\.app|\.firebaseio\.com)\/?$/i.test(dbUrl.trim()),
  );
  return hasValidKey && hasValidDbUrl;
};

let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

export const rtdb: Database = getDatabase(app);
export const auth: Auth = getAuth(app);
export { app };
