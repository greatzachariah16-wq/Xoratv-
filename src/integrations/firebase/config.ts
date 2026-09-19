import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import appletConfig from "../../../firebase-applet-config.json";

export const DEFAULT_FIREBASE_DATABASE_URL = "https://xora-tv-default-rtdb.firebaseio.com";

/**
 * Authoritative Live Production Firebase Configuration for Xora TV.
 * Sourced directly from provisioned firebase-applet-config.json.
 */
function getFirebaseConfig() {
  const clean = (val?: string): string => {
    if (!val) return "";
    return val.replace(/^[",'\s]+|[",';\s]+$/g, "").trim();
  };

  // Allow full override via environment variables (e.g. Render deployments to custom projects like xoratv)
  const envKey =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_API_KEY
      ? clean(import.meta.env.VITE_FIREBASE_API_KEY)
      : "";

  const envAuthDomain =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN
      ? clean(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN)
      : "";

  const envProjectId =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_PROJECT_ID
      ? clean(import.meta.env.VITE_FIREBASE_PROJECT_ID)
      : "";

  const envRtdb =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_DATABASE_URL
      ? clean(import.meta.env.VITE_FIREBASE_DATABASE_URL)
      : "";

  const envStorageBucket =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET
      ? clean(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET)
      : "";

  const envMessagingSenderId =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID
      ? clean(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID)
      : "";

  const envAppId =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_APP_ID
      ? clean(import.meta.env.VITE_FIREBASE_APP_ID)
      : "";

  const apiKey = (envKey.startsWith("AIzaSy") ? envKey : "") || appletConfig.apiKey;
  const projectId = envProjectId || appletConfig.projectId;
  const authDomain = envAuthDomain || appletConfig.authDomain || `${projectId}.firebaseapp.com`;
  const databaseURL =
    envRtdb ||
    (appletConfig as Record<string, string>).databaseURL ||
    DEFAULT_FIREBASE_DATABASE_URL;
  const storageBucket =
    envStorageBucket || appletConfig.storageBucket || `${projectId}.firebasestorage.app`;
  const messagingSenderId = envMessagingSenderId || appletConfig.messagingSenderId;
  const appId = envAppId || appletConfig.appId;

  return {
    apiKey,
    authDomain,
    projectId,
    databaseURL,
    storageBucket,
    messagingSenderId,
    appId,
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

let rtdbInstance: Database;
try {
  rtdbInstance = getDatabase(app, firebaseConfig.databaseURL);
} catch (err) {
  console.warn("[Firebase] Realtime Database init warning:", err);
  rtdbInstance = getDatabase(app);
}
export const rtdb: Database = rtdbInstance;

let authInstance: Auth;
try {
  authInstance = getAuth(app);
} catch (error) {
  console.warn("[Firebase] Auth initialization fallback:", error);
  authInstance = {} as Auth;
}

export const auth: Auth = authInstance;
export { app };
