"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Compass, MessageCircle, Plus, Users, Lock, Search, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { type ChatMessageData, type SidebarConversation, type ChatUser } from "@/components/ui/chat";
import XoraChatLayout from "./XoraChatLayout";
import "@/components/ui/chat/chatcn.css";
import "./chatcn-xora.css";
import "./chatcn-xora-depth.css";
import "./chatcn-xora-portrait-depth.css";
import "./chatcn-community-discovery.css";
import type { ChatRoom, ChatMessage, ProfileLite } from "@/components/chat/ChatPage";
import { getRoomTitle } from "@/components/chat/ChatPage";

type Props = {
  currentUserId: string | null;
  currentProfile: ProfileLite | null;
  rooms: ChatRoom[];
  discoverableRooms: ChatRoom[];
  discoverableError?: string | null;
  activeRoomId: string | null;
  messages: ChatMessage[];
  profileMap: Record<string, ProfileLite>;
  onSelectRoom: (id: string) => void;
  onBackToList: () => void;
  onSend: (text: string) => void;
  onOpenNewDm: () => void;
  onOpenNewGroup: () => void;
  onBackToPrevious: () => void;
  onJoinGroup: (id: string) => void | Promise<void>;
};

export default function ChatcnMessenger({
  currentUserId,
  currentProfile,
  rooms,
  discoverableRooms,
  discoverableError,
  activeRoomId,
  messages,
  profileMap,
  onSelectRoom,
  onBackToList,
  onSend,
  onOpenNewDm,
  onOpenNewGroup,
  onBackToPrevious,
  onJoinGroup,
}: Props) {
  const [section, setSection] = useState<"messages" | "discover">(rooms.length ? "messages" : "discover");
  const [communityQuery, setCommunityQuery] = useState("");
  const [joiningId, setJoiningId] = useState<string | null>(null);\n\n  useEffect(() => {\n    if (rooms.length > 0) setSection("messages");\n  }, [rooms.length]);

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
      lastMessageTime: room.lastMessageAt ? new Date(room.lastMessageAt).toLocaleDateString([], { month: "short", day: "numeric" }) : undefined,
      isGroup: room.type === "group",
    };
  }), [rooms, currentUserId, profileMap]);

  const communities = useMemo(() => discoverableRooms
    .filter((room) => !rooms.some((memberRoom) => memberRoom.id === room.id))
    .filter((room) => {
      const query = communityQuery.trim().toLowerCase();
      return !query || (room.name || "").toLowerCase().includes(query) || (room.description || "").toLowerCase().includes(query);
    }), [discoverableRooms, rooms, communityQuery]);

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

  const changeSection = (next: "messages" | "discover") => {
    setSection(next);
    onBackToList();
  };

  const joinCommunity = async (id: string) => {
    if (joiningId) return;
    setJoiningId(id);
    try {
      await onJoinGroup(id);
      setSection("messages");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join this circle");
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="xora-chat-page xora-community-app h-[100dvh] min-h-[100svh] w-full min-w-0 overflow-hidden">
      <nav className="xora-community-switcher" aria-label="Chat spaces">
        <button type="button" className={section === "messages" ? "is-active" : ""} aria-pressed={section === "messages"} onClick={() => changeSection("messages")}>
          <MessageCircle className="size-4" /> Messages <span className="xora-community-switch-count">{conversations.length}</span>
        </button>
        <button type="button" className={section === "discover" ? "is-active" : ""} aria-pressed={section === "discover"} onClick={() => changeSection("discover")}>
          <Compass className="size-4" /> Discover <span className="xora-community-switch-count">{discoverableRooms.length}</span>
        </button>
      </nav>

      {section === "messages" ? (
        <div className="xora-community-messages-pane min-h-0 flex-1">
          <XoraChatLayout
            currentUser={currentUser}
            conversations={conversations}
            activeConversationId={activeRoomId || undefined}
            messages={chatMessages}
            onSelectConversation={(id) => id ? onSelectRoom(id) : onBackToList()}
            onSend={onSend}
            subtitle={subtitle}
            onNewMessage={onOpenNewDm}
            onNewGroup={onOpenNewGroup}
            onBackToPrevious={onBackToPrevious}
          />
        </div>
      ) : (
        <section className="xora-community-discover-view">
          <div className="xora-community-discover-heading">
            <div className="xora-community-heading-mark"><Sparkles className="size-6" /></div>
            <p className="xora-community-eyebrow">THE PUBLIC SIDE OF XORATV</p>
            <h1>Find your people.</h1>
            <p className="xora-community-intro">Join a circle, meet people who love the same things, and make the conversation yours.</p>
            <div className="xora-community-privacy-note"><Lock className="size-4" /><span>Your private messages are separate. Only members of a circle can see its conversation.</span></div>
          </div>

          <div className="xora-community-directory-head">
            <div><h2>Explore public circles</h2><p>Choose a space and jump into the conversation.</p></div>
            <button type="button" className="xora-community-create" onClick={onOpenNewGroup}><Plus className="size-4" /> Create circle</button>
          </div>

          <label className="xora-community-search">
            <Search className="size-4" />
            <input value={communityQuery} onChange={(event) => setCommunityQuery(event.target.value)} placeholder="Search films, music, learning..." aria-label="Search public circles" />
          </label>

          <div className="xora-community-directory-list">
            {communities.length ? communities.map((room) => (
              <article className="xora-community-tile" key={room.id}>
                <div className="xora-community-tile-art">
                  {room.photo_url ? <img src={room.photo_url} alt="" loading="lazy" /> : <Users className="size-7" />}
                </div>
                <div className="xora-community-tile-copy">
                  <h3>{room.name || "Xora community circle"}</h3>
                  <p>{room.description || "A place to meet people and share what you love."}</p>
                  <span><Users className="size-3" /> {Object.keys(room.memberIds || {}).length} members <i>·</i> Public</span>
                </div>
                <button type="button" className="xora-community-join" disabled={joiningId === room.id || Boolean(joiningId)} onClick={() => void joinCommunity(room.id)}>
                  {joiningId === room.id ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {joiningId === room.id ? "Joining" : "Join"}
                </button>
              </article>
            )) : (
              <div className="xora-community-no-results">
                <div><Compass className="size-7" /></div>
                <h3>{discoverableError ? "The directory is taking a breather" : communityQuery ? "No circles found" : "Your first circle is waiting"}</h3>
                <p>{discoverableError ? "We couldn't load public circles right now. The directory will retry automatically." : communityQuery ? "Try another search, or browse all public circles." : "Create a circle and invite your people. Public circles will also appear here when available."}</p>
                {!communityQuery && !discoverableError && <button type="button" onClick={onOpenNewGroup}><Plus className="size-4" /> Create the first circle</button>}
              </div>
            )}
          </div>
          {discoverableError && <p className="xora-community-directory-error" role="status">Community directory connection issue. Retrying automatically.</p>}
        </section>
      )}
    </div>
  );
}
