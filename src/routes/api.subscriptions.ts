import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ygifyoaraxtwixbyranq.supabase.co").replace(/\/$/, "");
const DB_KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const COOKIE = "xora_session";
type Row = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function cookieValue(request: Request) {
  const part = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(COOKIE + "="));
  return part ? decodeURIComponent(part.slice(COOKIE.length + 1)) : null;
}
async function db(path: string, init: RequestInit = {}) {
  if (!DB_KEY) throw new Error("Subscription database server key is not configured.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: DB_KEY,
      Authorization: `Bearer ${DB_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Subscription database request failed (${response.status}).`);
  return body ? JSON.parse(body) as Row[] : [];
}
async function currentUserId(request: Request): Promise<string | null> {
  const raw = cookieValue(request);
  if (!raw) return null;
  const sessions = await db(`xora_auth_sessions?token_hash=eq.${hash(raw)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id&limit=1`);
  const userId = sessions[0]?.user_id;
  if (typeof userId !== "string") return null;
  const accounts = await db(`xora_auth_accounts?id=eq.${encodeURIComponent(userId)}&disabled_at=is.null&select=id&limit=1`);
  return accounts[0]?.id === userId ? userId : null;
}
async function countSubscribers(creatorId: string) {
  if (!DB_KEY) throw new Error("Subscription database server key is not configured.");
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/xora_subscriptions?creator_id=eq.${encodeURIComponent(creatorId)}&select=user_id`,
    {
      method: "HEAD",
      headers: {
        apikey: DB_KEY,
        Authorization: `Bearer ${DB_KEY}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error("Unable to read subscriber count.");
  const range = response.headers.get("content-range") || "";
  const total = range.match(/\/(\d+)$/)?.[1];
  return total ? Number(total) : 0;
}
export const Route = createFileRoute("/api/subscriptions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const creatorId = (url.searchParams.get("creatorId") || "").trim();
          const userId = await currentUserId(request);
          const subscriptions = userId
            ? await db(`xora_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=creator_id&order=created_at.desc`)
                .then((rows) => rows.map((row) => String(row.creator_id)))
            : [];
          const subscriberCount = creatorId ? await countSubscribers(creatorId) : undefined;
          return json({ ok: true, subscriptions, ...(subscriberCount === undefined ? {} : { subscriberCount }) });
        } catch (error) {
          console.error("[Subscriptions API]", error instanceof Error ? error.message : "Unknown error");
          return json({ ok: false, error: "Subscriptions are temporarily unavailable." }, 503);
        }
      },
      POST: async ({ request }) => {
        try {
          const userId = await currentUserId(request);
          if (!userId) return json({ ok: false, error: "Sign in to manage subscriptions." }, 401);
          let body: { creatorId?: unknown; action?: unknown };
          try {
            body = await request.json();
          } catch {
            return json({ ok: false, error: "Invalid request body." }, 400);
          }
          const creatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
          const action = body.action;
          if (!creatorId || creatorId.length > 256 || (action !== "subscribe" && action !== "unsubscribe")) {
            return json({ ok: false, error: "Invalid subscription request." }, 400);
          }
          if (creatorId === userId) return json({ ok: false, error: "You cannot subscribe to your own profile." }, 400);
          if (action === "subscribe") {
            await db("xora_subscriptions", {
              method: "POST",
              headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
              body: JSON.stringify({ user_id: userId, creator_id: creatorId }),
            });
          } else {
            await db(`xora_subscriptions?user_id=eq.${encodeURIComponent(userId)}&creator_id=eq.${encodeURIComponent(creatorId)}`, {
              method: "DELETE",
              headers: { Prefer: "return=minimal" },
            });
          }
          return json({ ok: true, action });
        } catch (error) {
          console.error("[Subscriptions API]", error instanceof Error ? error.message : "Unknown error");
          return json({ ok: false, error: "Could not update subscription. Please try again." }, 503);
        }
      },
    },
  },
});
