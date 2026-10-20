import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ygifyoaraxtwixbyranq.supabase.co").replace(/\/$/, "");
const DB_KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const COOKIE = "xora_session";
type Row = Record<string, any>;

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
async function db(path: string, init: RequestInit = {}) {
  if (!DB_KEY) throw new Error("Profile service is not configured.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Profile database request failed (${response.status}).`);
  return body ? JSON.parse(body) : [];
}
async function currentUser(request: Request): Promise<{ id: string; email: string } | null> {
  const raw = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const sessions = await db(`xora_auth_sessions?token_hash=eq.${hash(decodeURIComponent(raw))}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
  if (!sessions[0]?.user_id) return null;
  const accounts = await db(`xora_auth_accounts?id=eq.${encodeURIComponent(sessions[0].user_id)}&disabled_at=is.null&select=id,email`);
  return accounts[0] ? { id: accounts[0].id, email: accounts[0].email } : null;
}
function publicProfile(profile: Row, email?: string) {
  return {
    id: profile.id, username: profile.username, display_name: profile.display_name ?? null,
    avatar_url: profile.avatar_url ?? null, bio: profile.bio ?? "", website: profile.website ?? null,
    location: profile.location ?? null, is_admin: profile.is_admin ?? false,
    follower_count: profile.follower_count ?? 0, following_count: profile.following_count ?? 0,
    subscriber_count: profile.subscriber_count ?? 0, created_at: profile.created_at ?? new Date().toISOString(),
    ...(email ? { email } : {}),
  };
}

export const Route = createFileRoute("/api/profile")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const url = new URL(request.url);
        const username = (url.searchParams.get("username") || "").trim().toLowerCase();
        if (!username) return json({ ok: false, error: "Username is required." }, 400);
        const rows = await db(`xora_profiles?username=eq.${encodeURIComponent(username)}&select=*`);
        if (!rows[0]) return json({ ok: false, error: "Profile not found." }, 404);
        return json({ ok: true, profile: publicProfile(rows[0]) });
      } catch (error) {
        return json({ ok: false, error: error instanceof Error ? error.message : "Could not load profile." }, 503);
      }
    },
    PUT: async ({ request }) => {
      try {
        const user = await currentUser(request);
        if (!user) return json({ ok: false, error: "Please sign in again to edit your profile." }, 401);
        let body: Row;
        try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request body." }, 400); }
        const display_name = typeof body.display_name === "string" ? body.display_name.trim() : "";
        const bio = typeof body.bio === "string" ? body.bio.trim() : "";
        const avatar_url = typeof body.avatar_url === "string" ? body.avatar_url.trim() : "";
        const location = typeof body.location === "string" ? body.location.trim() : "";
        const website = typeof body.website === "string" ? body.website.trim() : "";
        if (!display_name || display_name.length > 60) return json({ ok: false, error: "Display name must be 1–60 characters." }, 400);
        if (bio.length > 600 || location.length > 80 || website.length > 200) return json({ ok: false, error: "One or more profile fields are too long." }, 400);
        let avatar: URL;
        try { avatar = new URL(avatar_url); } catch { return json({ ok: false, error: "Choose one of the available XoraTV avatar styles." }, 400); }
        if (avatar.protocol !== "https:" || avatar.hostname !== "api.dicebear.com" ||
            !/^\/9\.x\/(adventurer|avataaars|bottts|lorelei|micah|notionists)\/svg$/.test(avatar.pathname) ||
            !avatar.searchParams.has("seed")) {
          return json({ ok: false, error: "Choose one of the available XoraTV avatar styles." }, 400);
        }
        if (website && !/^https?:\/\//i.test(website)) return json({ ok: false, error: "Website must start with https:// or http://." }, 400);
        const rows = await db(`xora_profiles?id=eq.${encodeURIComponent(user.id)}&select=*`);
        if (!rows[0]) return json({ ok: false, error: "Your profile could not be found." }, 404);
        const updated = await db(`xora_profiles?id=eq.${encodeURIComponent(user.id)}&select=*`, {
          method: "PATCH", headers: { Prefer: "return=representation" },
          body: JSON.stringify({ display_name, avatar_url, bio, location: location || null, website: website || null }),
        });
        const profile = updated[0] || { ...rows[0], display_name, avatar_url, bio, location: location || null, website: website || null };
        return json({ ok: true, profile: publicProfile(profile, user.email) });
      } catch (error) {
        return json({ ok: false, error: error instanceof Error ? error.message : "Could not save your profile." }, 503);
      }
    },
  } },
});
