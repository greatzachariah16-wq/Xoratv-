"use client";

import React, { useMemo, useState } from "react";
import {
  ChatComposer,
  ChatHeader,
  ChatMessages,
  ChatProvider,
  type ChatMessageData,
  type ChatUser,
  type SidebarConversation,
} from "@/components/ui/chat";
import { MessageSquare, Plus, Search, X } from "lucide-react";

type Props = {
  currentUser: ChatUser;
  conversations: SidebarConversation[];
  activeConversationId?: string;
  messages: ChatMessageData[];
  subtitle?: string;
  onSelectConversation: (id: string) => void;
  onSend: (text: string) => void;
  onNewMessage: () => void;
  onNewGroup: () => void;
};

function getInitials(title: string) {
  return title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "X";
}

/**
 * Xora's responsive shell around the original Chatcn message primitives.
 * The upstream Chatcn package remains untouched; only this adapter owns
 * Xora-specific inbox actions, avatar presentation and page styling.
 */
export default function XoraChatLayout({
  currentUser,
  conversations,
  activeConversationId,
  messages,
  subtitle,
  onSelectConversation,
  onSend,
  onNewMessage,
  onNewGroup,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const activeConversation = conversations.find((item) => item.id === activeConversationId);
  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(query) ||
      (conversation.lastMessage || "").toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  return (
    <ChatProvider
      currentUser={currentUser}
      theme="lunar"
      className="h-full flex flex-col"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <div className="xora-chat-shell flex min-h-0 flex-1" style={{ height: "100%" }}>
        <aside
          className={[
            "xora-chat-sidebar flex min-h-0 flex-col",
            activeConversation ? "hidden md:flex md:w-80 md:shrink-0" : "flex w-full md:w-80 md:shrink-0",
          ].join(" ")}
        >
          <div className="xora-chat-sidebar-header flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[17px] font-semibold tracking-[-0.025em]">Messages</h1>
              <p className="mt-0.5 text-[11px]">Your conversations, together</p>
            </div>

            <div className="relative shrink-0">
              <button
                type="button"
                className="xora-chat-create-trigger"
                onClick={() => setCreateMenuOpen((open) => !open)}
                aria-label="Create a new chat"
                aria-haspopup="menu"
                aria-expanded={createMenuOpen}
              >
                <Plus className="size-4" />
                <span>New chat</span>
              </button>
              {createMenuOpen && (
                <div className="xora-chat-create-menu" role="menu" aria-label="New conversation options">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setCreateMenuOpen(false);
                      onNewMessage();
                    }}
                  >
                    New private message
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setCreateMenuOpen(false);
                      onNewGroup();
                    }}
                  >
                    Create a circle
                  </button>
                </div>
              )}
            </div>
          </div>

          <label className="xora-chat-search-wrap flex items-center gap-2 rounded-xl">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search conversations or people"
              aria-label="Search conversations or people"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="xora-chat-clear-search"
              >
                <X className="size-4" />
              </button>
            )}
          </label>

          <div className="xora-chat-conversation-list min-h-0 flex-1 overflow-y-auto">
            {filteredConversations.length > 0 ? filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelectConversation(conversation.id)}
                className={[
                  "xora-chat-conversation-item flex w-full items-center gap-3 text-left transition-colors",
                  conversation.id === activeConversationId ? "is-active" : "",
                ].join(" ")}
              >
                {conversation.avatar ? (
                  <img
                    src={conversation.avatar}
                    alt=""
                    className="xora-chat-avatar-image size-11 shrink-0 rounded-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="xora-chat-avatar-fallback flex size-11 shrink-0 items-center justify-center rounded-full text-[13px] font-bold">
                    {getInitials(conversation.title)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-semibold">{conversation.title}</span>
                    {conversation.lastMessageTime && (
                      <span className="shrink-0 text-[10px]">{conversation.lastMessageTime}</span>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-[12px]">{conversation.lastMessage || "Start a conversation"}</span>
                </span>
              </button>
            )) : (
              <div className="xora-chat-empty-state">
                <div className="xora-chat-empty-icon">
                  <MessageSquare className="size-6" />
                </div>
                <strong>{searchQuery ? "No conversations found" : "Your inbox is quiet"}</strong>
                <p>{searchQuery ? "Try a different name or message." : "Start a private chat or create a community circle."}</p>
                {!searchQuery && (
                  <div className="xora-chat-empty-actions">
                    <button type="button" onClick={onNewMessage}>New message</button>
                    <button type="button" onClick={onNewGroup}>Create a circle</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        <main className={["xora-chat-main min-h-0 min-w-0 flex-1 flex-col", activeConversation ? "flex" : "hidden md:flex"].join(" ")}>
          {activeConversation ? (
            <>
              <ChatHeader
                title={activeConversation.title}
                subtitle={subtitle || (activeConversation.isGroup ? "Community circle" : "Private conversation")}
                avatar={
                  activeConversation.avatar ? (
                    <img
                      src={activeConversation.avatar}
                      alt=""
                      className="xora-chat-avatar-image size-10 rounded-full object-cover"
                    />
                  ) : (
                    <span className="xora-chat-avatar-fallback flex size-10 items-center justify-center rounded-full text-sm font-bold">
                      {getInitials(activeConversation.title)}
                    </span>
                  )
                }
                onBack={() => onSelectConversation("")}
                className="xora-chat-thread-header"
              />
              <ChatMessages messages={messages} />
              <ChatComposer onSend={onSend} />
            </>
          ) : (
            <div className="xora-chat-desktop-empty">
              <div className="xora-chat-empty-icon">
                <MessageSquare className="size-6" />
              </div>
              <strong>Choose a conversation</strong>
              <p>Open a chat from your inbox or start a new one.</p>
            </div>
          )}
        </main>
      </div>
    </ChatProvider>
  );
}
