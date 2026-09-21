import React, { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/xora/AppShell";
import { XoraInHouseAd } from "@/components/ads/XoraInHouseAd";
import ChatPage, {
  type ChatRoom,
  type ChatMessage,
  type ProfileLite,
} from "@/components/chat/ChatPage";
import NewDmModal from "@/components/chat/NewDmModal";
import NewGroupModal from "@/components/chat/NewGroupModal";
import {
  listenUserRooms,
  listenMessages,
  sendMessage,
  createDmRoom,
  createGroupRoom,
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
          "Chat in real-time with creators and horror cinephiles on Xora. Messages auto-delete after 7 days.",
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
  const [activeRoomId, setActiveRoomId] = useState<string | null>(initialRoomId || null);
  const [rawMessages, setRawMessages] = useState<ChatMessageRecord[]>([]);
  const [inputText, setInputText] = useState("");
  const [isExperience, setIsExperience] = useState(false);
  const [experienceTitle, setExperienceTitle] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Participant profiles cache
  const [profileMap, setProfileMap] = useState<Record<string, ProfileLite>>({});

  // Modals
  const [showDmModal, setShowDmModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [dmTargetUsername, setDmTargetUsername] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupMembersInput, setGroupMembersInput] = useState("");
  const [modalBusy, setModalBusy] = useState(false);

  // Search filter for rooms
  const [roomFilter, setRoomFilter] = useState("");

  // Sync initialRoomId if prop changes
  useEffect(() => {
    if (initialRoomId) {
      setActiveRoomId(initialRoomId);
    }
  }, [initialRoomId]);

  // Listen to rooms for authenticated user
  useEffect(() => {
    if (!user) {
      setRawRooms([]);
      return;
    }

    // Opportunistic prune on mount
    void pruneUserExpiredMessages(user.id);

    const unsubscribe = listenUserRooms(user.id, (updatedRooms) => {
      setRawRooms(updatedRooms);
      if (initialRoomId && updatedRooms.some((r) => r.id === initialRoomId)) {
        setActiveRoomId(initialRoomId);
      }
    });

    return () => unsubscribe();
  }, [user, initialRoomId]);

  // Listen to messages for active room
  useEffect(() => {
    if (!activeRoomId) {
      setRawMessages([]);
      return;
    }

    const unsubscribe = listenMessages(activeRoomId, (msgs) => {
      setRawMessages(msgs);
    });

    return () => unsubscribe();
  }, [activeRoomId]);

  // Fetch participant profiles for DM rooms
  useEffect(() => {
    if (!user) return;
    const uidsToFetch = new Set<string>();

    for (const room of rawRooms) {
      if (room.type === "dm" && room.memberIds) {
        for (const uid of Object.keys(room.memberIds)) {
          if (uid !== user.id && !profileMap[uid]) {
            uidsToFetch.add(uid);
          }
        }
      }
    }

    if (uidsToFetch.size === 0) return;

    void Promise.all(
      Array.from(uidsToFetch).map(async (uid) => {
        const p = await getProfile(uid);
        if (p) {
          const lite: ProfileLite = {
            id: p.id,
            username: p.username,
            display_name: p.display_name || p.username || "User",
            avatar_url: p.avatar_url ?? null,
          };
          setProfileMap((prev) => ({ ...prev, [uid]: lite }));
        }
      }),
    );
  }, [rawRooms, user, profileMap]);

  // Fetch sender profiles for messages if missing
  useEffect(() => {
    if (rawMessages.length === 0) return;
    const missingUids = new Set<string>();

    for (const msg of rawMessages) {
      if (msg.senderId && !profileMap[msg.senderId]) {
        missingUids.add(msg.senderId);
      }
    }

    if (missingUids.size === 0) return;

    void Promise.all(
      Array.from(missingUids).map(async (uid) => {
        const p = await getProfile(uid);
        if (p) {
          const lite: ProfileLite = {
            id: p.id,
            username: p.username,
            display_name: p.display_name || p.username || "User",
            avatar_url: p.avatar_url ?? null,
          };
          setProfileMap((prev) => ({ ...prev, [uid]: lite }));
        }
      }),
    );
  }, [rawMessages, profileMap]);

  // Transform raw data to UI types
  const rooms: ChatRoom[] = rawRooms.map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name ?? null,
    photo_url: r.photo_url ?? null,
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

  const currentProfileLite: ProfileLite | null = profile
    ? {
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name || profile.username || "User",
        avatar_url: profile.avatar_url ?? null,
      }
    : null;

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!activeRoomId || !user || (!inputText.trim() && !experienceTitle.trim())) return;

    setIsSending(true);
    try {
      let finalContent = inputText.trim();
      if (isExperience && experienceTitle.trim()) {
        finalContent = `🎬 Watch Experience: ${experienceTitle.trim()}${finalContent ? `\n\n${finalContent}` : ""}`;
      }

      await sendMessage(activeRoomId, user.id, finalContent, {
        type: isExperience ? "experience" : "text",
        senderName: profile?.display_name || profile?.username || "Cinephile",
        senderAvatar: profile?.avatar_url || null,
      });

      setInputText("");
      setExperienceTitle("");
      setIsExperience(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send message");
    } finally {
      setIsSending(false);
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

      const liteTarget: ProfileLite = {
        id: targetUser.id,
        username: targetUser.username,
        display_name: targetUser.display_name || targetUser.username || "User",
        avatar_url: targetUser.avatar_url ?? null,
      };
      setProfileMap((prev) => ({ ...prev, [targetUser.id]: liteTarget }));
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
      const rawHandles = groupMembersInput
        .split(",")
        .map((h) => h.trim().replace(/^@/, "").toLowerCase())
        .filter(Boolean);

      for (const handle of rawHandles) {
        const found = await getProfileByUsername(handle);
        if (found && found.id !== user.id) {
          memberUids.push(found.id);
          const lite: ProfileLite = {
            id: found.id,
            username: found.username,
            display_name: found.display_name || found.username || "User",
            avatar_url: found.avatar_url ?? null,
          };
          setProfileMap((prev) => ({ ...prev, [found.id]: lite }));
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

  function handleSelectRoom(roomId: string) {
    setActiveRoomId(roomId);
    void navigate({ to: "/chat/$roomId", params: { roomId } });
  }

  function handleBackToList() {
    setActiveRoomId(null);
    void navigate({ to: "/chat" });
  }

  return (
    <AppShell wide>
      <div className="mx-auto max-w-6xl pb-8">
        <XoraInHouseAd placement="chat_banner" variant="compact" className="mb-4" />
        <ChatPage
          currentUserId={user?.id || null}
          currentProfile={currentProfileLite}
          rooms={rooms}
          activeRoomId={activeRoomId}
          messages={messages}
          profileMap={profileMap}
          isSending={isSending}
          roomFilter={roomFilter}
          onRoomFilterChange={setRoomFilter}
          onSelectRoom={handleSelectRoom}
          onBackToList={handleBackToList}
          onOpenNewDm={() => setShowDmModal(true)}
          onOpenNewGroup={() => setShowGroupModal(true)}
          inputText={inputText}
          onInputTextChange={setInputText}
          isExperience={isExperience}
          onToggleExperience={() => setIsExperience((v) => !v)}
          experienceTitle={experienceTitle}
          onExperienceTitleChange={setExperienceTitle}
          onSend={handleSendMessage}
          onSignIn={() => void navigate({ to: "/auth" })}
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
      </div>
    </AppShell>
  );
}
