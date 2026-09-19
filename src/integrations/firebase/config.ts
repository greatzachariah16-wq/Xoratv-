import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore, doc, getDocFromServer } from "firebase/firestore";
import appletConfig from "../../../firebase-applet-config.json";

export const DEFAULT_FIREBASE_DATABASE_URL = `https://${appletConfig.projectId}-default-rtdb.firebaseio.com`;

/**
 * Live Production Firebase Configuration for Xora TV.
 * Configured with live provisioned Firestore and Auth backend.
 */
function getLiveFirebaseConfig() {
  const clean = (val?: string): string => {
    if (!val) return "";
    return val.replace(/^[",'\s]+|[",';\s]+$/g, "").trim();
  };

  const rawEnvKey =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_API_KEY) || "";

  const apiKey = clean(rawEnvKey) || appletConfig.apiKey;
  const authDomain =
    clean(typeof import.meta !== "undefined" ? import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN : "") ||
    appletConfig.authDomain;
  const projectId =
    clean(typeof import.meta !== "undefined" ? import.meta.env?.VITE_FIREBASE_PROJECT_ID : "") ||
    appletConfig.projectId;
  const storageBucket =
    clean(
      typeof import.meta !== "undefined" ? import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET : "",
    ) || appletConfig.storageBucket;
  const messagingSenderId =
    clean(
      typeof import.meta !== "undefined" ? import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID : "",
    ) || appletConfig.messagingSenderId;
  const appId =
    clean(typeof import.meta !== "undefined" ? import.meta.env?.VITE_FIREBASE_APP_ID : "") ||
    appletConfig.appId;
  const databaseURL =
    clean(typeof import.meta !== "undefined" ? import.meta.env?.VITE_FIREBASE_DATABASE_URL : "") ||
    DEFAULT_FIREBASE_DATABASE_URL;

  return {
    apiKey,
    authDomain,
    projectId,
    databaseURL,
    storageBucket,
    messagingSenderId,
    appId,
    firestoreDatabaseId: appletConfig.firestoreDatabaseId,
  };
}

export const firebaseConfig = getLiveFirebaseConfig();

export const isFirebaseConfigured = (): boolean => {
  const key = firebaseConfig.apiKey;
  return Boolean(
    key &&
    !key.includes("Dummy") &&
    !key.includes("Placeholder") &&
    key.startsWith("AIzaSy") &&
    firebaseConfig.projectId,
  );
};

let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

export const db: Firestore = getFirestore(app, appletConfig.firestoreDatabaseId);
export const rtdb: Database = getDatabase(app);
export const auth: Auth = getAuth(app);
export { app };

// Test Firestore connection on initialization
if (typeof window !== "undefined") {
  getDocFromServer(doc(db, "test", "connection")).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("[Firebase] Client is offline or database initializing:", error.message);
    }
  });
}
