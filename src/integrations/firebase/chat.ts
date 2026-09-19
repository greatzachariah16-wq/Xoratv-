import { ref, get, set, remove, update, onValue, type Unsubscribe } from "firebase/database";
import { rtdb } from "./config";
import { isFirebaseConfigured } from "./config";
import { pathSafe, getProfile } from "./rtdb";
import type { ChatRoomRecord, ChatMessageRecord, ProfileRecord } from "./types";

export const CHAT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// In-memory fallback for demo mode when Firebase is not configured
const localRooms: ChatRoomRecord[] = [
  {
    id: "demo-community-chat",
    type: "group",
    name: "Xora Cinephiles & Filmmakers",
    photo_url:
      "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=150&auto=format&fit=crop&q=80",
    created_by: "system",
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date().toISOString(),
    memberIds: { "demo-user": true, system: true },
    lastMessage: "Welcome to Xora live chat! Messages automatically delete after 7 days.",
    lastMessageAt: new Date().toISOString(),
    lastMessageSenderId: "system",
  },
];

const localMessages: Record<string, ChatMessageRecord[]> = {
  "demo-community-chat": [
    {
      id: "msg-welcome-1",
      roomId: "demo-community-chat",
      senderId: "system",
      senderName: "Xora Host",
      senderAvatar:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      text: "Welcome to Xora live chat! Share horror recommendations, review shorts, or start a watch experience.",
      created_at: new Date(Date.now() - 3600000).toISOString(),
      type: "text",
      expiresAt: new Date(Date.now() - 3600000 + CHAT_EXPIRY_MS).toISOString(),
    },
    {
      id: "msg-welcome-2",
      roomId: "demo-community-chat",
      senderId: "system",
      senderName: "Xora Host",
      senderAvatar:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      text: "Privacy reminder: All messages in direct messages and groups automatically delete after 7 days.",
      created_at: new Date(Date.now() - 1800000).toISOString(),
      type: "experience",
      expiresAt: new Date(Date.now() - 1800000 + CHAT_EXPIRY_MS).toISOString(),
    },
  ],
};

const lastPruneMap = new Map<string, number>();

/**
 * Prunes expired messages (> 7 days) from a specific room.
 */
export async function pruneExpiredMessagesInRoom(
  roomId: string,
  rawMessagesSnapshot?: Record<string, ChatMessageRecord> | null,
): Promise<number> {
  if (!isFirebaseConfigured()) {
    const now = Date.now();
    const current = localMessages[roomId] || [];
    const valid = current.filter(
      (m) =>
        new Date(m.expiresAt).getTime() > now &&
        now - new Date(m.created_at).getTime() < CHAT_EXPIRY_MS,
    );
    const count = current.length - valid.length;
    localMessages[roomId] = valid;
    return count;
  }

  const safeRoomId = pathSafe(roomId);
  const now = Date.now();

  // Rate-limit prunes per room to at most once per 60 seconds
  const lastPrune = lastPruneMap.get(safeRoomId) || 0;
  if (now - lastPrune < 60000 && !rawMessagesSnapshot) {
    return 0;
  }
  lastPruneMap.set(safeRoomId, now);

  try {
    let messagesMap = rawMessagesSnapshot;
    if (!messagesMap) {
      const snap = await get(ref(rtdb, `chatMessages/${safeRoomId}`));
      if (snap.exists()) {
        messagesMap = snap.val() as Record<string, ChatMessageRecord>;
      }
    }

    if (!messagesMap) return 0;

    let prunedCount = 0;
    const deletionPromises: Promise<void>[] = [];

    for (const [msgKey, msg] of Object.entries(messagesMap)) {
      if (!msg) continue;
      const expiresAtTime = msg.expiresAt ? new Date(msg.expiresAt).getTime() : 0;
      const createdAtTime = msg.created_at ? new Date(msg.created_at).getTime() : 0;
      const isExpired =
        (expiresAtTime > 0 && expiresAtTime <= now) ||
        (createdAtTime > 0 && now - createdAtTime >= CHAT_EXPIRY_MS);

      if (isExpired) {
        prunedCount++;
        deletionPromises.push(remove(ref(rtdb, `chatMessages/${safeRoomId}/${pathSafe(msgKey)}`)));
      }
    }

    if (deletionPromises.length > 0) {
      await Promise.all(deletionPromises);
    }

    return prunedCount;
  } catch (err) {
    console.warn("[Chat] Error pruning expired messages:", err);
    return 0;
  }
}

/**
 * Opportunistically prunes expired messages for all rooms a user belongs to.
 */
export async function pruneUserExpiredMessages(uid: string): Promise<void> {
  if (!uid) return;
  if (!isFirebaseConfigured()) return;

  try {
    const userRoomsSnap = await get(ref(rtdb, `userChatRooms/${pathSafe(uid)}`));
    if (!userRoomsSnap.exists()) return;

    const roomIds = Object.keys(userRoomsSnap.val());
    // Process rooms sequentially in background to minimize burst traffic
    for (const rId of roomIds.slice(0, 10)) {
      void pruneExpiredMessagesInRoom(rId);
    }
  } catch (err) {
    console.warn("[Chat] Background user prune notice:", err);
  }
}

/**
 * Retrieves single room metadata by ID.
 */
export async function getRoom(roomId: string): Promise<ChatRoomRecord | null> {
  if (!isFirebaseConfigured()) {
    return localRooms.find((r) => r.id === roomId) || null;
  }

  try {
    const snap = await get(ref(rtdb, `chatRooms/${pathSafe(roomId)}`));
    if (snap.exists()) {
      return snap.val() as ChatRoomRecord;
    }
  } catch (err) {
    console.warn("[Chat] Error getting room:", err);
  }
  return null;
}

/**
 * Lists all chat rooms the user belongs to.
 */
export async function listUserRooms(uid: string): Promise<ChatRoomRecord[]> {
  if (!uid) return [];

  if (!isFirebaseConfigured()) {
    return [...localRooms].sort(
      (a, b) =>
        new Date(b.lastMessageAt || b.updated_at).getTime() -
        new Date(a.lastMessageAt || a.updated_at).getTime(),
    );
  }

  try {
    const safeUid = pathSafe(uid);
    const userRoomsSnap = await get(ref(rtdb, `userChatRooms/${safeUid}`));
    if (!userRoomsSnap.exists()) return [];

    const roomIds = Object.keys(userRoomsSnap.val());
    const roomPromises = roomIds.map(async (roomId) => {
      const snap = await get(ref(rtdb, `chatRooms/${pathSafe(roomId)}`));
      return snap.exists() ? (snap.val() as ChatRoomRecord) : null;
    });

    const rooms = (await Promise.all(roomPromises)).filter(
      (r): r is ChatRoomRecord => r !== null && r.memberIds?.[uid] === true,
    );

    return rooms.sort(
      (a, b) =>
        new Date(b.lastMessageAt || b.updated_at).getTime() -
        new Date(a.lastMessageAt || a.updated_at).getTime(),
    );
  } catch (err) {
    console.warn("[Chat] Error listing user rooms:", err);
    return [];
  }
}

/**
 * Subscribes to real-time updates for a user's rooms.
 */
export function listenUserRooms(
  uid: string,
  callback: (rooms: ChatRoomRecord[]) => void,
): Unsubscribe {
  if (!uid) {
    callback([]);
    return () => {};
  }

  if (!isFirebaseConfigured()) {
    callback(localRooms);
    return () => {};
  }

  const safeUid = pathSafe(uid);
  const userRoomsRef = ref(rtdb, `userChatRooms/${safeUid}`);

  const unsubscribe = onValue(
    userRoomsRef,
    async (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      const roomIds = Object.keys(snapshot.val());
      try {
        const roomPromises = roomIds.map(async (roomId) => {
          const rSnap = await get(ref(rtdb, `chatRooms/${pathSafe(roomId)}`));
          return rSnap.exists() ? (rSnap.val() as ChatRoomRecord) : null;
        });

        const rooms = (await Promise.all(roomPromises)).filter(
          (r): r is ChatRoomRecord => r !== null && r.memberIds?.[uid] === true,
        );

        rooms.sort(
          (a, b) =>
            new Date(b.lastMessageAt || b.updated_at).getTime() -
            new Date(a.lastMessageAt || a.updated_at).getTime(),
        );

        callback(rooms);
      } catch (err) {
        console.warn("[Chat] Error resolving real-time rooms:", err);
      }
    },
    (error) => {
      console.error("[Chat] listenUserRooms error:", error);
    },
  );

  return unsubscribe;
}

/**
 * Creates or retrieves a deterministic DM room between two users.
 */
export async function createDmRoom(
  uidA: string,
  uidB: string,
  options?: {
    userA?: { display_name?: string | null; username?: string | null; avatar_url?: string | null };
    userB?: { display_name?: string | null; username?: string | null; avatar_url?: string | null };
  },
): Promise<string> {
  if (!uidA || !uidB) throw new Error("Both user IDs are required to start a chat.");

  const sortedUids = [uidA, uidB].sort();
  const roomId = `dm_${pathSafe(sortedUids[0])}__${pathSafe(sortedUids[1])}`;

  const now = new Date().toISOString();

  if (!isFirebaseConfigured()) {
    let existing = localRooms.find((r) => r.id === roomId);
    if (!existing) {
      existing = {
        id: roomId,
        type: "dm",
        name: options?.userB?.display_name || options?.userB?.username || "Direct Message",
        photo_url: options?.userB?.avatar_url || null,
        created_by: uidA,
        created_at: now,
        updated_at: now,
        memberIds: { [uidA]: true, [uidB]: true },
        lastMessage: null,
        lastMessageAt: null,
      };
      localRooms.unshift(existing);
    }
    return roomId;
  }

  const roomRef = ref(rtdb, `chatRooms/${roomId}`);
  const snap = await get(roomRef);

  if (!snap.exists()) {
    const roomRecord: ChatRoomRecord = {
      id: roomId,
      type: "dm",
      name: null, // DMs dynamically show the other participant's profile
      photo_url: null,
      created_by: uidA,
      created_at: now,
      updated_at: now,
      memberIds: {
        [uidA]: true,
        [uidB]: true,
      },
      lastMessage: null,
      lastMessageAt: null,
      lastMessageSenderId: null,
    };

    await set(roomRef, roomRecord);
  }

  // Ensure index entries in userChatRooms
  await Promise.all([
    set(ref(rtdb, `userChatRooms/${pathSafe(uidA)}/${roomId}`), true),
    set(ref(rtdb, `userChatRooms/${pathSafe(uidB)}/${roomId}`), true),
  ]);

  return roomId;
}

/**
 * Creates a group chat room with a given name and members.
 */
export async function createGroupRoom(
  creatorId: string,
  name: string,
  memberIds: string[],
  photo_url?: string | null,
): Promise<string> {
  if (!creatorId) throw new Error("Creator ID is required.");
  if (!name.trim()) throw new Error("Group name is required.");

  const allMembers = Array.from(new Set([creatorId, ...memberIds.filter(Boolean)]));
  const memberMap: Record<string, boolean> = {};
  for (const id of allMembers) {
    memberMap[id] = true;
  }

  const roomId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const groupRecord: ChatRoomRecord = {
    id: roomId,
    type: "group",
    name: name.trim(),
    photo_url:
      photo_url ||
      "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=150&auto=format&fit=crop&q=80",
    created_by: creatorId,
    created_at: now,
    updated_at: now,
    memberIds: memberMap,
    lastMessage: `Group "${name.trim()}" created`,
    lastMessageAt: now,
    lastMessageSenderId: creatorId,
  };

  if (!isFirebaseConfigured()) {
    localRooms.unshift(groupRecord);
    return roomId;
  }

  await set(ref(rtdb, `chatRooms/${roomId}`), groupRecord);

  // Link room to each member
  await Promise.all(
    allMembers.map((mId) => set(ref(rtdb, `userChatRooms/${pathSafe(mId)}/${roomId}`), true)),
  );

  return roomId;
}

/**
 * Sends a message in a room. Sets expiresAt to 7 days in the future.
 */
export async function sendMessage(
  roomId: string,
  senderId: string,
  text: string,
  options?: {
    type?: "text" | "experience";
    experiencePostId?: string | null;
    senderName?: string | null;
    senderAvatar?: string | null;
  },
): Promise<ChatMessageRecord> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error("Message text cannot be empty.");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHAT_EXPIRY_MS).toISOString();
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const messageRecord: ChatMessageRecord = {
    id: messageId,
    roomId,
    senderId,
    senderName: options?.senderName || null,
    senderAvatar: options?.senderAvatar || null,
    text: cleanText,
    created_at: now.toISOString(),
    type: options?.type || "text",
    experiencePostId: options?.experiencePostId || null,
    expiresAt,
  };

  if (!isFirebaseConfigured()) {
    if (!localMessages[roomId]) localMessages[roomId] = [];
    localMessages[roomId].push(messageRecord);

    const room = localRooms.find((r) => r.id === roomId);
    if (room) {
      room.lastMessage = cleanText.slice(0, 100);
      room.lastMessageAt = now.toISOString();
      room.lastMessageSenderId = senderId;
      room.updated_at = now.toISOString();
    }
    return messageRecord;
  }

  const safeRoomId = pathSafe(roomId);

  // Write message
  await set(ref(rtdb, `chatMessages/${safeRoomId}/${messageId}`), messageRecord);

  // Update room lastMessage metadata
  const roomUpdates: Partial<ChatRoomRecord> = {
    lastMessage: cleanText.slice(0, 100),
    lastMessageAt: now.toISOString(),
    lastMessageSenderId: senderId,
    updated_at: now.toISOString(),
  };

  await update(ref(rtdb, `chatRooms/${safeRoomId}`), roomUpdates);

  return messageRecord;
}

/**
 * Subscribes to real-time messages in a room.
 * Filters out expired messages (> 7 days) and triggers background prune.
 */
export function listenMessages(
  roomId: string,
  callback: (messages: ChatMessageRecord[]) => void,
): Unsubscribe {
  if (!roomId) {
    callback([]);
    return () => {};
  }

  if (!isFirebaseConfigured()) {
    const list = localMessages[roomId] || [];
    const now = Date.now();
    const valid = list.filter(
      (m) =>
        new Date(m.expiresAt).getTime() > now &&
        now - new Date(m.created_at).getTime() < CHAT_EXPIRY_MS,
    );
    callback(valid);
    return () => {};
  }

  const safeRoomId = pathSafe(roomId);
  const messagesRef = ref(rtdb, `chatMessages/${safeRoomId}`);

  const unsubscribe = onValue(
    messagesRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }

      const raw = snapshot.val() as Record<string, ChatMessageRecord>;
      const now = Date.now();
      const validMessages: ChatMessageRecord[] = [];
      let hasExpired = false;

      for (const [key, msg] of Object.entries(raw)) {
        if (!msg) continue;
        const fullMsg: ChatMessageRecord = {
          ...msg,
          id: msg.id || key,
        };
        const expiresAtTime = fullMsg.expiresAt ? new Date(fullMsg.expiresAt).getTime() : 0;
        const createdAtTime = fullMsg.created_at ? new Date(fullMsg.created_at).getTime() : 0;
        const isExpired =
          (expiresAtTime > 0 && expiresAtTime <= now) ||
          (createdAtTime > 0 && now - createdAtTime >= CHAT_EXPIRY_MS);

        if (isExpired) {
          hasExpired = true;
        } else {
          validMessages.push(fullMsg);
        }
      }

      // Sort chronological ascending
      validMessages.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

      callback(validMessages);

      // If expired messages were detected, trigger background prune
      if (hasExpired) {
        void pruneExpiredMessagesInRoom(roomId, raw);
      }
    },
    (error) => {
      console.error("[Chat] listenMessages error:", error);
    },
  );

  return unsubscribe;
}
