import crypto from "node:crypto";

export interface FirebaseAdminStatus {
  configured: boolean;
  hasDbUrl: boolean;
  hasServiceAccount: boolean;
  error?: string;
  code?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export const DEFAULT_FIREBASE_DATABASE_URL = "https://xora-tv-default-rtdb.firebaseio.com";

// Clean and validate database URL
export function getCleanDbUrl(): string {
  const raw =
    process.env.FIREBASE_DATABASE_URL ||
    process.env.VITE_FIREBASE_DATABASE_URL ||
    DEFAULT_FIREBASE_DATABASE_URL;
  return raw
    .trim()
    .replace(/^[",'\\]+|[",';\\]+$/g, "")
    .replace(/\/+$/, "");
}

// Safely parse Firebase Service Account JSON or base64
export function parseServiceAccount(): {
  client_email: string;
  private_key: string;
  token_uri?: string;
} | null {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) return null;

  try {
    let jsonString = raw;
    if (!raw.startsWith("{") && !raw.startsWith("[")) {
      try {
        jsonString = Buffer.from(raw, "base64").toString("utf-8");
      } catch {
        jsonString = raw;
      }
    }
    const parsed = JSON.parse(jsonString);
    if (!parsed.client_email || !parsed.private_key) {
      return null;
    }
    // Normalize newlines in RSA private key (often escaped as \\n in env vars)
    const private_key = parsed.private_key.replace(/\\n/g, "\n");
    return {
      client_email: parsed.client_email,
      private_key,
      token_uri: parsed.token_uri || "https://oauth2.googleapis.com/token",
    };
  } catch (e) {
    console.warn(
      "[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

// Check configuration status without throwing
export function checkFirebaseAdminStatus(): FirebaseAdminStatus {
  const dbUrl = getCleanDbUrl();
  const serviceAccount = parseServiceAccount();

  const hasDbUrl = Boolean(dbUrl);
  const hasServiceAccount = Boolean(serviceAccount);

  if (!hasDbUrl) {
    return {
      configured: false,
      hasDbUrl: false,
      hasServiceAccount: false,
      error: "Firebase Database URL is missing or malformed.",
      code: "FIREBASE_DATABASE_URL_MISSING",
    };
  }

  return {
    configured: true,
    hasDbUrl: true,
    hasServiceAccount,
  };
}

// Get or refresh OAuth2 Access Token for Firebase RTDB
export async function getFirebaseAccessToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  const sa = parseServiceAccount();
  if (!sa) return null;

  try {
    const enc = (x: string) => Buffer.from(x).toString("base64url");
    const header = enc(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = enc(
      JSON.stringify({
        iss: sa.client_email,
        scope:
          "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
        aud: sa.token_uri || "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
    const unsigned = `${header}.${payload}`;
    const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
    const assertion = `${unsigned}.${sig}`;

    const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn("[Firebase Admin] OAuth token exchange failed with HTTP", res.status);
      return null;
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (data.access_token) {
      cachedToken = {
        token: data.access_token,
        expiresAt: now + (data.expires_in || 3600),
      };
      return data.access_token;
    }
    return null;
  } catch (err) {
    console.warn(
      "[Firebase Admin] Error generating access token:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// In-memory fallback cache when Firebase credentials are not yet set
const localStore = new Map<string, unknown>();

export function getLocalStore() {
  return localStore;
}

// Execute RTDB query with graceful fallback
export async function queryRtdb(path: string, init?: RequestInit): Promise<unknown> {
  const base = getCleanDbUrl();
  const cleanPath = path.replace(/^\/+/, "");
  const token = await getFirebaseAccessToken();
  const secret = process.env.FIREBASE_DATABASE_SECRET;

  const readLocalFallback = (targetPath: string) => {
    if (localStore.has(targetPath)) return localStore.get(targetPath);
    const prefix = `${targetPath}/`;
    const coll: Record<string, unknown> = {};
    for (const [k, v] of localStore.entries()) {
      if (k.startsWith(prefix)) {
        coll[k.slice(prefix.length)] = v;
      }
    }
    return Object.keys(coll).length > 0 ? coll : null;
  };

  // If no DB URL, operate locally
  if (!base) {
    if (init?.method === "PUT" && init.body) {
      try {
        const val = JSON.parse(String(init.body));
        localStore.set(cleanPath, val);
        return val;
      } catch {
        return null;
      }
    }
    if (init?.method === "DELETE") {
      localStore.delete(cleanPath);
      const prefix = `${cleanPath}/`;
      for (const k of Array.from(localStore.keys())) {
        if (k.startsWith(prefix)) localStore.delete(k);
      }
      return null;
    }
    return readLocalFallback(cleanPath);
  }

  // Also cache in localStore for lightning-fast reads
  if (init?.method === "PUT" && init.body) {
    try {
      const val = JSON.parse(String(init.body));
      localStore.set(cleanPath, val);
    } catch {
      // ignore json parse error
    }
  } else if (init?.method === "DELETE") {
    localStore.delete(cleanPath);
    const prefix = `${cleanPath}/`;
    for (const k of Array.from(localStore.keys())) {
      if (k.startsWith(prefix)) localStore.delete(k);
    }
  }

  // Build target URL
  let url = `${base}/${cleanPath}.json`;
  if (token) {
    url += `?access_token=${encodeURIComponent(token)}`;
  } else if (secret) {
    url += `?auth=${encodeURIComponent(secret)}`;
  }

  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(12000),
    });

    if (res.status === 401 || res.status === 403) {
      const errText = await res.text().catch(() => "");
      console.warn(`[Firebase RTDB] Auth error HTTP ${res.status} for ${cleanPath}:`, errText);
      // If auth fails, use local fallback instead of crashing
      const fallbackVal = readLocalFallback(cleanPath);
      if (fallbackVal !== null && fallbackVal !== undefined) {
        return fallbackVal;
      }
      throw new Error(
        `Firebase RTDB Permission Denied (HTTP ${res.status}). Verify FIREBASE_SERVICE_ACCOUNT credentials.`,
      );
    }

    if (!res.ok) {
      throw new Error(`Firebase RTDB HTTP ${res.status}`);
    }

    if (res.status === 204) return null;
    return await res.json();
  } catch (e) {
    // If network fails or auth fails and it's a read, attempt fallback
    if (!init || init.method === "GET") {
      const fallbackVal = readLocalFallback(cleanPath);
      if (fallbackVal !== null && fallbackVal !== undefined) {
        return fallbackVal;
      }
    }
    if (init?.method === "PUT" || init?.method === "DELETE") {
      return null;
    }
    throw e;
  }
}

// Dual-read & dual-write for xseries / xseris standardization
export async function xseriesDbRead(suffix: string): Promise<unknown> {
  const cleanSuffix = suffix.replace(/^\/+/, "");
  try {
    // Try xseries first
    const primary = await queryRtdb(`xseries/${cleanSuffix}`);
    if (primary !== null && primary !== undefined) {
      return primary;
    }
    // Fall back to xseris
    const legacy = await queryRtdb(`xseris/${cleanSuffix}`);
    return legacy;
  } catch (err) {
    // Try fallback
    const legacy = await queryRtdb(`xseris/${cleanSuffix}`).catch(() => null);
    if (legacy !== null && legacy !== undefined) return legacy;

    // Check localStore directly
    if (localStore.has(`xseries/${cleanSuffix}`)) return localStore.get(`xseries/${cleanSuffix}`);
    if (localStore.has(`xseris/${cleanSuffix}`)) return localStore.get(`xseris/${cleanSuffix}`);

    const prefix1 = `xseries/${cleanSuffix}/`;
    const prefix2 = `xseris/${cleanSuffix}/`;
    const aggregated: Record<string, unknown> = {};
    for (const [k, v] of localStore.entries()) {
      if (k.startsWith(prefix1)) aggregated[k.slice(prefix1.length)] = v;
      else if (k.startsWith(prefix2)) aggregated[k.slice(prefix2.length)] = v;
    }
    if (Object.keys(aggregated).length > 0) return aggregated;

    throw err;
  }
}

export async function xseriesDbWrite(
  suffix: string,
  data: unknown,
  method: "PUT" | "POST" | "DELETE" = "PUT",
): Promise<void> {
  const cleanSuffix = suffix.replace(/^\/+/, "");
  const body = method !== "DELETE" ? JSON.stringify(data) : undefined;
  const headers = { "Content-Type": "application/json" };

  // Write to both primary xseries and legacy xseris for seamless backward compatibility
  const promises: Promise<unknown>[] = [
    queryRtdb(`xseries/${cleanSuffix}`, { method, headers, body }).catch((err) => {
      console.warn(`[xseries write error: xseries/${cleanSuffix}]`, err);
    }),
    queryRtdb(`xseris/${cleanSuffix}`, { method, headers, body }).catch((err) => {
      console.warn(`[xseries write error: xseris/${cleanSuffix}]`, err);
    }),
  ];

  await Promise.all(promises);
}
