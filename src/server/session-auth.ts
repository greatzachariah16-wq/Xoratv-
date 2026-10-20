import { createHash } from "node:crypto";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ygifyoaraxtwixbyranq.supabase.co").replace(/\/$/, "");
const DB_KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const COOKIE = "xora_session";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  if (!DB_KEY) return null;
  const rawCookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(COOKIE + "="));
  if (!rawCookie) return null;
  let raw = rawCookie.slice(COOKIE.length + 1);
  try { raw = decodeURIComponent(raw); } catch { return null; }
  if (!raw) return null;

  const headers = { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}` };
  const sessionsResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/xora_auth_sessions?token_hash=eq.${hash(raw)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id&limit=1`,
    { headers, signal: AbortSignal.timeout(10000) },
  );
  if (!sessionsResponse.ok) return null;
  const sessions = await sessionsResponse.json() as Array<{ user_id?: string }>;
  const userId = sessions[0]?.user_id;
  if (!userId) return null;

  const accountResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/xora_auth_accounts?id=eq.${encodeURIComponent(userId)}&disabled_at=is.null&select=id&limit=1`,
    { headers, signal: AbortSignal.timeout(10000) },
  );
  if (!accountResponse.ok) return null;
  const accounts = await accountResponse.json() as Array<{ id?: string }>;
  return accounts[0]?.id || null;
}
