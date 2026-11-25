type CloudflareEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

const COOKIE = "xora_session";

function runtimeValue(env: CloudflareEnv | undefined, key: keyof CloudflareEnv): string {
  const bound = env?.[key];
  if (typeof bound === "string" && bound.trim()) return bound.trim();
  // Render/local compatibility while Cloudflare callers pass Worker bindings.
  const processEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  return processEnv?.[key] || "";
}

async function hash(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Resolves the Xora session using Supabase REST.
 * Worker deployments should pass their environment bindings explicitly;
 * the process.env fallback keeps the existing Render runtime compatible.
 */
export async function getAuthenticatedUserId(
  request: Request,
  env?: CloudflareEnv,
): Promise<string | null> {
  const supabaseUrl = (runtimeValue(env, "SUPABASE_URL") || "https://ygifyoaraxtwixbyranq.supabase.co").replace(/\/$/, "");
  const dbKey = (
    runtimeValue(env, "SUPABASE_SECRET_KEY") ||
    runtimeValue(env, "SUPABASE_SERVICE_ROLE_KEY")
  ).trim();
  if (!dbKey) return null;

  const rawCookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(COOKIE + "="));
  if (!rawCookie) return null;

  let raw = rawCookie.slice(COOKIE.length + 1);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!raw) return null;

  const headers = { apikey: dbKey, Authorization: `Bearer ${dbKey}` };
  const tokenHash = await hash(raw);
  const sessionsResponse = await fetch(
    `${supabaseUrl}/rest/v1/xora_auth_sessions?token_hash=eq.${tokenHash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id&limit=1`,
    { headers, signal: AbortSignal.timeout(10000) },
  );
  if (!sessionsResponse.ok) return null;

  const sessions = (await sessionsResponse.json()) as Array<{ user_id?: string }>;
  const userId = sessions[0]?.user_id;
  if (!userId) return null;

  const accountResponse = await fetch(
    `${supabaseUrl}/rest/v1/xora_auth_accounts?id=eq.${encodeURIComponent(userId)}&disabled_at=is.null&select=id&limit=1`,
    { headers, signal: AbortSignal.timeout(10000) },
  );
  if (!accountResponse.ok) return null;

  const accounts = (await accountResponse.json()) as Array<{ id?: string }>;
  return accounts[0]?.id || null;
}
