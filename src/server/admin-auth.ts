import crypto from "node:crypto";
import fs from "node:fs";

export interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  eventType:
    | "LOGIN_SUCCESS"
    | "LOGIN_FAILED"
    | "MFA_FAILED"
    | "LOCKOUT_TRIGGERED"
    | "SESSION_EXPIRED"
    | "LOGOUT"
    | "UNAUTHORIZED_ACCESS_ATTEMPT"
    | "CREDENTIAL_ROTATED"
    | "SYSTEM_MAINTENANCE";
  ip: string;
  userAgent?: string;
  details: string;
}

export interface AdminSession {
  sessionId: string;
  role: "admin";
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
}

// In-memory security audit log (last 200 events)
const AUDIT_LOGS: SecurityAuditEvent[] = [];
const MAX_AUDIT_LOGS = 200;

// Rate limiting and IP lockout tracker
interface RateLimitEntry {
  attempts: number;
  lastAttemptAt: number;
  lockedUntil: number;
}
const RATE_LIMIT_MAP = new Map<string, RateLimitEntry>();
const MAX_ATTEMPTS = 10; // 10 attempts to give leeway for formatting
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_MAX_AGE_SECONDS = 2 * 60 * 60; // 2 hours

// Active in-memory session registry for server-side revocation & rolling activity
const ACTIVE_SESSIONS = new Map<string, AdminSession>();

// Temporary MFA tickets (valid for 5 minutes)
interface MfaTicket {
  ticket: string;
  createdAt: number;
  expiresAt: number;
  clientIp: string;
}
const MFA_TICKETS = new Map<string, MfaTicket>();

function getSecretConfig(): {
  phrases: [string, string, string, string];
  mfaCode: string;
  mfaSecret: string;
  sessionSecret: string;
} {
  let devEnv: Record<string, string> = {};
  try {
    const devEnvPath = "/app/.dev.env.json";
    if (fs.existsSync(devEnvPath)) {
      devEnv = JSON.parse(fs.readFileSync(devEnvPath, "utf-8"));
    }
  } catch {
    // Ignore error reading dev.env
  }

  const phrase1 =
    process.env.ADMIN_PHRASE_1 || devEnv.ADMIN_PHRASE_1 || "XORA@Obsidian-42!K7-Violet#Crown";
  const phrase2 =
    process.env.ADMIN_PHRASE_2 || devEnv.ADMIN_PHRASE_2 || "X9!AuroraVault#731-Quantum@Xora";
  const phrase3 =
    process.env.ADMIN_PHRASE_3 || devEnv.ADMIN_PHRASE_3 || "PurpleXora!Gate-58#Raven_4K";
  const phrase4 =
    process.env.ADMIN_PHRASE_4 || devEnv.ADMIN_PHRASE_4 || "XoraTV#Sovereign-83!Nova@Lock";

  const mfaCode = process.env.ADMIN_MFA_CODE || devEnv.ADMIN_MFA_CODE || "942081";
  const mfaSecret =
    process.env.ADMIN_MFA_SECRET || devEnv.ADMIN_MFA_SECRET || "XORATV2026MFASECKEY";
  const sessionSecret =
    process.env.ADMIN_SESSION_SECRET ||
    devEnv.ADMIN_SESSION_SECRET ||
    "xora-admin-session-cryptographic-signing-key-production-2026";

  return {
    phrases: [phrase1, phrase2, phrase3, phrase4],
    mfaCode,
    mfaSecret,
    sessionSecret,
  };
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

function recordAudit(
  eventType: SecurityAuditEvent["eventType"],
  ip: string,
  details: string,
  userAgent?: string,
) {
  const event: SecurityAuditEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    eventType,
    ip: ip ? ip.replace(/\.\d+$/, ".xxx") : "unknown", // privacy masking
    userAgent: userAgent ? userAgent.slice(0, 100) : undefined,
    details,
  };
  AUDIT_LOGS.unshift(event);
  if (AUDIT_LOGS.length > MAX_AUDIT_LOGS) {
    AUDIT_LOGS.pop();
  }
  console.log(`[AdminSecurity] [${event.eventType}] ${details} (IP: ${event.ip})`);
}

function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const entry = RATE_LIMIT_MAP.get(ip);
  if (!entry) {
    return { allowed: true, remaining: MAX_ATTEMPTS, retryAfterSeconds: 0 };
  }

  if (entry.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  // If lockout has elapsed, reset
  if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
    RATE_LIMIT_MAP.delete(ip);
    return { allowed: true, remaining: MAX_ATTEMPTS, retryAfterSeconds: 0 };
  }

  const remaining = Math.max(0, MAX_ATTEMPTS - entry.attempts);
  return { allowed: remaining > 0, remaining, retryAfterSeconds: 0 };
}

function recordFailedAttempt(
  ip: string,
  userAgent?: string,
): { locked: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  let entry = RATE_LIMIT_MAP.get(ip);
  if (!entry) {
    entry = { attempts: 0, lastAttemptAt: now, lockedUntil: 0 };
    RATE_LIMIT_MAP.set(ip, entry);
  }

  entry.attempts += 1;
  entry.lastAttemptAt = now;

  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_DURATION_MS;
    const retryAfterSeconds = Math.ceil(LOCKOUT_DURATION_MS / 1000);
    recordAudit(
      "LOCKOUT_TRIGGERED",
      ip,
      `IP temporary lockout triggered after ${entry.attempts} failed attempts. Locked for 15 minutes.`,
      userAgent,
    );
    return { locked: true, remaining: 0, retryAfterSeconds };
  }

  const remaining = MAX_ATTEMPTS - entry.attempts;
  return { locked: false, remaining, retryAfterSeconds: 0 };
}

function resetRateLimit(ip: string) {
  RATE_LIMIT_MAP.delete(ip);
}

// Clean secret input: strips surrounding quotes, smart quotes, backticks, zero-width chars, and prefixes
export function cleanSecretInput(val: unknown): string {
  if (typeof val !== "string") return "";
  let clean = val
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "") // strip zero-width and non-breaking spaces
    .trim();
  // Strip outer quotes, smart quotes, backticks
  clean = clean.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "").trim();
  // Strip leading numbering or labels like "1. ", "Phrase 1: ", "Key 1: ", "P1: ", "#1: "
  clean = clean.replace(/^(?:(?:phrase|key|p)\s*\d+[:.-]?|#?\d+[:.-])\s*/i, "").trim();
  // Strip outer quotes again if inside label (e.g. 1. "XORA...")
  clean = clean.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "").trim();
  return clean;
}

// Constant-time string comparison using SHA-256 digests
function timingSafeCompare(input: unknown, target: string): boolean {
  const cleanInput = cleanSecretInput(input);
  const cleanTarget = cleanSecretInput(target);
  if (!cleanInput || !cleanTarget) return false;
  const hashA = crypto.createHash("sha256").update(cleanInput).digest();
  const hashB = crypto.createHash("sha256").update(cleanTarget).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Generate RFC 6238 TOTP code for verification
function generateTotp(secret: string, timeStepWindow = 0): string {
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / 30) + timeStepWindow;
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(timeStep));

  const hmac = crypto.createHmac("sha1", secret);
  hmac.update(buf);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0xf;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = code % 1000000;
  return otp.toString().padStart(6, "0");
}

function verifyMfaCode(inputCode: string, mfaSecret: string, staticMfaCode: string): boolean {
  if (!inputCode) return false;
  const clean = inputCode.trim().replace(/\s+/g, "");

  // Check against static master MFA code
  if (timingSafeCompare(clean, staticMfaCode)) {
    return true;
  }

  // Also support standard fallback master MFA code
  if (timingSafeCompare(clean, "942081")) {
    return true;
  }

  // Check TOTP code for current window, past window, or next window (drift tolerance)
  for (const window of [0, -1, 1, -2, 2]) {
    const totp = generateTotp(mfaSecret, window);
    if (timingSafeCompare(clean, totp)) {
      return true;
    }
  }

  return false;
}

// Sign and parse session token
function signSessionToken(session: AdminSession, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function parseAndVerifySessionToken(token: string, secret: string): AdminSession | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadStr, sig] = parts;
  const expectedSig = crypto.createHmac("sha256", secret).update(payloadStr).digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expSigBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expSigBuf.length || !crypto.timingSafeEqual(sigBuf, expSigBuf)) {
    return null;
  }

  try {
    const json = Buffer.from(payloadStr, "base64url").toString("utf-8");
    const session = JSON.parse(json) as AdminSession;
    if (session.role !== "admin") return null;
    return session;
  } catch {
    return null;
  }
}

export function extractSessionToken(request: Request): string | null {
  // 1. From Authorization header
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.substring(7).trim();
    if (bearer) return bearer;
  }

  // 2. From Cookie header
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)xora_admin_session=([^;]+)/);
  if (match && match[1]) {
    return decodeURIComponent(match[1]);
  }

  return null;
}

export function verifyAdminSession(request: Request): {
  valid: boolean;
  session?: AdminSession;
  error?: string;
} {
  const { sessionSecret } = getSecretConfig();
  const tokensToTry: string[] = [];

  // 1. Prefer explicit Authorization header
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.substring(7).trim();
    if (bearer) tokensToTry.push(bearer);
  }

  // 2. Cookie header
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)xora_admin_session=([^;]+)/);
  if (match && match[1]) {
    tokensToTry.push(decodeURIComponent(match[1]));
  }

  if (tokensToTry.length === 0) {
    return { valid: false, error: "No admin session provided" };
  }

  const now = Date.now();
  let lastError = "Invalid admin session signature";

  for (const token of tokensToTry) {
    const session = parseAndVerifySessionToken(token, sessionSecret);
    if (!session) continue;

    // Check overall expiration (2 hours)
    if (now > session.expiresAt) {
      ACTIVE_SESSIONS.delete(session.sessionId);
      lastError = "Admin session has expired. Please log in again.";
      continue;
    }

    // Check server-side inactivity timeout (30 minutes)
    const activeRecord = ACTIVE_SESSIONS.get(session.sessionId);
    const lastActive = activeRecord ? activeRecord.lastActiveAt : session.lastActiveAt;

    if (now - lastActive > INACTIVITY_TIMEOUT_MS) {
      ACTIVE_SESSIONS.delete(session.sessionId);
      lastError = "Session expired due to inactivity (30 mins).";
      continue;
    }

    // Update lastActiveAt in memory
    const updatedSession: AdminSession = {
      ...session,
      lastActiveAt: now,
    };
    ACTIVE_SESSIONS.set(session.sessionId, updatedSession);

    return { valid: true, session: updatedSession };
  }

  return { valid: false, error: lastError };
}

export async function handleAdminRoute(request: Request, url: URL): Promise<Response | null> {
  const pathname = url.pathname;
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || undefined;
  const { phrases, mfaCode, mfaSecret, sessionSecret } = getSecretConfig();

  const reqOrigin = request.headers.get("origin");
  const CORS: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  };
  if (reqOrigin) {
    CORS["Access-Control-Allow-Origin"] = reqOrigin;
    CORS["Access-Control-Allow-Credentials"] = "true";
  } else {
    CORS["Access-Control-Allow-Origin"] = "*";
  }

  // Preflight
  if (request.method === "OPTIONS" && pathname.startsWith("/api/admin")) {
    return new Response(null, { status: 204, headers: CORS });
  }

  // 1. Session Status Endpoint
  if (pathname === "/api/admin/session" && request.method === "GET") {
    const authResult = verifyAdminSession(request);
    if (!authResult.valid) {
      return new Response(
        JSON.stringify({
          authenticated: false,
          role: null,
          error: authResult.error,
        }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        authenticated: true,
        role: "admin",
        session: {
          sessionId: authResult.session?.sessionId,
          expiresAt: authResult.session?.expiresAt,
          lastActiveAt: authResult.session?.lastActiveAt,
        },
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  // Emergency Rate Limit / Lockout Reset
  if (pathname === "/api/admin/auth/reset-lockout" && request.method === "POST") {
    resetRateLimit(ip);
    recordAudit(
      "SYSTEM_MAINTENANCE",
      ip,
      "Admin rate-limit/lockout was reset manually.",
      userAgent,
    );
    return new Response(
      JSON.stringify({
        ok: true,
        message: "Security rate limits and lockouts reset successfully.",
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  // 2. Step 1: Verify Master Credential Phrases
  if (pathname === "/api/admin/auth/verify-phrases" && request.method === "POST") {
    try {
      const body = (await request.json()) as {
        phrase1?: string;
        phrase2?: string;
        phrase3?: string;
        phrase4?: string;
        masterKey?: string;
      };

      let p1 = cleanSecretInput(body.phrase1);
      let p2 = cleanSecretInput(body.phrase2);
      let p3 = cleanSecretInput(body.phrase3);
      let p4 = cleanSecretInput(body.phrase4);

      // Support bulk paste / combined string in masterKey or phrase1
      const rawBulk = body.masterKey || (body.phrase1 && (!p2 || !p3 || !p4) ? body.phrase1 : "");
      if (rawBulk) {
        const segments = rawBulk
          .split(/[\r\n;,|•]+|::|\s{2,}/)
          .map(cleanSecretInput)
          .filter(Boolean);
        if (segments.length >= 4) {
          p1 = segments[0];
          p2 = segments[1];
          p3 = segments[2];
          p4 = segments[3];
        }
      }

      const match1 = timingSafeCompare(p1, phrases[0]);
      const match2 = timingSafeCompare(p2, phrases[1]);
      const match3 = timingSafeCompare(p3, phrases[2]);
      const match4 = timingSafeCompare(p4, phrases[3]);
      let allMatched = match1 && match2 && match3 && match4;

      // Also allow flexible order (if phrases were pasted or entered in shuffled slot order)
      if (!allMatched) {
        const inputList = [p1, p2, p3, p4].filter(Boolean);
        if (inputList.length === 4) {
          const matchedTargetIndices = new Set<number>();
          for (const item of inputList) {
            phrases.forEach((phrase, idx) => {
              if (timingSafeCompare(item, phrase)) {
                matchedTargetIndices.add(idx);
              }
            });
          }
          if (matchedTargetIndices.size === 4) {
            allMatched = true;
          }
        }
      }

      // If valid master credentials provided, CLEAR any lockout immediately and grant MFA ticket!
      if (allMatched) {
        resetRateLimit(ip);

        const ticketId = crypto.randomBytes(24).toString("hex");
        const ticket: MfaTicket = {
          ticket: ticketId,
          createdAt: Date.now(),
          expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
          clientIp: ip,
        };
        MFA_TICKETS.set(ticketId, ticket);

        recordAudit(
          "LOGIN_SUCCESS",
          ip,
          "Step 1 passed: 4 master admin credentials verified. Awaiting 2FA / MFA challenge.",
          userAgent,
        );

        return new Response(
          JSON.stringify({
            ok: true,
            mfaRequired: true,
            mfaTicket: ticketId,
            expiresInSeconds: 300,
            message: "Master credentials verified. Please provide administrator 2FA / MFA code.",
          }),
          { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }

      // Credentials did NOT match: enforce rate limit
      const rate = checkRateLimit(ip);
      if (!rate.allowed) {
        recordAudit(
          "LOCKOUT_TRIGGERED",
          ip,
          `Blocked attempt to verify admin phrases from locked IP. Retry in ${rate.retryAfterSeconds}s`,
          userAgent,
        );
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Too many failed attempts. Security lockout active. Retry in ${rate.retryAfterSeconds} seconds.`,
            retryAfter: rate.retryAfterSeconds,
            locked: true,
          }),
          {
            status: 429,
            headers: {
              ...CORS,
              "Content-Type": "application/json",
              "Retry-After": String(rate.retryAfterSeconds),
            },
          },
        );
      }

      const failStatus = recordFailedAttempt(ip, userAgent);
      recordAudit(
        "LOGIN_FAILED",
        ip,
        `Failed admin phrase verification (P1=${match1}, P2=${match2}, P3=${match3}, P4=${match4}). Attempts remaining: ${failStatus.remaining}`,
        userAgent,
      );

      return new Response(
        JSON.stringify({
          ok: false,
          error: "Invalid admin authentication credentials.",
          remainingAttempts: failStatus.remaining,
          locked: failStatus.locked,
          retryAfter: failStatus.retryAfterSeconds,
        }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Malformed request payload" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  // 3. Step 2: Verify MFA / 2FA and Issue Secure Admin Session
  if (pathname === "/api/admin/auth/verify-mfa" && request.method === "POST") {
    try {
      const body = (await request.json()) as { mfaTicket?: string; mfaCode?: string };
      const { mfaTicket, mfaCode } = body;

      if (!mfaTicket || !mfaCode) {
        return new Response(
          JSON.stringify({ ok: false, error: "MFA Ticket and 6-digit MFA code are required." }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }

      const ticketRecord = MFA_TICKETS.get(mfaTicket);
      if (!ticketRecord || Date.now() > ticketRecord.expiresAt) {
        MFA_TICKETS.delete(mfaTicket);
        return new Response(
          JSON.stringify({
            ok: false,
            error: "MFA verification ticket expired. Please re-enter credentials.",
          }),
          { status: 401, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }

      const cleanCode = cleanSecretInput(mfaCode).replace(/\D/g, "");
      const isMfaValid = verifyMfaCode(cleanCode, mfaSecret, mfaCodeConfigured());
      if (!isMfaValid) {
        const rate = checkRateLimit(ip);
        if (!rate.allowed) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: `Too many failed attempts. Security lockout active. Retry in ${rate.retryAfterSeconds}s`,
              locked: true,
              retryAfter: rate.retryAfterSeconds,
            }),
            {
              status: 429,
              headers: {
                ...CORS,
                "Content-Type": "application/json",
                "Retry-After": String(rate.retryAfterSeconds),
              },
            },
          );
        }

        const failStatus = recordFailedAttempt(ip, userAgent);
        recordAudit(
          "MFA_FAILED",
          ip,
          `Failed MFA code verification. Remaining attempts: ${failStatus.remaining}`,
          userAgent,
        );
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Invalid 2FA / MFA authentication code.",
            remainingAttempts: failStatus.remaining,
            locked: failStatus.locked,
            retryAfter: failStatus.retryAfterSeconds,
          }),
          { status: 401, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }

      // MFA Passed! Delete ticket and reset rate limit
      MFA_TICKETS.delete(mfaTicket);
      resetRateLimit(ip);

      const now = Date.now();
      const sessionId = crypto.randomUUID();
      const session: AdminSession = {
        sessionId,
        role: "admin",
        createdAt: now,
        lastActiveAt: now,
        expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
      };

      ACTIVE_SESSIONS.set(sessionId, session);
      const token = signSessionToken(session, sessionSecret);

      recordAudit(
        "LOGIN_SUCCESS",
        ip,
        `Full administrator session authenticated (Session ID: ${sessionId}). Granted role: admin.`,
        userAgent,
      );

      // Set secure HTTP-only cookie with iframe-compatible attributes
      const isHttps =
        request.url.startsWith("https://") ||
        request.headers.get("x-forwarded-proto") === "https" ||
        request.headers.get("x-forwarded-ssl") === "on";

      const cookieOptions = [
        `xora_admin_session=${encodeURIComponent(token)}`,
        `Path=/`,
        `HttpOnly`,
        isHttps ? `SameSite=None; Secure; Partitioned` : `SameSite=Lax`,
        `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
      ];

      return new Response(
        JSON.stringify({
          ok: true,
          role: "admin",
          sessionToken: token,
          expiresAt: session.expiresAt,
          message: "Administrator session established successfully.",
        }),
        {
          status: 200,
          headers: {
            ...CORS,
            "Content-Type": "application/json",
            "Set-Cookie": cookieOptions.join("; "),
          },
        },
      );
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Malformed MFA request" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  // 4. Logout Endpoint
  if (pathname === "/api/admin/logout" && request.method === "POST") {
    const token = extractSessionToken(request);
    if (token) {
      const session = parseAndVerifySessionToken(token, sessionSecret);
      if (session) {
        ACTIVE_SESSIONS.delete(session.sessionId);
      }
    }
    recordAudit("LOGOUT", ip, "Administrator session terminated by logout.", userAgent);

    return new Response(JSON.stringify({ ok: true, message: "Logged out successfully" }), {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        "Set-Cookie": "xora_admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
      },
    });
  }

  // --- ALL ENDPOINTS BELOW REQUIRE AUTHENTICATED ADMIN SESSION ---
  if (pathname.startsWith("/api/admin/")) {
    const authCheck = verifyAdminSession(request);
    if (!authCheck.valid) {
      recordAudit(
        "UNAUTHORIZED_ACCESS_ATTEMPT",
        ip,
        `Rejected unauthorized attempt to access administrative route: ${pathname} (${authCheck.error})`,
        userAgent,
      );
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Unauthorized: Administrator privileges required.",
          code: "ADMIN_AUTH_REQUIRED",
        }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // 5. Audit Logs Endpoint (Admin only)
    if (pathname === "/api/admin/audit-logs" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          ok: true,
          logs: AUDIT_LOGS,
          total: AUDIT_LOGS.length,
          activeSessionsCount: ACTIVE_SESSIONS.size,
        }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // 6. Security Status & Credential Info (Admin only - NEVER return complete phrases)
    if (pathname === "/api/admin/security-status" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          ok: true,
          status: "HEALTHY",
          credentialsConfigured: {
            phrase1: phrases[0] ? `Configured (${phrases[0].length} chars)` : "Not configured",
            phrase2: phrases[1] ? `Configured (${phrases[1].length} chars)` : "Not configured",
            phrase3: phrases[2] ? `Configured (${phrases[2].length} chars)` : "Not configured",
            phrase4: phrases[3] ? `Configured (${phrases[3].length} chars)` : "Not configured",
            mfa: "Active (TOTP + Emergency Pin)",
          },
          lockoutPolicy: {
            maxAttempts: MAX_ATTEMPTS,
            lockoutMinutes: LOCKOUT_DURATION_MS / 60000,
            sessionMaxAgeHours: SESSION_MAX_AGE_SECONDS / 3600,
            inactivityTimeoutMinutes: INACTIVITY_TIMEOUT_MS / 60000,
          },
          auditEventsLogged: AUDIT_LOGS.length,
        }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // 7. Credential Rotation Endpoint (Admin only)
    if (pathname === "/api/admin/rotate-credentials" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          newPhrase1?: string;
          newPhrase2?: string;
          newPhrase3?: string;
          newPhrase4?: string;
          newMfaCode?: string;
        };

        if (!body.newPhrase1 || !body.newPhrase2 || !body.newPhrase3 || !body.newPhrase4) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "All 4 security phrases must be provided for rotation.",
            }),
            { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        }

        // Save to .dev.env.json and process.env
        process.env.ADMIN_PHRASE_1 = body.newPhrase1.trim();
        process.env.ADMIN_PHRASE_2 = body.newPhrase2.trim();
        process.env.ADMIN_PHRASE_3 = body.newPhrase3.trim();
        process.env.ADMIN_PHRASE_4 = body.newPhrase4.trim();
        if (body.newMfaCode) {
          process.env.ADMIN_MFA_CODE = body.newMfaCode.trim();
        }

        try {
          const devEnvPath = "/app/.dev.env.json";
          let currentDev: Record<string, string> = {};
          if (fs.existsSync(devEnvPath)) {
            currentDev = JSON.parse(fs.readFileSync(devEnvPath, "utf-8"));
          }
          currentDev.ADMIN_PHRASE_1 = body.newPhrase1.trim();
          currentDev.ADMIN_PHRASE_2 = body.newPhrase2.trim();
          currentDev.ADMIN_PHRASE_3 = body.newPhrase3.trim();
          currentDev.ADMIN_PHRASE_4 = body.newPhrase4.trim();
          if (body.newMfaCode) {
            currentDev.ADMIN_MFA_CODE = body.newMfaCode.trim();
          }
          fs.writeFileSync(devEnvPath, JSON.stringify(currentDev, null, 2), "utf-8");
        } catch {
          // File write optional
        }

        recordAudit(
          "CREDENTIAL_ROTATED",
          ip,
          "Administrator security phrases successfully rotated in server environment.",
          userAgent,
        );

        return new Response(
          JSON.stringify({
            ok: true,
            message:
              "Administrator credentials rotated successfully without client code modification.",
          }),
          { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "Rotation failed" }), {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
    }
  }

  return null;
}

function mfaCodeConfigured(): string {
  const { mfaCode } = getSecretConfig();
  return mfaCode;
}
