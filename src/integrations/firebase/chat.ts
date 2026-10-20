import { auth, isFirebaseConfigured } from "./config";
import type { Unsubscribe } from "firebase/database";
import type { ChatRoomRecord, ChatMessageRecord, ProfileRecord } from "./types";

export const CHAT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

const CHAT_API = "https://ygifyoaraxtwixbyranq.supabase.co/functions/v1/xora-chat-api";
const POLL_INTERVAL_MS = 3000;

const localRooms: ChatRoomRecord[] = [{
  id: "demo-community-chat",
  type: "group",
  name: "Xora Cinephiles & Filmmakers",
  photo_url: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=150&auto=format&fit=crop&q=80",
  created_by: "system",
  created_at: new Date(Date.now() - 3600000).toISOString(),
  updated_at: new Date().toISOString(),
  memberIds: { "demo-user": true, system: true },
  lastMessage: "Welcome to Xora live chat! Messages are kept for 30 days.",
  lastMessageAt: new Date().toISOString(),
  lastMessageSenderId: "system",
}];

const localMessages: Record<string, ChatMessageRecord[]> = {
  "demo-community-chat": [{
    id: "msg-welcome-1", roomId: "demo-community-chat", senderId: "system",
    senderName: "Xora Host",
    senderAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    text: "Welcome to Xora live chat! Share recommendations, talk with creators, or start a watch experience.",
    created_at: new Date(Date.now() - 3600000).toISOString(), type: "text",
    expiresAt: new Date(Date.now() - 3600000 + CHAT_EXPIRY_MS).toISOString(),
  }],
};

function sortRooms(rooms: ChatRoomRecord[]) {
  return rooms.sort((a, b) =>
    new Date(b.lastMessageAt || b.updated_at).getTime() -
    new Date(a.lastMessageAt || a.updated_at).getTime()
  );
}

async function api<T>(action: string, method: "GET" | "POST" = "GET", body?: unknown, params?: Record<string, string>): Promise<T> {
  const url = new URL("/api/chat", window.location.origin);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
  const response = await fetch(url.toString(), {
    method,
    credentials: "include",
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    ...(method === "POST" ? { body: JSON.stringify(body || {}) } : {}),
  });
  const responseText = await response.text();
  let result: Record<string, unknown> = {};
  try {
    result = responseText ? JSON.parse(responseText) as Record<string, unknown> : {};
  } catch {
    const preview = responseText.trim().slice(0, 180);
    throw new Error(`Chat API "${action}" returned invalid JSON (HTTP ${response.status})${preview ? `: ${preview}` : "."}`);
  }
  if (!response.ok) {
    const detail = typeof result.error === "string" ? result.error : responseText.trim().slice(0, 180);
    throw new Error(`Chat API "${action}" failed (HTTP ${response.status})${detail ? `: ${detail}` : "."}`);
  }
  return result as T;
}

function localRoom(roomId: string) {
  return localRooms.find((room) => room.id === roomId) || null;
}

export async function pruneExpiredMessagesInRoom(roomId: string, rawMessagesSnapshot?: Record<string, ChatMessageRecord> | null): Promise<number> {
  if (!isFirebaseConfigured()) {
    const current = localMessages[roomId] || [];
    const valid = current.filter((m) => new Date(m.expiresAt).getTime() > Date.now());
    localMessages[roomId] = valid;
    return current.length - valid.length;
  }
  if (rawMessagesSnapshot) return 0;
  try {
    const result = await api<{ deleted: number }>("prune", "POST");
    return result.deleted;
  } catch (error) {
    console.warn("[Chat] Expiry cleanup deferred:", error);
    return 0;
  }
}

export async function pruneUserExpiredMessages(uid: string): Promise<void> {
  if (!uid || !isFirebaseConfigured()) return;
  try { await api("prune", "POST"); }
  catch (error) { console.warn("[Chat] Expiry cleanup deferred:", error); }
}

export async function getRoom(roomId: string): Promise<ChatRoomRecord | null> {
  if (!isFirebaseConfigured()) return localRoom(roomId);
  try {
    const result = await api<{ rooms: ChatRoomRecord[] }>("rooms");
    return result.rooms.find((room) => room.id === roomId) || null;
  } catch (error) {
    console.warn("[Chat] Could not retrieve room:", error);
    return null;
  }
}

export async function listUserRooms(uid: string): Promise<ChatRoomRecord[]> {
  if (!uid) return [];
  if (!isFirebaseConfigured()) return sortRooms([...localRooms]);
  const result = await api<{ rooms: ChatRoomRecord[] }>("rooms");
  return sortRooms(result.rooms || []);
}

export function listenUserRooms(uid: string, callback: (rooms: ChatRoomRecord[]) => void): Unsubscribe {
  if (!uid) { callback([]); return () => {}; }
  if (!isFirebaseConfigured()) { callback(sortRooms([...localRooms])); return () => {}; }
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  const refresh = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const result = await api<{ rooms: ChatRoomRecord[] }>("rooms");
      if (!stopped) callback(sortRooms(result.rooms || []));
    } catch (error) {
      console.warn("[Chat] Room refresh failed:", error);
    } finally {
      busy = false;
      if (!stopped) timer = setTimeout(refresh, POLL_INTERVAL_MS);
    }
  };
  void refresh();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

export async function createDmRoom(
  uidA: string,
  uidB: string,
  options?: {
    userA?: { display_name?: string | null; username?: string | null; avatar_url?: string | null };
    userB?: { display_name?: string | null; username?: string | null; avatar_url?: string | null };
  },
): Promise<string> {
  if (!uidA || !uidB || uidA === uidB) throw new Error("Two different user IDs are required to start a chat.");
  if (!isFirebaseConfigured()) {
    const roomId = `dm_${[uidA, uidB].sort().join("__")}`;
    if (!localRoom(roomId)) localRooms.unshift({
      id: roomId, type: "dm", name: options?.userB?.display_name || options?.userB?.username || "Direct Message",
      photo_url: options?.userB?.avatar_url || null, created_by: uidA, created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), memberIds: { [uidA]: true, [uidB]: true },
      lastMessage: null, lastMessageAt: null,
    });
    return roomId;
  }
  const result = await api<{ roomId: string }>("create-dm", "POST", { targetId: uidB });
  return result.roomId;
}

export async function createGroupRoom(creatorId: string, name: string, memberIds: string[], photo_url?: string | null): Promise<string> {
  if (!creatorId) throw new Error("Creator ID is required.");
  if (!name.trim()) throw new Error("Group name is required.");
  if (!isFirebaseConfigured()) {
    const now = new Date().toISOString();
    const roomId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localRooms.unshift({
      id: roomId, type: "group", name: name.trim(),
      photo_url: photo_url || "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=150&auto=format&fit=crop&q=80",
      created_by: creatorId, created_at: now, updated_at: now,
      memberIds: Object.fromEntries([...new Set([creatorId, ...memberIds])].map((id) => [id, true])),
      lastMessage: `Group "${name.trim()}" created`, lastMessageAt: now, lastMessageSenderId: creatorId,
    });
    return roomId;
  }
  const result = await api<{ roomId: string }>("create-group", "POST", { name: name.trim(), memberIds, photo_url });
  return result.roomId;
}

export function listenDiscoverableGroups(
  callback: (rooms: ChatRoomRecord[], error?: string | null) => void,
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    callback(localRooms.filter((room) => room.type === "group"), null);
    return () => {};
  }
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  const refresh = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const result = await api<{ rooms?: ChatRoomRecord[] }>("discoverable");
      if (!Array.isArray(result.rooms)) {
        throw new Error('The chat API response did not contain a valid "rooms" array.');
      }
      if (!stopped) callback(result.rooms, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Chat] Community directory refresh failed:", message);
      // Report the failure without replacing the last known-good directory with [].
      if (!stopped) callback([], message);
    } finally {
      busy = false;
      if (!stopped) timer = setTimeout(refresh, POLL_INTERVAL_MS * 2);
    }
  };
  void refresh();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

export async function joinGroupRoom(uid: string, roomId: string): Promise<void> {
  if (!uid || !roomId) throw new Error("Sign in to join a community circle.");
  if (!isFirebaseConfigured()) {
    const room = localRoom(roomId);
    if (!room || room.type !== "group") throw new Error("This circle could not be found.");
    room.memberIds = { ...(room.memberIds || {}), [uid]: true };
    return;
  }
  await api("join", "POST", { roomId });
}

export async function sendMessage(
  roomId: string,
  senderId: string,
  text: string,
  options?: { type?: "text" | "experience"; experiencePostId?: string | null; senderName?: string | null; senderAvatar?: string | null },
): Promise<ChatMessageRecord> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error("Message text cannot be empty.");
  if (cleanText.length > 2000) throw new Error("Messages must be 2,000 characters or fewer.");
  if (!isFirebaseConfigured()) {
    const now = new Date();
    const message: ChatMessageRecord = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, roomId, senderId,
      senderName: options?.senderName || null, senderAvatar: options?.senderAvatar || null,
      text: cleanText, created_at: now.toISOString(), type: options?.type || "text",
      experiencePostId: options?.experiencePostId || null,
      expiresAt: new Date(now.getTime() + CHAT_EXPIRY_MS).toISOString(),
    };
    (localMessages[roomId] ||= []).push(message);
    const room = localRoom(roomId);
    if (room) { room.lastMessage = cleanText.slice(0, 100); room.lastMessageAt = now.toISOString(); room.lastMessageSenderId = senderId; room.updated_at = now.toISOString(); }
    return message;
  }
  const result = await api<{ message: ChatMessageRecord }>("send", "POST", {
    roomId, text: cleanText, type: options?.type, senderName: options?.senderName, senderAvatar: options?.senderAvatar,
  });
  return result.message;
}

export function listenMessages(roomId: string, callback: (messages: ChatMessageRecord[]) => void): Unsubscribe {
  if (!roomId) { callback([]); return () => {}; }
  if (!isFirebaseConfigured()) {
    callback((localMessages[roomId] || []).filter((m) => new Date(m.expiresAt).getTime() > Date.now()));
    return () => {};
  }
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  const refresh = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const result = await api<{ messages: ChatMessageRecord[] }>("messages", "GET", undefined, { roomId });
      if (!stopped) callback(result.messages || []);
    } catch (error) {
      console.warn("[Chat] Message refresh failed:", error);
    } finally {
      busy = false;
      if (!stopped) timer = setTimeout(refresh, POLL_INTERVAL_MS);
    }
  };
  void refresh();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
