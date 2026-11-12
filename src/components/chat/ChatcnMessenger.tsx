"use client";

import React, { useMemo } from "react";
import { type ChatMessageData, type SidebarConversation, type ChatUser } from "@/components/ui/chat";
import XoraChatLayout from "./XoraChatLayout";
import "@/components/ui/chat/chatcn.css";
import "./chatcn-xora.css";
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
  currentUserId,
  currentProfile,
  rooms,
  activeRoomId,
  messages,
  profileMap,
  onSelectRoom,
  onBackToList,
  onSend,
  onOpenNewDm,
  onOpenNewGroup,
}: Props) {
  const currentUser: ChatUser = {
    id: currentUserId || "guest",
    name: currentProfile?.display_name || currentProfile?.username || "Xora member",
    avatar: currentProfile?.avatar_url || undefined,
    status: "online",
  };

  const conversations = useMemo<SidebarConversation[]>(() => rooms.map((room) => {
    const otherMemberId = room.type === "dm"
      ? Object.keys(room.memberIds || {}).find((memberId) => memberId !== currentUserId)
      : undefined;
    const otherProfile = otherMemberId ? profileMap[otherMemberId] : undefined;

    return {
      id: room.id,
      title: getRoomTitle(room, currentUserId, profileMap),
      avatar: room.photo_url || otherProfile?.avatar_url || undefined,
      lastMessage: room.lastMessage || (room.type === "group" ? "Community circle" : "Start a conversation"),
      lastMessageTime: room.lastMessageAt
        ? new Date(room.lastMessageAt).toLocaleDateString([], { month: "short", day: "numeric" })
        : undefined,
      isGroup: room.type === "group",
    };
  }), [rooms, currentUserId, profileMap]);

  const chatMessages = useMemo<ChatMessageData[]>(() => messages.map((message) => ({
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName || profileMap[message.senderId]?.display_name || profileMap[message.senderId]?.username || "Xora member",
    senderAvatar: message.senderAvatar || profileMap[message.senderId]?.avatar_url || undefined,
    text: message.text,
    timestamp: new Date(message.created_at),
    status: "sent",
  })), [messages, profileMap]);

  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  const subtitle = activeRoom?.type === "group"
    ? `${Object.keys(activeRoom.memberIds || {}).length} members · Xora community`
    : "Private conversation";

  // Render Chatcn's own messenger directly. No Xora card, border, toolbar,
  // title strip, or secondary panel wraps the upstream UI.
  return (
    <div className="xora-chat-page h-[100dvh] min-h-[100svh] w-full min-w-0 overflow-hidden">
      <XoraChatLayout
        currentUser={currentUser}
        conversations={conversations}
        activeConversationId={activeRoomId || undefined}
        onSelectConversation={(id) => id ? onSelectRoom(id) : onBackToList()}
        messages={chatMessages}
        onSend={onSend}
        subtitle={subtitle}
        onNewMessage={onOpenNewDm}
        onNewGroup={onOpenNewGroup}
      />
    </div>
  );
}
