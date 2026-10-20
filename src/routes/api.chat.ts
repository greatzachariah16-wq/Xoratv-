import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ygifyoaraxtwixbyranq.supabase.co").replace(/\/$/, "");
const DB_KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const COOKIE = "xora_session";
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
type Row = Record<string, any>;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function cookieValue(request: Request) {
  const part = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(COOKIE + "="));
  return part ? decodeURIComponent(part.slice(COOKIE.length + 1)) : null;
}
async function db(path: string, init: RequestInit = {}) {
  if (!DB_KEY) throw new Error("Chat database server key is not configured.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Chat database request failed (${response.status}): ${body.slice(0, 160)}`);
  return body ? JSON.parse(body) as Row[] : [];
}
async function currentUser(request: Request) {
  const raw = cookieValue(request);
  if (!raw) return null;
  const sessions = await db(`xora_auth_sessions?token_hash=eq.${hash(raw)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id&limit=1`);
  const uid = sessions[0]?.user_id;
  if (typeof uid !== "string") return null;
  const accounts = await db(`xora_auth_accounts?id=eq.${encodeURIComponent(uid)}&disabled_at=is.null&select=id,legacy_firebase_uid&limit=1`);
  if (accounts[0]?.id !== uid) return null;
  return { id: uid, legacyFirebaseUid: typeof accounts[0].legacy_firebase_uid === "string" ? accounts[0].legacy_firebase_uid : null };
}
async function members(roomId: string) {
  return (await db(`xora_chat_members?room_id=eq.${encodeURIComponent(roomId)}&select=user_id`)).map((row) => String(row.user_id));
}
function safeRoom(row: Row, memberList: string[], last?: Row | null) {
  return {
    id: row.id, type: row.room_type, name: row.name ?? null, photo_url: row.photo_url ?? null,
    created_by: row.created_by, created_at: row.created_at, updated_at: row.updated_at,
    memberIds: Object.fromEntries(memberList.map((id) => [id, true])),
    lastMessage: last?.message_text ?? null, lastMessageAt: last?.created_at ?? null,
    lastMessageSenderId: last?.sender_id ?? null,
  };
}
async function roomWithLatest(row: Row) {
  const [memberList, latest] = await Promise.all([
    members(row.id),
    db(`xora_chat_messages?room_id=eq.${encodeURIComponent(row.id)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=sender_id,message_text,created_at&order=created_at.desc&limit=1`),
  ]);
  return safeRoom(row, memberList, latest[0] || null);
}
async function requireMember(roomId: string, uid: string) {
  const rows = await db(`xora_chat_members?room_id=eq.${encodeURIComponent(roomId)}&user_id=eq.${encodeURIComponent(uid)}&select=room_id&limit=1`);
  if (!rows.length) throw Object.assign(new Error("You are not a member of this chat."), { status: 403 });
}
function roomIdForPair(a: string, b: string) {
  return `dm_${[a,b].sort().map((part) => part.replace(/[.#$\\[\\]\\/]/g, "_")).join("__")}`;
}

export const Route = createFileRoute("/api/chat")({
  server: { handlers: {
    GET: async ({ request }) => handle(request),
    POST: async ({ request }) => handle(request),
  } },
});

async function handle(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const user = await currentUser(request);
    if (!user) return json({ error: "Your Xora session has expired. Please sign in again." }, 401);
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "";
    const input = request.method === "POST" ? await request.json().catch(() => ({})) as Row : {};
    const uid = user.id;

    if (action === "rooms" && request.method === "GET") {
      const identityIds = [...new Set([uid, user.legacyFirebaseUid].filter((value): value is string => Boolean(value)))];
      const filters = identityIds.map((id) => `user_id.eq.${encodeURIComponent(id)}`).join(",");
      const memberships = filters ? await db(`xora_chat_members?or=(${filters})&select=room_id`) : [];
      const ids = [...new Set(memberships.map((row) => String(row.room_id)))];
      if (!ids.length) return json({ rooms: [] });
      const idFilter = ids.map((id) => encodeURIComponent(id)).join(",");
      const rows = await db(`xora_chat_rooms?id=in.(${idFilter})&select=*`);
      const rooms = await Promise.all(rows.map(roomWithLatest));
      rooms.sort((a, b) => new Date(b.lastMessageAt || b.updated_at).getTime() - new Date(a.lastMessageAt || a.updated_at).getTime());
      return json({ rooms });
    }
    if (action === "discoverable" && request.method === "GET") {
      const rows = await db("xora_chat_rooms?room_type=eq.group&is_discoverable=eq.true&select=*&order=updated_at.desc&limit=100");
      return json({ rooms: await Promise.all(rows.map(roomWithLatest)) });
    }
    if (action === "messages" && request.method === "GET") {
      const roomId = url.searchParams.get("roomId") || "";
      if (!roomId) return json({ error: "Room is required." }, 400);
      await requireMember(roomId, uid);
      const rows = await db(`xora_chat_messages?room_id=eq.${encodeURIComponent(roomId)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&order=created_at.asc&limit=250`);
      return json({ messages: rows.map((m) => ({ id: m.id, roomId: m.room_id, senderId: m.sender_id, senderName: m.sender_name, senderAvatar: m.sender_avatar, text: m.message_text, created_at: m.created_at, type: m.message_type, expiresAt: m.expires_at })) });
    }
    if (action === "send" && request.method === "POST") {
      const roomId = String(input.roomId || "");
      const message = String(input.text || "").trim();
      const type = input.type === "experience" ? "experience" : "text";
      if (!roomId || !message || message.length > 2000) return json({ error: "Message must contain 1–2,000 characters." }, 400);
      await requireMember(roomId, uid);
      const now = new Date();
      const inserted = await db("xora_chat_messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
        room_id: roomId, sender_id: uid, sender_name: String(input.senderName || "Xora user").slice(0,80),
        sender_avatar: typeof input.senderAvatar === "string" ? input.senderAvatar.slice(0,1000) : null,
        message_text: message, message_type: type, expires_at: new Date(now.getTime() + EXPIRY_MS).toISOString(),
      }) });
      await db(`xora_chat_rooms?id=eq.${encodeURIComponent(roomId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ updated_at: now.toISOString() }) });
      const m = inserted[0];
      return json({ message: { id: m.id, roomId: m.room_id, senderId: m.sender_id, senderName: m.sender_name, senderAvatar: m.sender_avatar, text: m.message_text, created_at: m.created_at, type: m.message_type, expiresAt: m.expires_at } }, 201);
    }
    if (action === "create-dm" && request.method === "POST") {
      const targetId = String(input.targetId || "");
      if (!targetId || targetId === uid || targetId.length > 160) return json({ error: "A different valid user is required." }, 400);
      const roomId = roomIdForPair(uid, targetId);
      await db("xora_chat_rooms", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ id: roomId, room_type: "dm", created_by: uid }) });
      await db("xora_chat_members", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify([{ room_id: roomId, user_id: uid, role: "member" }, { room_id: roomId, user_id: targetId, role: "member" }]) });
      return json({ roomId });
    }
    if (action === "create-group" && request.method === "POST") {
      const name = String(input.name || "").trim().slice(0,100);
      const requested = Array.isArray(input.memberIds) ? input.memberIds.filter((value) => typeof value === "string" && value.length > 0 && value.length <= 160).slice(0,99) : [];
      if (!name) return json({ error: "Circle name is required." }, 400);
      const roomId = `group_${crypto.randomUUID()}`;
      const photo = typeof input.photo_url === "string" ? input.photo_url.slice(0,1000) : null;
      await db("xora_chat_rooms", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: roomId, room_type: "group", name, photo_url: photo, created_by: uid, is_discoverable: true }) });
      const unique = [...new Set([uid, ...requested])];
      await db("xora_chat_members", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(unique.map((user_id) => ({ room_id: roomId, user_id, role: user_id === uid ? "owner" : "member" }))) });
      return json({ roomId }, 201);
    }
    if (action === "join" && request.method === "POST") {
      const roomId = String(input.roomId || "");
      const rows = await db(`xora_chat_rooms?id=eq.${encodeURIComponent(roomId)}&room_type=eq.group&is_discoverable=eq.true&select=id&limit=1`);
      if (!rows.length) return json({ error: "Community circle not found." }, 404);
      await db("xora_chat_members", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ room_id: roomId, user_id: uid, role: "member" }) });
      return json({ ok: true });
    }
    if (action === "prune" && request.method === "POST") {
      const deleted = await db(`xora_chat_messages?expires_at=lte.${encodeURIComponent(new Date().toISOString())}&select=id`, { method: "DELETE", headers: { Prefer: "return=representation" } });
      return json({ deleted: deleted.length });
    }
    return json({ error: "Unknown chat action." }, 404);
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as {status?:unknown}).status === "number" ? (error as {status:number}).status : 503;
    console.error("[Chat API]", error instanceof Error ? error.message : "Unknown error");
    return json({ error: status === 403 ? "You are not a member of this chat." : "Chat service temporarily unavailable." }, status);
  }
}
