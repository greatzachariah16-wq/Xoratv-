"use client";

import React, { useMemo } from "react";
import { FullMessenger, type ChatMessageData, type SidebarConversation, type ChatUser } from "@/components/ui/chat";
import "@/components/ui/chat/chatcn.css";
import type { ChatRoom, ChatMessage, ProfileLite } from "@/components/chat/ChatPage";
import { getRoomTitle } from "@/components/chat/ChatPage";

type Props = {
  currentUserId: string | null;
  currentProfile: ProfileLite | null;
  rooms: ChatRoom[];
  discoverableRooms: ChatRoom[];
  activeRoomId: string | null;
  messages: ChatMessage[];
  profileMap: Record<string, ProfileLite>;
  onSelectRoom: (id: string) => void;
  onBackToList: () => void;
  onSend: (text: string) => void;
  onOpenNewDm: () => void;
  onOpenNewGroup: () => void;
  onJoinGroup: (id: string) => void;
};

export default function ChatcnMessenger({
  currentUserId, currentProfile, rooms, discoverableRooms, activeRoomId,
  messages, profileMap, onSelectRoom, onBackToList, onSend,
  onOpenNewDm, onOpenNewGroup, onJoinGroup,
}: Props) {
  const currentUser: ChatUser = {
    id: currentUserId || "guest",
    name: currentProfile?.display_name || currentProfile?.username || "Xora member",
    avatar: currentProfile?.avatar_url || undefined,
    status: "online",
  };

  const conversations = useMemo<SidebarConversation[]>(() => rooms.map((room) => ({
    id: room.id,
    title: getRoomTitle(room, currentUserId, profileMap),
    avatar: room.photo_url || undefined,
    lastMessage: room.lastMessage || (room.type === "group" ? "Community circle" : "Start a conversation"),
    lastMessageTime: room.lastMessageAt ? new Date(room.lastMessageAt).toLocaleDateString([], { month: "short", day: "numeric" }) : undefined,
    isGroup: room.type === "group",
  })), [rooms, currentUserId, profileMap]);

  const chatMessages = useMemo<ChatMessageData[]>(() => messages.map((message) => ({
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName || profileMap[message.senderId]?.display_name || profileMap[message.senderId]?.username || "Xora member",
    senderAvatar: message.senderAvatar || profileMap[message.senderId]?.avatar_url || undefined,
    text: message.type === "experience" ? message.text : message.text,
    timestamp: new Date(message.created_at),
    status: "sent",
  })), [messages, profileMap]);

  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  const subtitle = activeRoom?.type === "group"
    ? `${Object.keys(activeRoom.memberIds || {}).length} members · Xora community`
    : "Private conversation";

  return (
    <section className="w-full overflow-hidden rounded-2xl border border-[var(--chat-border)]" style={{ height: "min(76dvh, 820px)", minHeight: "520px" }}>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--chat-border)] bg-[var(--chat-bg-sidebar)] px-3 py-2">
        <span className="text-xs font-medium text-[var(--chat-text-secondary)]">Xora conversations</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onOpenNewDm} className="rounded-lg border border-[var(--chat-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--chat-text-primary)]">New chat</button>
          <button type="button" onClick={onOpenNewGroup} className="rounded-lg bg-[var(--chat-accent)] px-3 py-1.5 text-xs font-medium text-white">New group</button>
        </div>
      </div>
      <div className="flex h-[calc(100%-42px)] min-h-0 flex-col">
        <FullMessenger
          currentUser={currentUser}
          conversations={conversations}
          activeConversationId={activeRoomId || undefined}
          onSelectConversation={(id) => id ? onSelectRoom(id) : onBackToList()}
          messages={chatMessages}
          onSend={onSend}
          title="Messages"
          subtitle={subtitle}
          className="min-h-0 flex-1"
        />
      </div>
      {discoverableRooms.length > 0 && !activeRoomId && (
        <div className="border-t border-[var(--chat-border)] bg-[var(--chat-bg-sidebar)] px-3 py-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--chat-text-tertiary)]">Discover circles</div>
          <div className="flex gap-2 overflow-x-auto">
            {discoverableRooms.filter((room) => !rooms.some((joined) => joined.id === room.id)).slice(0, 8).map((room) => (
              <button key={room.id} type="button" onClick={() => onJoinGroup(room.id)} className="shrink-0 rounded-full border border-[var(--chat-border-strong)] px-3 py-1.5 text-xs text-[var(--chat-text-secondary)]">
                Join {room.name || "circle"}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
