import React, { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/xora/AppShell";
import type { ChatRoom, ChatMessage, ProfileLite } from "@/components/chat/ChatPage";
import ChatcnMessenger from "@/components/chat/ChatcnMessenger";
import NewDmModal from "@/components/chat/NewDmModal";
import NewGroupModal from "@/components/chat/NewGroupModal";
import {
  listenUserRooms,
  listenMessages,
  sendMessage,
  createDmRoom,
  createGroupRoom,
  listenDiscoverableGroups,
  joinGroupRoom,
  pruneUserExpiredMessages,
} from "@/integrations/firebase/chat";
import { getProfileByUsername, getProfile } from "@/integrations/firebase/rtdb";
import type { ChatRoomRecord, ChatMessageRecord } from "@/integrations/firebase/types";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Live Chat & Community — Xora" },
      {
        name: "description",
        content:
          "Chat in real-time with creators and horror cinephiles on Xora. Messages are automatically deleted after 30 days.",
      },
      { property: "og:title", content: "Live Chat — Xora" },
      {
        property: "og:description",
        content: "Join creator rooms, talk cinema, and share watch experiences.",
      },
    ],
  }),
  component: ChatIndexPage,
});

export function ChatIndexPage({ initialRoomId }: { initialRoomId?: string }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [rawRooms, setRawRooms] = useState<ChatRoomRecord[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [rawDiscoverableRooms, setRawDiscoverableRooms] = useState<ChatRoomRecord[]>([]);
  const [discoverableError, setDiscoverableError] = useState<string | null>(null);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(initialRoomId || null);
  const [rawMessages, setRawMessages] = useState<ChatMessageRecord[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileLite>>({});

  const [showDmModal, setShowDmModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [dmTargetUsername, setDmTargetUsername] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupMembersInput, setGroupMembersInput] = useState("");
  const [modalBusy, setModalBusy] = useState(false);

  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("to");
    if (!target) return;
    setDmTargetUsername(target.replace(/^@/, ""));
    setShowDmModal(true);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (initialRoomId) setActiveRoomId(initialRoomId);
  }, [initialRoomId]);

  useEffect(() => {
    if (!user) {
      setRawRooms([]);
      setRoomsLoading(false);
      return;
    }
    setRoomsLoading(true);
    void pruneUserExpiredMessages(user.id);
    const unsubscribe = listenUserRooms(user.id, (updatedRooms) => {
      setRoomsLoading(false);
      setRawRooms(updatedRooms);
      if (initialRoomId && updatedRooms.some((room) => room.id === initialRoomId)) {
        setActiveRoomId(initialRoomId);
      }
    });
    return () => unsubscribe();
  }, [user, initialRoomId]);

  useEffect(() => {
    if (!user) {
      setRawDiscoverableRooms([]);
      setDiscoverableError(null);
      return;
    }
    setDiscoverableError(null);
    const unsubscribe = listenDiscoverableGroups((updatedRooms, error) => {
      if (error) {
        setDiscoverableError(error);
        return;
      }
      setDiscoverableError(null);
      setRawDiscoverableRooms(updatedRooms);
    });
    return () => unsubscribe();
  }, [user]);

  const activeRoomIsMember = rawRooms.some((room) => room.id === activeRoomId);
  useEffect(() => {
    if (!activeRoomId || !activeRoomIsMember) {
      setRawMessages([]);
      return;
    }
    const unsubscribe = listenMessages(activeRoomId, setRawMessages);
    return () => unsubscribe();
  }, [activeRoomId, activeRoomIsMember]);

  useEffect(() => {
    if (!user) return;
    const uidsToFetch = new Set<string>();
    for (const room of rawRooms) {
      if (room.type === "dm" && room.memberIds) {
        for (const uid of Object.keys(room.memberIds)) {
          if (uid !== user.id && !profileMap[uid]) uidsToFetch.add(uid);
        }
      }
    }
    if (!uidsToFetch.size) return;
    void Promise.all(Array.from(uidsToFetch).map(async (uid) => {
      const p = await getProfile(uid);
      if (p) setProfileMap((prev) => ({
        ...prev,
        [uid]: {
          id: p.id,
          username: p.username,
          display_name: p.display_name || p.username || "User",
          avatar_url: p.avatar_url ?? null,
        },
      }));
    }));
  }, [rawRooms, user, profileMap]);

  useEffect(() => {
    if (!rawMessages.length) return;
    const missingUids = new Set<string>();
    for (const msg of rawMessages) {
      if (msg.senderId && !profileMap[msg.senderId]) missingUids.add(msg.senderId);
    }
    if (!missingUids.size) return;
    void Promise.all(Array.from(missingUids).map(async (uid) => {
      const p = await getProfile(uid);
      if (p) setProfileMap((prev) => ({
        ...prev,
        [uid]: {
          id: p.id,
          username: p.username,
          display_name: p.display_name || p.username || "User",
          avatar_url: p.avatar_url ?? null,
        },
      }));
    }));
  }, [rawMessages, profileMap]);

  const rooms: ChatRoom[] = rawRooms.map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name ?? null,
    photo_url: r.photo_url ?? null,
    description: r.description ?? null,
    lastMessage: r.lastMessage ?? null,
    lastMessageAt: r.lastMessageAt ?? null,
    memberIds: r.memberIds,
  }));

  const discoverableRooms: ChatRoom[] = rawDiscoverableRooms
    .filter((r) => r.type === "group")
    .map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name ?? null,
      photo_url: r.photo_url ?? null,
      description: r.description ?? null,
      lastMessage: r.lastMessage ?? null,
      lastMessageAt: r.lastMessageAt ?? null,
      memberIds: r.memberIds,
    }));

  const messages: ChatMessage[] = rawMessages.map((m) => ({
    id: m.id,
    roomId: m.roomId,
    senderId: m.senderId,
    senderName: m.senderName ?? null,
    senderAvatar: m.senderAvatar ?? null,
    text: m.text,
    created_at: m.created_at,
    type: m.type,
    expiresAt: m.expiresAt,
  }));

  const currentProfileLite: ProfileLite | null = profile ? {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name || profile.username || "User",
    avatar_url: profile.avatar_url ?? null,
  } : null;

  async function handleChatcnSend(text: string) {
    if (!activeRoomId || !user || !text.trim()) return;
    try {
      await sendMessage(activeRoomId, user.id, text.trim(), {
        type: "text",
        senderName: profile?.display_name || profile?.username || "Xora member",
        senderAvatar: profile?.avatar_url || null,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send message");
    }
  }

  async function handleStartDm(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !dmTargetUsername.trim()) return;
    setModalBusy(true);
    try {
      const cleanHandle = dmTargetUsername.trim().replace(/^@/, "").toLowerCase();
      const targetUser = await getProfileByUsername(cleanHandle);
      if (!targetUser) {
        toast.error(`User @${cleanHandle} was not found on Xora.`);
        return;
      }
      if (targetUser.id === user.id) {
        toast.error("You cannot start a direct message with yourself.");
        return;
      }
      const roomId = await createDmRoom(user.id, targetUser.id, {
        userA: profile || undefined,
        userB: targetUser,
      });
      setProfileMap((prev) => ({
        ...prev,
        [targetUser.id]: {
          id: targetUser.id,
          username: targetUser.username,
          display_name: targetUser.display_name || targetUser.username || "User",
          avatar_url: targetUser.avatar_url ?? null,
        },
      }));
      setActiveRoomId(roomId);
      setShowDmModal(false);
      setDmTargetUsername("");
      toast.success(`Chat started with @${targetUser.username}`);
      void navigate({ to: "/chat/$roomId", params: { roomId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start direct message");
    } finally {
      setModalBusy(false);
    }
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !groupName.trim()) return;
    setModalBusy(true);
    try {
      const memberUids: string[] = [];
      const rawHandles = groupMembersInput.split(",").map((h) => h.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
      for (const handle of rawHandles) {
        const found = await getProfileByUsername(handle);
        if (found && found.id !== user.id) {
          memberUids.push(found.id);
          setProfileMap((prev) => ({
            ...prev,
            [found.id]: {
              id: found.id,
              username: found.username,
              display_name: found.display_name || found.username || "User",
              avatar_url: found.avatar_url ?? null,
            },
          }));
        }
      }
      const roomId = await createGroupRoom(user.id, groupName.trim(), memberUids);
      setActiveRoomId(roomId);
      setShowGroupModal(false);
      setGroupName("");
      setGroupMembersInput("");
      toast.success(`Group "${groupName.trim()}" created!`);
      void navigate({ to: "/chat/$roomId", params: { roomId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setModalBusy(false);
    }
  }

  async function handleJoinGroup(roomId: string) {
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    setJoiningGroupId(roomId);
    const alreadyJoined = rawRooms.some((room) => room.id === roomId);
    const directoryRoom = rawDiscoverableRooms.find((room) => room.id === roomId);
    if (!alreadyJoined && directoryRoom) {
      const optimisticRoom = { ...directoryRoom, memberIds: { ...(directoryRoom.memberIds || {}), [user.id]: true } };
      setRawRooms((previous) => previous.some((room) => room.id === roomId) ? previous : [optimisticRoom, ...previous]);
    }
    try {
      await joinGroupRoom(user.id, roomId);
      setActiveRoomId(roomId);
      toast.success("You joined the community circle!");
      void navigate({ to: "/chat/$roomId", params: { roomId } });
    } catch (err) {
      if (!alreadyJoined) setRawRooms((previous) => previous.filter((room) => room.id !== roomId));
      toast.error(err instanceof Error ? err.message : "Could not join this circle");
    } finally {
      setJoiningGroupId(null);
    }
  }

  function handleSelectRoom(roomId: string) {
    setActiveRoomId(roomId);
    void navigate({ to: "/chat/$roomId", params: { roomId } });
  }

  function handleBackToList() {
    setActiveRoomId(null);
    void navigate({ to: "/chat" });
  }

  function handleInboxBack() {
    const historyIndex = typeof window !== "undefined" ? window.history.state?.__TSR_index : undefined;
    if (typeof historyIndex === "number" && historyIndex > 0) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  }

  return (
    <AppShell immersive hideTopBanner>
      <ChatcnMessenger
        currentUserId={user?.id || null}
        currentProfile={currentProfileLite}
        rooms={rooms}
        discoverableRooms={discoverableRooms}
        activeRoomId={activeRoomId}
        messages={messages}
        profileMap={profileMap}
        onSelectRoom={handleSelectRoom}
        onBackToList={handleBackToList}
        onSend={handleChatcnSend}
        onOpenNewDm={() => setShowDmModal(true)}
        onOpenNewGroup={() => setShowGroupModal(true)}
        onBackToPrevious={handleInboxBack}
        onJoinGroup={handleJoinGroup}
      />
      <NewDmModal
        open={showDmModal}
        username={dmTargetUsername}
        busy={modalBusy}
        onUsernameChange={setDmTargetUsername}
        onClose={() => setShowDmModal(false)}
        onSubmit={handleStartDm}
      />
      <NewGroupModal
        open={showGroupModal}
        groupName={groupName}
        membersInput={groupMembersInput}
        busy={modalBusy}
        onGroupNameChange={setGroupName}
        onMembersInputChange={setGroupMembersInput}
        onClose={() => setShowGroupModal(false)}
        onSubmit={handleCreateGroup}
      />
    </AppShell>
  );
}
