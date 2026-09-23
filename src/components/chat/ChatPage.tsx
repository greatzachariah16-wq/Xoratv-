import React, { useEffect, useRef } from "react";
import {
  MessageCircle,
  Plus,
  Users,
  Send,
  Search,
  ArrowLeft,
  Clock,
  Clapperboard,
  Sparkles,
  Lock,
  Loader2,
} from "lucide-react";

// --- Types ---
export type ChatRoom = {
  id: string;
  type: "dm" | "group";
  name: string | null;
  photo_url: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  memberIds?: Record<string, boolean>;
};

export type ChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  senderName?: string | null;
  senderAvatar?: string | null;
  text: string;
  created_at: string;
  type: "text" | "experience";
  expiresAt: string;
};

export type ProfileLite = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

// --- Helpers ---
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "just now";
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function getRoomTitle(
  room: ChatRoom,
  currentUserId: string | null,
  profileMap: Record<string, ProfileLite>,
): string {
  if (room.type === "group" && room.name) return room.name;
  if (room.type === "dm" && room.memberIds && currentUserId) {
    const otherId = Object.keys(room.memberIds).find((id) => id !== currentUserId);
    if (otherId && profileMap[otherId]) {
      return profileMap[otherId].display_name || profileMap[otherId].username;
    }
  }
  return room.name || "Unknown Chat";
}

// --- Simple Equivalent Components ---
const UserAvatar = ({
  path,
  name,
  size = "md",
}: {
  path?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
}) => {
  const sizeClasses = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-12 h-12 text-base" };
  const initials =
    (name || "?")
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-surface-2 border border-border flex items-center justify-center text-muted-foreground font-display overflow-hidden shrink-0`}
    >
      {path ? (
        <img src={path} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
};

const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
    <div className="w-16 h-16 rounded-full bg-surface-2 border border-border flex items-center justify-center mb-4 text-muted-foreground">
      <Icon className="w-8 h-8" />
    </div>
    <h3 className="font-display text-lg text-foreground mb-2">{title}</h3>
    <p className="text-sm text-muted-foreground max-w-xs mb-6">{description}</p>
    {action}
  </div>
);

// --- Main Component ---
export interface ChatPageProps {
  currentUserId: string | null;
  currentProfile: ProfileLite | null;
  rooms: ChatRoom[];
  activeRoomId: string | null;
  messages: ChatMessage[];
  profileMap: Record<string, ProfileLite>;
  isSending: boolean;
  roomFilter: string;
  onRoomFilterChange: (v: string) => void;
  onSelectRoom: (roomId: string) => void;
  onBackToList: () => void;
  onOpenNewDm: () => void;
  onOpenNewGroup: () => void;
  inputText: string;
  onInputTextChange: (v: string) => void;
  isExperience: boolean;
  onToggleExperience: () => void;
  experienceTitle: string;
  onExperienceTitleChange: (v: string) => void;
  onSend: (e: React.FormEvent) => void;
  onSignIn: () => void;
}

export default function ChatPage({
  currentUserId,
  currentProfile: _currentProfile,
  rooms,
  activeRoomId,
  messages,
  profileMap,
  isSending,
  roomFilter,
  onRoomFilterChange,
  onSelectRoom,
  onBackToList,
  onOpenNewDm,
  onOpenNewGroup,
  inputText,
  onInputTextChange,
  isExperience,
  onToggleExperience,
  experienceTitle,
  onExperienceTitleChange,
  onSend,
  onSignIn,
}: ChatPageProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeRoom = rooms.find((r) => r.id === activeRoomId) || null;
  const activeMessages = messages.filter((m) => m.roomId === activeRoomId);

  // Auto-scroll when messages update
  useEffect(() => {
    if (activeMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeMessages.length, activeRoomId]);

  if (!currentUserId) {
    return (
      <EmptyState
        icon={Lock}
        title="Sign in to chat"
        description="Join the conversation. For your privacy, all messages and chats automatically delete after 7 days."
        action={
          <button
            onClick={onSignIn}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-display active:scale-[0.98] transition-transform"
          >
            Sign in
          </button>
        }
      />
    );
  }

  const filteredRooms = rooms.filter((room) => {
    const title = getRoomTitle(room, currentUserId, profileMap);
    return (
      title.toLowerCase().includes(roomFilter.toLowerCase()) ||
      (room.lastMessage || "").toLowerCase().includes(roomFilter.toLowerCase())
    );
  });

  return (
    <div className="flex flex-col h-full bg-background text-foreground font-sans">
      {/* Global Header */}
      <header className="px-4 py-4 border-b border-border bg-surface">
        <h1 className="font-display text-xl text-foreground">Live Chat & Groups</h1>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
          <Lock className="w-3 h-3" />
          Messages auto-delete after 7 days for your privacy.
        </p>
      </header>

      {/* Main Panel */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="rounded-2xl border border-border bg-surface shadow-card grid lg:grid-cols-[320px_1fr] min-h-[500px] lg:min-h-[calc(100vh-14rem)] overflow-hidden h-full">
          {/* LEFT: Inbox */}
          <div
            className={`flex flex-col border-r border-border bg-background ${activeRoomId ? "hidden lg:flex" : "flex"}`}
          >
            <div className="p-4 border-b border-border flex gap-2">
              <button
                onClick={onOpenNewDm}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-surface border border-border rounded-xl text-sm font-medium text-foreground active:scale-[0.98] transition-transform"
              >
                <Plus className="w-4 h-4" /> New DM
              </button>
              <button
                onClick={onOpenNewGroup}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-surface border border-border rounded-xl text-sm font-medium text-foreground active:scale-[0.98] transition-transform"
              >
                <Users className="w-4 h-4" /> New Group
              </button>
            </div>

            <div className="p-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={roomFilter}
                  onChange={(e) => onRoomFilterChange(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredRooms.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {roomFilter.trim() ? "No matching conversations." : "No conversations yet."}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Start a New DM or New Group</p>
                </div>
              ) : (
                filteredRooms.map((room) => {
                  const title = getRoomTitle(room, currentUserId, profileMap);
                  const otherId =
                    room.type === "dm"
                      ? Object.keys(room.memberIds || {}).find((id) => id !== currentUserId)
                      : null;
                  const otherProfile = otherId ? profileMap[otherId] : null;

                  return (
                    <button
                      key={room.id}
                      onClick={() => onSelectRoom(room.id)}
                      className={`w-full flex items-center gap-3 p-4 text-left border-b border-border hover:bg-surface-2/50 active:scale-[0.99] transition-transform ${activeRoomId === room.id ? "bg-surface-2" : ""}`}
                    >
                      <UserAvatar
                        path={room.type === "dm" ? otherProfile?.avatar_url : room.photo_url}
                        name={title}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline">
                          <span className="font-display text-sm text-foreground truncate">
                            {title}
                          </span>
                          {room.lastMessageAt && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                              <Clock className="w-3 h-3" /> {formatTime(room.lastMessageAt)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {room.lastMessage || "No messages yet"}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT: Conversation */}
          <div
            className={`flex flex-col bg-background ${!activeRoomId ? "hidden lg:flex" : "flex"}`}
          >
            {!activeRoom ? (
              <EmptyState
                icon={MessageCircle}
                title="Select a conversation"
                description="Choose a chat from the left to start messaging or sharing watch experiences."
              />
            ) : (
              <>
                {/* Chat Header */}
                <div className="flex items-center gap-3 p-4 border-b border-border bg-surface">
                  <button
                    onClick={onBackToList}
                    className="lg:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground active:scale-90 transition-transform"
                    aria-label="Back to conversations list"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <UserAvatar
                    path={
                      activeRoom.type === "dm"
                        ? profileMap[
                            Object.keys(activeRoom.memberIds || {}).find(
                              (id) => id !== currentUserId,
                            ) || ""
                          ]?.avatar_url
                        : activeRoom.photo_url
                    }
                    name={getRoomTitle(activeRoom, currentUserId, profileMap)}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <h2 className="font-display text-sm text-foreground truncate">
                      {getRoomTitle(activeRoom, currentUserId, profileMap)}
                    </h2>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Expires in 7 days
                    </p>
                  </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
                  <div className="flex justify-center mb-4">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-2 border border-border text-[10px] text-muted-foreground font-medium">
                      <Clock className="w-3 h-3" /> Auto-delete after 7 days
                    </span>
                  </div>

                  {activeMessages.map((msg) => {
                    const isMine = msg.senderId === currentUserId;
                    const showName = !isMine && activeRoom.type === "group";
                    const senderProfile = profileMap[msg.senderId];

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
                      >
                        {showName && (
                          <span className="text-[10px] text-muted-foreground mb-1 ml-1">
                            {senderProfile?.display_name || msg.senderName || "Unknown"}
                          </span>
                        )}
                        <div
                          className={`flex gap-2 max-w-[85%] ${isMine ? "flex-row-reverse" : "flex-row"}`}
                        >
                          {!isMine && activeRoom.type === "group" && (
                            <UserAvatar
                              path={senderProfile?.avatar_url || msg.senderAvatar || null}
                              name={senderProfile?.display_name || msg.senderName || "?"}
                              size="sm"
                            />
                          )}
                          <div
                            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                              isMine
                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                : "bg-surface border border-border text-foreground rounded-tl-sm"
                            }`}
                          >
                            {msg.type === "experience" && (
                              <div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium opacity-80">
                                <Clapperboard className="w-3.5 h-3.5" />
                                <Sparkles className="w-3 h-3" />
                                <span>Watch Experience</span>
                              </div>
                            )}
                            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1 mx-1">
                          {formatTime(msg.created_at)}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Composer */}
                <div className="p-4 border-t border-border bg-surface">
                  {isExperience && (
                    <div className="mb-3 flex items-center gap-2">
                      <Clapperboard className="w-4 h-4 text-primary shrink-0" />
                      <input
                        type="text"
                        placeholder="Film or experience title..."
                        value={experienceTitle}
                        onChange={(e) => onExperienceTitleChange(e.target.value)}
                        className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  )}

                  <form onSubmit={onSend} className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={onToggleExperience}
                      className={`p-2.5 rounded-xl border transition-all active:scale-95 ${
                        isExperience
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-background border-border text-muted-foreground hover:text-foreground"
                      }`}
                      title="Toggle Watch Experience"
                      aria-label="Toggle Watch Experience"
                    >
                      <Sparkles className="w-5 h-5" />
                    </button>

                    <div className="flex-1 relative">
                      <textarea
                        rows={1}
                        placeholder={
                          isExperience ? "Share your thoughts on this experience..." : "Message..."
                        }
                        value={inputText}
                        onChange={(e) => onInputTextChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            onSend(e);
                          }
                        }}
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none max-h-32"
                        disabled={isSending}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSending || (!inputText.trim() && !experienceTitle.trim())}
                      className="p-2.5 bg-primary text-primary-foreground rounded-xl active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Send message"
                    >
                      {isSending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
