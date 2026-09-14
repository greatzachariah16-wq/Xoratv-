import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  type User as FirebaseUser,
  type UserCredential,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./config";
import { getProfile, setProfile, getProfileByUsername } from "./rtdb";
import type { ProfileRecord } from "./types";

/**
 * Maps Firebase Auth error codes to user-friendly error messages.
 */
export function mapAuthError(err: unknown): string {
  if (!err) return "An unknown error occurred.";
  const code = (err as { code?: string })?.code || "";
  const message = err instanceof Error ? err.message : String(err);

  switch (code) {
    case "auth/popup-closed-by-user":
      return "Sign-in popup was closed before completing.";
    case "auth/popup-blocked":
      return "Sign-in popup was blocked by your browser. Please allow popups or use redirect sign-in.";
    case "auth/cancelled-popup-request":
      return "Sign-in request was cancelled.";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with the same email using a different sign-in provider.";
    case "auth/unauthorized-domain":
      return "This domain (xoratv-x.onrender.com) is not authorized in Firebase Auth. Add it to Authorized Domains in Firebase Console > Authentication > Settings.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password. Please check your credentials.";
    case "auth/email-already-in-use":
      return "This email is already registered. Please sign in instead.";
    case "auth/weak-password":
      return "Password should be at least 6 characters long.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection and try again.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Access to this account has been temporarily disabled. Please reset your password or try again later.";
    case "auth/operation-not-allowed":
      return "This sign-in method is not enabled in Firebase Console. Please enable Email/Password or Google under Authentication > Sign-in method.";
    case "auth/user-disabled":
      return "This user account has been disabled.";
    default:
      return message.replace(/^Firebase:\s*/, "");
  }
}

/**
 * Normalizes a raw string into a safe, valid handle:
 * lowercase, alphanumeric and underscores only, trimmed to max 24 chars.
 */
export function normalizeUsername(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
}

/**
 * Ensures an authenticated user has a corresponding ProfileRecord in RTDB (/profiles/{uid} and /usernames/{username}).
 * If missing, derives a unique username and creates a default profile.
 */
export async function ensureProfileExists(
  fbUser: FirebaseUser,
  preferredUsername?: string,
): Promise<ProfileRecord> {
  const existing = await getProfile(fbUser.uid);
  if (existing) return existing;

  // Derive candidate handle
  const rawCandidate =
    preferredUsername ||
    fbUser.displayName ||
    (fbUser.email ? fbUser.email.split("@")[0] : null) ||
    "xora_fan";

  let candidate = normalizeUsername(rawCandidate);
  if (candidate.length < 3) {
    candidate = `user_${Math.floor(1000 + Math.random() * 9000)}`;
  }

  // Ensure handle uniqueness in RTDB /usernames
  let finalUsername = candidate;
  const taken = await getProfileByUsername(finalUsername);
  if (taken && taken.id !== fbUser.uid) {
    finalUsername = `${candidate.slice(0, 18)}_${Math.floor(1000 + Math.random() * 9000)}`;
  }

  const profile: ProfileRecord = {
    id: fbUser.uid,
    username: finalUsername,
    display_name: fbUser.displayName || preferredUsername || finalUsername,
    avatar_url:
      fbUser.photoURL ||
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    bio: "Horror cinephile on Xora.",
    website: null,
    location: null,
    is_admin: false,
    created_at: new Date().toISOString(),
  };

  await setProfile(profile);
  return profile;
}

/**
 * Signs up a new user with Email and Password, sets display name,
 * reserves handle in /usernames, and creates /profiles/{uid} record.
 */
export async function signUpWithEmail(
  email: string,
  pass: string,
  username: string,
): Promise<ProfileRecord> {
  const cleanUsername = normalizeUsername(username);
  if (cleanUsername.length < 3) {
    throw new Error("Username must be at least 3 characters (letters, numbers, underscores).");
  }

  // Pre-check handle availability in RTDB
  const existing = await getProfileByUsername(cleanUsername);
  if (existing) {
    throw new Error(`Username @${cleanUsername} is already taken. Please choose another.`);
  }

  const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  await updateProfile(cred.user, { displayName: username.trim() }).catch(() => {});

  const profileRecord: ProfileRecord = {
    id: cred.user.uid,
    username: cleanUsername,
    display_name: username.trim(),
    avatar_url:
      cred.user.photoURL ||
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    bio: "Horror cinephile on Xora.",
    website: null,
    location: null,
    is_admin: false,
    created_at: new Date().toISOString(),
  };

  await setProfile(profileRecord);
  return profileRecord;
}

/**
 * Signs in an existing user with Email and Password,
 * and ensures their RTDB profile is synchronized.
 */
export async function signInWithEmail(email: string, pass: string): Promise<ProfileRecord> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
  return await ensureProfileExists(cred.user);
}

/**
 * Signs in with Google using Firebase GoogleAuthProvider.
 * Prefers signInWithPopup on desktop, and falls back to signInWithRedirect for mobile/popup restrictions.
 */
export async function signInWithGoogle(): Promise<{
  credential?: UserCredential;
  profile?: ProfileRecord;
  redirected?: boolean;
}> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account",
  });

  const isMobile =
    typeof navigator !== "undefined" &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobile) {
    await signInWithRedirect(auth, provider);
    return { redirected: true };
  }

  try {
    const cred = await signInWithPopup(auth, provider);
    const profile = await ensureProfileExists(cred.user);
    return { credential: cred, profile };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
      // Fall back to redirect if popup is blocked by browser
      await signInWithRedirect(auth, provider);
      return { redirected: true };
    }
    throw err;
  }
}

/**
 * Checks for any pending Google redirect result on page load/mount.
 */
export async function checkRedirectAuthResult(): Promise<ProfileRecord | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      return await ensureProfileExists(result.user);
    }
  } catch (err) {
    console.error("[Auth] Redirect sign-in result error:", err);
    throw err;
  }
  return null;
}

/**
 * Signs out the current user from Firebase Auth or demo session.
 */
export async function signOutCurrentUser(): Promise<void> {
  if (isFirebaseConfigured()) {
    await firebaseSignOut(auth);
  } else {
    localStorage.removeItem("xora_demo_user");
  }
}
