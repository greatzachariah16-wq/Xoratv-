import crypto from "node:crypto";

const DEFAULT_DB_URL = "https://xora-tv-default-rtdb.firebaseio.com";

type Entitlement = {
  unlocked: boolean;
  source: "cpx";
  unlockedAt: string;
  updatedAt: string;
  completions?: Record<string, { status: number; completedAt: string }>;
};

function dbUrl(): string {
  return (
    process.env.VITE_FIREBASE_DATABASE_URL ||
    process.env.FIREBASE_DATABASE_URL ||
    DEFAULT_DB_URL
  ).replace(/\/+$/, "");
}

function clean(value: string | null | undefined): string {
  return (value || "").trim();
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = clean(process.env[name]);
  if (!raw) return fallback;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

function cpxConfig() {
  return {
    appId: clean(process.env.CPX_APP_ID),
    secureHashKey: clean(process.env.CPX_SECURE_HASH),
    lockEnabled: envBool("LIVE_CHANNEL_LOCK_ENABLED", false),
  };
}

async function verifyFirebaseUid(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  const apiKey = clean(process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY);
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      users?: Array<{ localId?: string }>;
    };
    const uid = data.users?.[0]?.localId;
    return uid ? String(uid) : null;
  } catch {
    return null;
  }
}

async function readEntitlement(uid: string): Promise<Entitlement | null> {
  const response = await fetch(
    `${dbUrl()}/liveTvEntitlements/${encodeURIComponent(uid)}.json`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) return null;
  const value = (await response.json()) as Entitlement | null;
  return value && typeof value === "object" ? value : null;
}

async function writeEntitlement(uid: string, value: Entitlement): Promise<void> {
  const response = await fetch(
    `${dbUrl()}/liveTvEntitlements/${encodeURIComponent(uid)}.json`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    },
  );
  if (!response.ok) {
    throw new Error(`Firebase entitlement write failed: HTTP ${response.status}`);
  }
}

function secureEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyPostbackHash(transId: string, suppliedHash: string, secret: string): boolean {
  if (!secret || !suppliedHash) return false;
  const expected = crypto.createHash("md5").update(`${transId}-${secret}`).digest("hex");
  return secureEqual(expected.toLowerCase(), suppliedHash.toLowerCase());
}

function buildWallUrl(userId: string, email?: string | null, username?: string | null): string {
  const { appId, secureHashKey } = cpxConfig();
  if (!appId || !secureHashKey) return "";

  const hash = crypto
    .createHash("md5")
    .update(`${userId}-${secureHashKey}`)
    .digest("hex");

  const params = new URLSearchParams({
    app_id: appId,
    ext_user_id: userId,
    secure_hash: hash,
  });
  if (username) params.set("username", username);
  if (email) params.set("email", email);
  return `https://offers.cpx-research.com/index.php?${params.toString()}`;
}

export async function handleCpxLiveTvRoute(
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/cpx/live-tv")) return null;

  const config = cpxConfig();

  if (url.pathname === "/api/cpx/live-tv/access" && request.method === "GET") {
    const uid = await verifyFirebaseUid(request);
    if (!uid) {
      return new Response(JSON.stringify({ ok: false, error: "Authentication required." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const entitlement = await readEntitlement(uid);
    const unlocked = Boolean(entitlement?.unlocked);

    return new Response(
      JSON.stringify({
        ok: true,
        lockEnabled: config.lockEnabled,
        unlocked,
        wallUrl: buildWallUrl(uid),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (url.pathname === "/api/cpx/live-tv/postback" && (request.method === "GET" || request.method === "POST")) {
    const params = new URLSearchParams(url.search);
    if (request.method === "POST") {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const body = await request.text();
        new URLSearchParams(body).forEach((value, key) => params.set(key, value));
      }
    }

    const userId = clean(params.get("user_id") || params.get("ext_user_id"));
    const transId = clean(params.get("trans_id") || params.get("transaction_id"));
    const status = Number(params.get("status") || "0");
    const suppliedHash = clean(params.get("secure_hash") || params.get("hash"));

    if (!userId || !transId || ![1, 2].includes(status)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid CPX postback." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (config.appId && params.get("app_id") && clean(params.get("app_id")) !== config.appId) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid CPX app." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!verifyPostbackHash(transId, suppliedHash, config.secureHashKey)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid CPX postback hash." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const current = (await readEntitlement(userId)) || {
      unlocked: false,
      source: "cpx" as const,
      unlockedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completions: {},
    };

    const completions = { ...(current.completions || {}) };
    completions[transId] = {
      status,
      completedAt: new Date().toISOString(),
    };

    const hasCompleted = Object.values(completions).some((item) => item.status === 1);
    const next: Entitlement = {
      ...current,
      unlocked: hasCompleted,
      source: "cpx",
      unlockedAt: hasCompleted ? current.unlockedAt || new Date().toISOString() : current.unlockedAt,
      updatedAt: new Date().toISOString(),
      completions,
    };

    await writeEntitlement(userId, next);

    return new Response(JSON.stringify({ ok: true, unlocked: next.unlocked }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: false, error: "CPX Live TV route not found." }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}
