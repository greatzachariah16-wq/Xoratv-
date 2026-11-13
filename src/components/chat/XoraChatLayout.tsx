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
import { ArrowLeft, ArrowUpRight, ChevronRight, MessageCircle, MessageSquare, Plus, Search, Users, X } from "lucide-react";

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
  onBackToPrevious: () => void;
};

type InboxFilter = "all" | "private" | "circles";

function getInitials(title: string) {
  return title.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "X";
}

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
  onBackToPrevious,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const activeConversation = conversations.find((item) => item.id === activeConversationId);

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const matchesFilter = filter === "all" ||
        (filter === "circles" ? conversation.isGroup : !conversation.isGroup);
      const matchesSearch = !query ||
        conversation.title.toLowerCase().includes(query) ||
        (conversation.lastMessage || "").toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [conversations, filter, searchQuery]);

  const privateCount = conversations.filter((item) => !item.isGroup).length;
  const circleCount = conversations.filter((item) => item.isGroup).length;

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
          <div className="xora-chat-sidebar-header">
            <div className="xora-chat-brandline">
              <button type="button" className="xora-chat-inbox-back" onClick={onBackToPrevious} aria-label="Go back">
                <ArrowLeft className="size-4" />
              </button>
              <span className="xora-chat-brandmark">X</span>
              <span>XORATV <i /> MESSAGES</span>
            </div>
            <div className="xora-chat-heading-row">
              <div className="min-w-0">
                <h1>Messages</h1>
                <p>Your people, all in one place.</p>
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
                    <button type="button" role="menuitem" onClick={() => { setCreateMenuOpen(false); onNewMessage(); }}>
                      <MessageCircle className="size-4" /> Private message
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setCreateMenuOpen(false); onNewGroup(); }}>
                      <Users className="size-4" /> Create a circle
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {conversations.length > 0 && <label className="xora-chat-search-wrap flex items-center gap-2">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search conversations or people"
              aria-label="Search conversations or people"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear search" className="xora-chat-clear-search">
                <X className="size-4" />
              </button>
            )}
          </label>}

          {conversations.length > 0 && <div className="xora-chat-filter-row" role="group" aria-label="Filter conversations">
            <button type="button" className={filter === "all" ? "is-selected" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
              All <span>{conversations.length}</span>
            </button>
            <button type="button" className={filter === "private" ? "is-selected" : ""} aria-pressed={filter === "private"} onClick={() => setFilter("private")}>
              Private <span>{privateCount}</span>
            </button>
            <button type="button" className={filter === "circles" ? "is-selected" : ""} aria-pressed={filter === "circles"} onClick={() => setFilter("circles")}>
              Circles <span>{circleCount}</span>
            </button>
          </div>}

          {conversations.length > 0 && <div className="xora-chat-list-heading">
            <span>{filter === "circles" ? "YOUR CIRCLES" : filter === "private" ? "PRIVATE CHATS" : "RECENT CONVERSATIONS"}</span>
            <span>{filteredConversations.length} {filteredConversations.length === 1 ? "chat" : "chats"}</span>
          </div>}

          <div className={`xora-chat-conversation-list min-h-0 flex-1 overflow-y-auto ${conversations.length === 0 ? "is-empty" : ""}`}>
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
                <span className="xora-chat-avatar-wrap">
                  {conversation.avatar ? (
                    <img src={conversation.avatar} alt="" className="xora-chat-avatar-image size-12 shrink-0 rounded-full object-cover" loading="lazy" />
                  ) : (
                    <span className="xora-chat-avatar-fallback flex size-12 shrink-0 items-center justify-center rounded-full text-[14px] font-bold">
                      {conversation.isGroup ? <Users className="size-5" /> : getInitials(conversation.title)}
                    </span>
                  )}
                  {conversation.presence === "online" && <span className="xora-chat-online-dot" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="xora-chat-conversation-title truncate">{conversation.title}</span>
                    {conversation.lastMessageTime && <span className="xora-chat-conversation-time shrink-0">{conversation.lastMessageTime}</span>}
                  </span>
                  <span className="xora-chat-preview-row">
                    <span className="xora-chat-conversation-preview truncate">{conversation.lastMessage || (conversation.isGroup ? "Your circle is ready" : "Start a conversation")}</span>
                    {conversation.isGroup && <span className="xora-chat-kind"><Users className="size-3" /> Circle</span>}
                  </span>
                </span>
                <ChevronRight className="xora-chat-row-chevron size-4 shrink-0" />
              </button>
            )) : (
              <div className="xora-chat-empty-state">
                <div className="xora-chat-empty-art">
                  <span className="xora-chat-empty-orbit orbit-one" />
                  <span className="xora-chat-empty-orbit orbit-two" />
                  <span className="xora-chat-empty-icon"><MessageSquare className="size-6" /></span>
                </div>
                <strong>{searchQuery ? "No matches just yet" : filter === "circles" ? "Your circles start here" : filter === "private" ? "No private chats yet" : "A little quiet in here"}</strong>
                <p>{searchQuery ? "Try another name or search for a different message." : "Bring your people together. Start a conversation or create a circle."}</p>
                {!searchQuery && (
                  <div className="xora-chat-empty-actions">
                    <button type="button" onClick={onNewMessage}><MessageCircle className="size-4" /> New chat</button>
                    <button type="button" onClick={onNewGroup}><Users className="size-4" /> Create circle</button>
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
                avatar={activeConversation.avatar ? (
                  <img src={activeConversation.avatar} alt="" className="xora-chat-avatar-image size-10 rounded-full object-cover" />
                ) : (
                  <span className="xora-chat-avatar-fallback flex size-10 items-center justify-center rounded-full text-sm font-bold">
                    {activeConversation.isGroup ? <Users className="size-4" /> : getInitials(activeConversation.title)}
                  </span>
                )}
                onBack={() => onSelectConversation("")}
                className="xora-chat-thread-header"
              />
              <ChatMessages messages={messages} />
              <ChatComposer onSend={onSend} />
            </>
          ) : (
            <div className="xora-chat-desktop-empty">
              <div className="xora-chat-desktop-art">
                <span className="xora-chat-desktop-orbit orbit-one" />
                <span className="xora-chat-desktop-orbit orbit-two" />
                <span className="xora-chat-desktop-icon"><MessageCircle className="size-8" /></span>
              </div>
              <span className="xora-chat-desktop-kicker">YOUR SPACE TO CONNECT</span>
              <strong>Good things start with a hello.</strong>
              <p>Choose a conversation from your inbox, or reach out to someone new.</p>
              <button type="button" onClick={onNewMessage}>Start a conversation <ArrowUpRight className="size-4" /></button>
            </div>
          )}
        </main>
      </div>
    </ChatProvider>
  );
}
