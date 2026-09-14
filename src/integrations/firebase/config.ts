import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getDatabase, type Database } from "firebase/database";
import { getAuth, type Auth } from "firebase/auth";

/**
 * Firebase Configuration for Horror Movie Metadata & Auth.
 * Values can be configured via environment variables or fallbacks.
 */
function parseFirebaseEnv() {
  const rawKey = import.meta.env.VITE_FIREBASE_API_KEY || "";

  // If user pasted the whole `const firebaseConfig = { ... }` or JSON snippet into VITE_FIREBASE_API_KEY
  const extractField = (fieldName: string): string | undefined => {
    const regex = new RegExp(`${fieldName}["']?\\s*:\\s*["']([^"']+)["']`);
    const match = rawKey.match(regex);
    return match ? match[1] : undefined;
  };

  const parsedApiKey = extractField("apiKey") || rawKey.trim();
  const parsedAuthDomain = extractField("authDomain");
  const parsedProjectId = extractField("projectId");
  const parsedStorageBucket = extractField("storageBucket");
  const parsedMessagingSenderId = extractField("messagingSenderId");
  const parsedAppId = extractField("appId");
  const parsedDatabaseUrl = extractField("databaseURL");

  return {
    apiKey: parsedApiKey || "AIzaSyDummyApiKeyPlaceholderForDevelopment",
    authDomain:
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || parsedAuthDomain || "xora-tv.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || parsedProjectId || "xora-tv",
    databaseURL:
      import.meta.env.VITE_FIREBASE_DATABASE_URL ||
      parsedDatabaseUrl ||
      "https://xora-tv-default-rtdb.firebaseio.com",
    storageBucket:
      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
      parsedStorageBucket ||
      "xora-tv.firebasestorage.app",
    messagingSenderId:
      import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
      parsedMessagingSenderId ||
      "977340710920",
    appId:
      import.meta.env.VITE_FIREBASE_APP_ID ||
      parsedAppId ||
      "1:977340710920:web:f567f6ced49ea56e05d1bd",
  };
}

export const firebaseConfig = parseFirebaseEnv();

export const isFirebaseConfigured = (): boolean => {
  const key = firebaseConfig.apiKey;
  return Boolean(
    key && !key.includes("Dummy") && !key.includes("Placeholder") && key.startsWith("AIzaSy"),
  );
};

let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

export const db: Firestore = getFirestore(app);
export const rtdb: Database = getDatabase(app);
export const auth: Auth = getAuth(app);
export { app };
