import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore, doc, getDocFromServer } from "firebase/firestore";
import appletConfig from "../../../firebase-applet-config.json";

export const DEFAULT_FIREBASE_DATABASE_URL = `https://${appletConfig.projectId}-default-rtdb.firebaseio.com`;

/**
 * Authoritative Live Production Firebase Configuration for Xora TV.
 * Sourced directly from provisioned firebase-applet-config.json.
 */
function getFirebaseConfig() {
  const clean = (val?: string): string => {
    if (!val) return "";
    return val.replace(/^[",'\s]+|[",';\s]+$/g, "").trim();
  };

  // Check if environment override has a valid active key for this project
  const envKey =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_API_KEY
      ? clean(import.meta.env.VITE_FIREBASE_API_KEY)
      : "";

  const apiKey = (envKey.startsWith("AIzaSy") ? envKey : "") || appletConfig.apiKey;

  return {
    apiKey,
    authDomain: appletConfig.authDomain || `${appletConfig.projectId}.firebaseapp.com`,
    projectId: appletConfig.projectId,
    databaseURL: DEFAULT_FIREBASE_DATABASE_URL,
    storageBucket: appletConfig.storageBucket,
    messagingSenderId: appletConfig.messagingSenderId,
    appId: appletConfig.appId,
    firestoreDatabaseId: appletConfig.firestoreDatabaseId || "(default)",
  };
}

export const firebaseConfig = getFirebaseConfig();

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

export const db: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const rtdb: Database = getDatabase(app);

let authInstance: Auth;
try {
  authInstance = getAuth(app);
} catch (error) {
  console.warn("[Firebase] Auth initialization fallback:", error);
  authInstance = {} as Auth;
}

export const auth: Auth = authInstance;
export { app };

// Test Firestore connection on initial client boot
if (typeof window !== "undefined" && isFirebaseConfigured()) {
  getDocFromServer(doc(db, "test", "connection")).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("[Firebase] Client is offline or database initializing:", error.message);
    }
  });
}
