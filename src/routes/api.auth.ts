import { createFileRoute } from "@tanstack/react-router";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ygifyoaraxtwixbyranq.supabase.co").replace(/\/$/, "");
const DB_KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const COOKIE = "xora_session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80";

type Row = Record<string, any>;
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function token() { return randomBytes(32).toString("base64url"); }
function recoveryCode() { return `XORA-${randomBytes(3).toString("hex").toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`; }
function cookie(value: string, maxAge: number) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function clearCookie() { return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }
function json(body: unknown, status = 200, headers: Record<string,string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff", ...headers } });
}
async function db(path: string, init: RequestInit = {}) {
  if (!DB_KEY) throw new Error("Auth database server key is not configured on the server.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}`,
      "Content-Type":"application/json", ...init.headers
    },
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Auth database request failed (${response.status}): ${body.slice(0,180)}`);
  return body ? JSON.parse(body) : [];
}
async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}
async function passwordMatches(password: string, stored: string) {
  const [scheme, salt, digest] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !digest) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function publicUser(account: Row, profile: Row) {
  return {
    id: account.id, email: account.email, emailVerified: true,
    displayName: profile.display_name, photoURL: profile.avatar_url, profile: { ...profile, email: account.email }
  };
}
function validEmail(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function cleanUsername(value: string) { return value.toLowerCase().trim(); }
async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_FROM_EMAIL?.trim();
  if (!apiKey || !from) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method:"POST", headers:{ Authorization:`Bearer ${apiKey}`, "Content-Type":"application/json" },
    body:JSON.stringify({from,to:[to],subject,html}), signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("Email delivery provider rejected the message.");
  return true;
}
async function issueToken(userId: string, type: "verify_email"|"reset_password", ttl: number) {
  const raw = token();
  await db("xora_auth_tokens", {method:"POST", headers:{Prefer:"return=minimal"}, body:JSON.stringify({
    user_id:userId, token_hash:hash(raw), token_type:type, expires_at:new Date(Date.now()+ttl).toISOString()
  })});
  return raw;
}
async function profileFor(userId: string) {
  const rows = await db(`xora_profiles?id=eq.${encodeURIComponent(userId)}&select=*`);
  return rows[0] || null;
}
async function current(request: Request) {
  const raw = request.headers.get("cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith(COOKIE+"="))?.slice(COOKIE.length+1);
  if (!raw) return null;
  const sessions = await db(`xora_auth_sessions?token_hash=eq.${hash(decodeURIComponent(raw))}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
  if (!sessions[0]) return null;
  const accounts = await db(`xora_auth_accounts?id=eq.${encodeURIComponent(sessions[0].user_id)}&disabled_at=is.null&select=id,email,email_verified_at`);
  if (!accounts[0]) return null;
  const profile = await profileFor(accounts[0].id);
  return profile ? {account:accounts[0],profile} : null;
}
async function createSession(userId: string) {
  const raw = token();
  await db("xora_auth_sessions", {method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({
    user_id:userId, token_hash:hash(raw), expires_at:new Date(Date.now()+SESSION_MS).toISOString()
  })});
  return raw;
}
export const Route = createFileRoute("/api/auth")({
  server: { handlers: { GET: async ({request}) => {
    try {
      const session = await current(request);
      if (!session) return json({ok:true,user:null});
      return json({ok:true,user:publicUser(session.account,session.profile)});
    } catch { return json({ok:false,error:"Authentication service is not configured."},503); }
  }, POST: async ({request}) => {
    let body: Row;
    try { body = await request.json(); } catch { return json({ok:false,error:"Invalid request body."},400); }
    const action = typeof body.action === "string" ? body.action : "";
    try {
      if (action === "register") {
        const email = String(body.email||"").trim().toLowerCase();
        const username = cleanUsername(String(body.username||""));
        const first = String(body.firstName||"").trim().slice(0,80);
        const last = String(body.lastName||"").trim().slice(0,80);
        const password = typeof body.password === "string" ? body.password : "";
        if (!validEmail(email)) return json({ok:false,error:"Enter a valid email address."},400);
        if (!/^[a-z0-9_]{3,24}$/.test(username)) return json({ok:false,error:"Username must be 3–24 characters using letters, numbers or underscores."},400);
        if (!first || !last) return json({ok:false,error:"Enter your first and last name."},400);
        if (password.length < 10 || password.length > 128) return json({ok:false,error:"Password must be 10–128 characters."},400);
        const duplicate = await db(`xora_auth_accounts?email=eq.${encodeURIComponent(email)}&select=id`);
        if (duplicate.length) return json({ok:false,error:"Unable to create account with those details. Check your email or sign in."},409);
        const taken = await db(`xora_profiles?username=eq.${encodeURIComponent(username)}&select=id`);
        if (taken.length) return json({ok:false,error:"That username is already taken."},409);
        const code = recoveryCode();
        const accounts = await db("xora_auth_accounts", {method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({email,password_hash:await passwordHash(password),email_verified_at:new Date().toISOString(),recovery_code_hash:hash(code)})});
        const account = accounts[0];
        if (!account?.id) throw new Error("Account creation failed.");
        try {
          await db("xora_profiles", {method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({
            id:account.id,username,first_name:first,last_name:last,display_name:`${first} ${last}`,avatar_url:AVATAR,bio:""
          })});
          const raw = await createSession(account.id);
          const profile = await profileFor(account.id);
          if (!profile) throw new Error("Account profile creation failed.");
          return json({ok:true,user:publicUser({...account,email_verified_at:new Date().toISOString()},profile),recoveryCode:code,message:"Account created. Save your recovery code now; it cannot be shown again."},201,{"Set-Cookie":cookie(raw,SESSION_MS/1000)});
        } catch (error) {
          await db(`xora_auth_accounts?id=eq.${encodeURIComponent(account.id)}`,{method:"DELETE"});
          throw error;
        }
      }
      if (action === "login") {
        const identifier = String(body.identifier||"").trim().toLowerCase().replace(/^@/,"");
        const password = typeof body.password === "string" ? body.password : "";
        if (!identifier || !password) return json({ok:false,error:"Enter your email or username and password."},400);
        let accounts: Row[] = [];
        if (identifier.includes("@")) accounts = await db(`xora_auth_accounts?email=eq.${encodeURIComponent(identifier)}&disabled_at=is.null&select=id,email,password_hash,email_verified_at,recovery_code_hash`);
        else {
          const profiles = await db(`xora_profiles?username=eq.${encodeURIComponent(identifier)}&select=id`);
          if (profiles[0]) accounts = await db(`xora_auth_accounts?id=eq.${encodeURIComponent(profiles[0].id)}&disabled_at=is.null&select=id,email,password_hash,email_verified_at`);
        }
        const account = accounts[0];
        if (!account || !(await passwordMatches(password,account.password_hash))) return json({ok:false,error:"Invalid email/username or password."},401);
        const profile = await profileFor(account.id);
        if (!profile) return json({ok:false,error:"Account profile is unavailable."},503);
        const raw = await createSession(account.id);
        return json({ok:true,user:publicUser(account,profile)},200,{"Set-Cookie":cookie(raw,SESSION_MS/1000)});
      }
      if (action === "logout") {
        const raw = request.headers.get("cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith(COOKIE+"="))?.slice(COOKIE.length+1);
        if (raw) await db(`xora_auth_sessions?token_hash=eq.${hash(decodeURIComponent(raw))}`,{method:"DELETE"});
        return json({ok:true},200,{"Set-Cookie":clearCookie()});
      }
      if (action === "recover_with_code") {
        const identifier = String(body.identifier||"").trim().toLowerCase().replace(/^@/,"");
        const code = String(body.recoveryCode||"").trim().toUpperCase();
        const password = typeof body.password === "string" ? body.password : "";
        if (!identifier || !code || password.length < 10 || password.length > 128) return json({ok:false,error:"Enter your username or email, recovery code, and a new password of at least 10 characters."},400);
        let accounts: Row[] = [];
        if (identifier.includes("@")) accounts = await db(`xora_auth_accounts?email=eq.${encodeURIComponent(identifier)}&disabled_at=is.null&select=id,email,password_hash,recovery_code_hash,email_verified_at`);
        else {
          const profiles = await db(`xora_profiles?username=eq.${encodeURIComponent(identifier)}&select=id`);
          if (profiles[0]) accounts = await db(`xora_auth_accounts?id=eq.${encodeURIComponent(profiles[0].id)}&disabled_at=is.null&select=id,email,password_hash,recovery_code_hash,email_verified_at`);
        }
        const account=accounts[0];
        if (!account || !account.recovery_code_hash || hash(code)!==account.recovery_code_hash) return json({ok:false,error:"The account details or recovery code are incorrect."},401);
        const nextCode=recoveryCode();
        await db(`xora_auth_accounts?id=eq.${encodeURIComponent(account.id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({password_hash:await passwordHash(password),recovery_code_hash:hash(nextCode),updated_at:new Date().toISOString()})});
        await db(`xora_auth_sessions?user_id=eq.${encodeURIComponent(account.id)}`,{method:"DELETE"});
        const raw=await createSession(account.id);
        const profile=await profileFor(account.id);
        if (!profile) return json({ok:false,error:"Account profile is unavailable."},503);
        return json({ok:true,user:publicUser(account,profile),recoveryCode:nextCode,message:"Password changed. Save your new recovery code now."},200,{"Set-Cookie":cookie(raw,SESSION_MS/1000)});
      }
      return json({ok:false,error:"Unsupported authentication action."},400);
    } catch (error) {
      console.error("[Auth API]", error instanceof Error ? error.message : "Unknown error");
      return json({ok:false,error:"Authentication service is temporarily unavailable."},503);
    }
  }}}
});
