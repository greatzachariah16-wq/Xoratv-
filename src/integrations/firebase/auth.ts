import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  type User as FirebaseUser,
  type UserCredential,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./config";
import { getProfile, setProfile, getProfileByUsername } from "./rtdb";
import type { ProfileRecord } from "./types";

interface LocalAccount {
  id: string;
  email: string;
  username: string;
  displayName: string;
  password: string; // Stored for local fallback mode
  photoURL: string | null;
  createdAt: string;
}

const LOCAL_ACCOUNTS_KEY = "xora_local_accounts";

function getLocalAccounts(): LocalAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalAccount(account: LocalAccount): void {
  if (typeof window === "undefined") return;
  try {
    const accounts = getLocalAccounts().filter(
      (a) =>
        a.email.toLowerCase() !== account.email.toLowerCase() &&
        a.username.toLowerCase() !== account.username.toLowerCase(),
    );
    accounts.push(account);
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (err) {
    console.warn("[Auth] Failed to store local account backup:", err);
  }
}

export function findLocalAccount(identifier: string): LocalAccount | null {
  const clean = identifier.trim().toLowerCase().replace(/^@/, "");
  const accounts = getLocalAccounts();
  return (
    accounts.find((a) => a.email.toLowerCase() === clean || a.username.toLowerCase() === clean) ||
    null
  );
}

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
      return "This domain is not authorized in Firebase Auth. Add it to Authorized Domains in Firebase Console > Authentication > Settings.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Invalid credentials. Please check your email/username and password, or use 'Forgot Password'.";
    case "auth/user-not-found":
      return "No account found with these credentials. Please check your details or create an account.";
    case "auth/email-already-in-use":
      return "This email is already registered. Please sign in instead.";
    case "auth/weak-password":
      return "Password should be at least 6 characters long.";
    case "auth/invalid-email":
      return "Please enter a valid email address or registered username.";
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
 * Derives a clean username from an email address (e.g. ericgreat668@gmail.com -> ericgreat).
 * Extracts the email prefix before '@', strips special characters and trailing digits.
 */
export function extractUsernameFromEmail(email: string): string {
  const prefix = email.trim().toLowerCase().split("@")[0] || "user";
  const clean = prefix.replace(/[^a-z0-9_]/g, "");
  // Strip trailing numbers (e.g. ericgreat668 -> ericgreat)
  const withoutTrailingDigits = clean.replace(/\d+$/, "");
  if (withoutTrailingDigits.length >= 3) {
    return withoutTrailingDigits.slice(0, 24);
  }
  // If stripping digits makes it too short (e.g. ab123 -> ab), keep digits
  if (clean.length >= 3) {
    return clean.slice(0, 24);
  }
  // If still too short, pad or fallback
  return clean.length > 0 ? clean.padEnd(3, "0").slice(0, 24) : "user";
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
  if (existing) {
    if (!existing.email && fbUser.email) {
      existing.email = fbUser.email.toLowerCase();
      await setProfile(existing).catch(() => {});
    }
    return existing;
  }

  // Derive candidate handle
  const rawCandidate =
    preferredUsername ||
    fbUser.displayName ||
    (fbUser.email ? extractUsernameFromEmail(fbUser.email) : null) ||
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
    email: fbUser.email ? fbUser.email.toLowerCase() : null,
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
 * Signs up a new user with Email and Password, automatically deriving username from email
 * (e.g. ericgreat668@gmail.com -> ericgreat) or using an optional custom handle.
 */
export async function signUpWithEmail(
  email: string,
  pass: string,
  username?: string,
): Promise<ProfileRecord> {
  const cleanEmail = email.trim().toLowerCase();
  const rawHandle = username?.trim() || extractUsernameFromEmail(cleanEmail);
  let cleanUsername = normalizeUsername(rawHandle);
  if (cleanUsername.length < 3) {
    cleanUsername = extractUsernameFromEmail(cleanEmail);
  }

  // Pre-check handle availability in RTDB
  const existing = await getProfileByUsername(cleanUsername);
  if (existing) {
    if (username && username.trim()) {
      throw new Error(`Username @${cleanUsername} is already taken. Please choose another.`);
    } else {
      // If auto-derived username is taken, append unique random suffix
      cleanUsername = `${cleanUsername.slice(0, 18)}_${Math.floor(100 + Math.random() * 900)}`;
    }
  }

  // Save local account backup
  const localAccount: LocalAccount = {
    id: "user-" + Date.now(),
    email: cleanEmail,
    username: cleanUsername,
    displayName: cleanUsername,
    password: pass,
    photoURL: null,
    createdAt: new Date().toISOString(),
  };
  saveLocalAccount(localAccount);

  if (!isFirebaseConfigured()) {
    const profileRecord: ProfileRecord = {
      id: localAccount.id,
      username: cleanUsername,
      email: cleanEmail,
      display_name: cleanUsername,
      avatar_url:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      bio: "Horror cinephile on Xora.",
      website: null,
      location: null,
      is_admin: false,
      created_at: new Date().toISOString(),
    };
    localStorage.setItem(
      "xora_demo_user",
      JSON.stringify({
        user: {
          id: profileRecord.id,
          email: profileRecord.email,
          displayName: profileRecord.display_name,
          photoURL: profileRecord.avatar_url,
        },
      }),
    );
    return profileRecord;
  }

  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
  await updateProfile(cred.user, { displayName: cleanUsername }).catch(() => {});

  const profileRecord: ProfileRecord = {
    id: cred.user.uid,
    username: cleanUsername,
    email: cleanEmail,
    display_name: cleanUsername,
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
 * Signs in an existing user with Email or Username and Password,
 * automatically resolving usernames to their email addresses.
 */
export async function signInWithIdentifier(
  identifier: string,
  pass: string,
): Promise<ProfileRecord> {
  const clean = identifier.trim();
  if (!clean) {
    throw new Error("Please enter your email address or username.");
  }

  let targetEmail = clean.toLowerCase();

  // If user entered a username instead of an email (e.g. "ericgreat" or "@ericgreat")
  if (!clean.includes("@")) {
    const handle = clean.replace(/^@/, "").toLowerCase();
    // 1. Try resolving in RTDB
    try {
      const profile = await getProfileByUsername(handle);
      if (profile && profile.email) {
        targetEmail = profile.email.toLowerCase();
      }
    } catch {
      // RTDB lookup fallback
    }

    // 2. Check local accounts store
    if (targetEmail === clean.toLowerCase()) {
      const localAcc = findLocalAccount(handle);
      if (localAcc) {
        targetEmail = localAcc.email.toLowerCase();
      }
    }
  }

  // If Firebase is NOT configured or offline fallback
  if (!isFirebaseConfigured()) {
    const localAcc = findLocalAccount(clean);
    if (!localAcc) {
      throw new Error("No account found with this email/username. Please create an account first.");
    }
    if (localAcc.password !== pass) {
      throw new Error("Incorrect password. Please verify your credentials.");
    }
    const profileRecord: ProfileRecord = {
      id: localAcc.id,
      username: localAcc.username,
      email: localAcc.email,
      display_name: localAcc.displayName,
      avatar_url:
        localAcc.photoURL ||
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      bio: "Horror cinephile on Xora.",
      created_at: localAcc.createdAt,
    };
    localStorage.setItem(
      "xora_demo_user",
      JSON.stringify({
        user: {
          id: profileRecord.id,
          email: profileRecord.email,
          displayName: profileRecord.display_name,
          photoURL: profileRecord.avatar_url,
        },
      }),
    );
    return profileRecord;
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, targetEmail, pass);
    return await ensureProfileExists(cred.user);
  } catch (err: unknown) {
    // If Firebase sign-in failed but local credentials match
    const localAcc = findLocalAccount(clean);
    if (localAcc && localAcc.password === pass) {
      const profileRecord: ProfileRecord = {
        id: localAcc.id,
        username: localAcc.username,
        email: localAcc.email,
        display_name: localAcc.displayName,
        avatar_url:
          localAcc.photoURL ||
          "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        bio: "Horror cinephile on Xora.",
        created_at: localAcc.createdAt,
      };
      localStorage.setItem(
        "xora_demo_user",
        JSON.stringify({
          user: {
            id: profileRecord.id,
            email: profileRecord.email,
            displayName: profileRecord.display_name,
            photoURL: profileRecord.avatar_url,
          },
        }),
      );
      return profileRecord;
    }
    throw err;
  }
}

/**
 * Legacy compatibility alias for signInWithEmail
 */
export async function signInWithEmail(email: string, pass: string): Promise<ProfileRecord> {
  return signInWithIdentifier(email, pass);
}

/**
 * Sends a password reset email to the user's email address.
 */
export async function sendPasswordReset(identifier: string): Promise<string> {
  const clean = identifier.trim();
  if (!clean) {
    throw new Error("Please enter your email or username.");
  }
  let targetEmail = clean.toLowerCase();

  if (!clean.includes("@")) {
    const handle = clean.replace(/^@/, "").toLowerCase();
    try {
      const profile = await getProfileByUsername(handle);
      if (profile && profile.email) {
        targetEmail = profile.email.toLowerCase();
      }
    } catch {
      // Ignore lookup error
    }

    if (targetEmail === clean.toLowerCase()) {
      const localAcc = findLocalAccount(handle);
      if (localAcc) {
        targetEmail = localAcc.email.toLowerCase();
      }
    }
  }

  if (isFirebaseConfigured()) {
    await sendPasswordResetEmail(auth, targetEmail);
    return targetEmail;
  }

  return targetEmail;
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
