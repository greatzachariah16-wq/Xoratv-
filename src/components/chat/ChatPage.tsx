import React, { useEffect, useMemo, useRef, useState } from "react";
import "./xora-chat-premium.css";
import { MessageCircle, Plus, Users, Send, Search, ArrowLeft, Clock, Clapperboard, Sparkles, Lock, Loader2, Compass, MessagesSquare, UsersRound, ArrowUpRight, Film, Music2, BookOpen, Heart, MoreHorizontal, PanelLeftClose, CheckCheck, ChevronDown, Coffee, Info, Leaf, Paperclip, Smile, Sun, Moon, Volume2, VolumeX, X } from "lucide-react";

export type ChatRoom = { id: string; type: "dm" | "group"; name: string | null; photo_url: string | null; description?: string | null; lastMessage: string | null; lastMessageAt: string | null; memberIds?: Record<string, boolean> };
export type ChatMessage = { id: string; roomId: string; senderId: string; senderName?: string | null; senderAvatar?: string | null; text: string; created_at: string; type: "text" | "experience"; expiresAt: string };
export type ProfileLite = { id: string; username: string; display_name: string; avatar_url: string | null };

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function messageTime(iso: string) {
  const date = new Date(iso);
  return isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayKey(iso: string) { const d = new Date(iso); return isNaN(d.getTime()) ? "invalid" : d.toDateString(); }
function dayLabel(iso: string) {
  const d = new Date(iso); const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start - target) / 86400000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString([], { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
function avatarGradient(name: string) {
  let hash = 0; for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `linear-gradient(135deg,hsl(${hash} 48% 65%),hsl(${(hash + 42) % 360} 42% 43%))`;
}
export function getRoomTitle(room: ChatRoom, currentUserId: string | null, profileMap: Record<string, ProfileLite>): string {
  if (room.type === "group" && room.name) return room.name;
  if (room.type === "dm" && room.memberIds && currentUserId) {
    const other = Object.keys(room.memberIds).find((id) => id !== currentUserId);
    if (other && profileMap[other]) return profileMap[other].display_name || profileMap[other].username;
  }
  return room.name || "Xora conversation";
}
function circleArtworkFor(name: string): string {
  const value = name.toLowerCase();
  if (/(film|cinema|movie|series|anime)/.test(value)) return "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=82";
  if (/(music|song|sound|artist)/.test(value)) return "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=82";
  if (/(book|learn|study|code|tech)/.test(value)) return "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=900&q=82";
  if (/(nature|outdoor|travel|earth)/.test(value)) return "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=82";
  if (/(food|coffee|cook|kitchen)/.test(value)) return "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=82";
  return "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=82";
}
const Avatar = ({ path, name, size = "md" }: { path?: string | null; name: string; size?: "sm" | "md" | "lg" }) => {
  const sizes = { sm: "size-9 text-xs", md: "size-11 text-sm", lg: "size-12 text-sm" };
  const initials = (name || "?").split(" ").map((part) => part[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "?";
  return <div className={`${sizes[size]} grid shrink-0 place-items-center overflow-hidden rounded-full border border-clay/15 bg-clay-soft font-display font-semibold text-clay`}>{path ? <img src={path} alt={name} className="size-full object-cover" /> : initials}</div>;
};
const EmptyState = ({ icon: Icon, title, description, action }: { icon: React.ElementType; title: string; description: string; action?: React.ReactNode }) => (
  <div className="flex min-h-[300px] flex-col items-center justify-center px-6 py-12 text-center">
    <div className="mb-4 grid size-16 place-items-center rounded-full border border-clay/15 bg-clay-soft/70 text-clay"><Icon className="size-7" /></div>
    <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3><p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}
  </div>
);

export interface ChatPageProps {
  roomsLoading?: boolean; authLoading?: boolean; currentUserId: string | null; currentProfile: ProfileLite | null; rooms: ChatRoom[]; discoverableRooms: ChatRoom[]; discoverableError?: string | null; joiningGroupId: string | null; onJoinGroup: (roomId: string) => void; activeRoomId: string | null; messages: ChatMessage[]; profileMap: Record<string, ProfileLite>; isSending: boolean; roomFilter: string; onRoomFilterChange: (v: string) => void; onSelectRoom: (roomId: string) => void; onBackToList: () => void; onOpenNewDm: () => void; onOpenNewGroup: () => void; inputText: string; onInputTextChange: (v: string) => void; isExperience: boolean; onToggleExperience: () => void; experienceTitle: string; onExperienceTitleChange: (v: string) => void; onSend: (e: React.FormEvent) => void; onSignIn: () => void;
}
export default function ChatPage({
  roomsLoading = false, authLoading = false, currentUserId, currentProfile, rooms, discoverableRooms, discoverableError, joiningGroupId, onJoinGroup, activeRoomId, messages, profileMap, isSending, roomFilter, onRoomFilterChange, onSelectRoom, onBackToList, onOpenNewDm, onOpenNewGroup, inputText, onInputTextChange, isExperience, onToggleExperience, experienceTitle, onExperienceTitleChange, onSend, onSignIn,
}: ChatPageProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [nearLatest, setNearLatest] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [closingRoom, setClosingRoom] = useState(false);
  const closeRoom = () => { setClosingRoom(true); window.setTimeout(() => { setClosingRoom(false); onBackToList(); }, 220); };
  const [listTab, setListTab] = useState<"all" | "groups" | "directs" | "discover">("all");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const [chatTheme, setChatTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem("xora-chat-theme");
      if (savedTheme === "dark" || savedTheme === "light") setChatTheme(savedTheme);
    } catch {
      // Keep the premium dark default when local storage is unavailable.
    }
  }, []);
  const toggleChatTheme = () => {
    setChatTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try { window.localStorage.setItem("xora-chat-theme", next); } catch { /* Theme remains usable for this session. */ }
      return next;
    });
  };
  const [localReactions, setLocalReactions] = useState<Record<string, string[]>>({});
  const lastTap = useRef<{ id: string; at: number }>({ id: "", at: 0 });
  const knownMessages = useRef<Set<string>>(new Set(messages.map((message) => message.id)));
  const freshMessages = useRef<Set<string>>(new Set());
  messages.forEach((message) => { if (!knownMessages.current.has(message.id)) { knownMessages.current.add(message.id); freshMessages.current.add(message.id); } });
  const activeRoom = rooms.find((room) => room.id === activeRoomId) || discoverableRooms.find((room) => room.id === activeRoomId) || null;
  const isActiveMember = Boolean(activeRoom && rooms.some((room) => room.id === activeRoom.id));
  const activeMessages = messages.filter((message) => message.roomId === activeRoomId);
  const filtered = (listTab === "discover" ? discoverableRooms : rooms).filter((room) => {
    if (listTab === "groups" && room.type !== "group") return false;
    if (listTab === "directs" && room.type !== "dm") return false;
    const title = getRoomTitle(room, currentUserId, profileMap), q = roomFilter.toLowerCase();
    return title.toLowerCase().includes(q) || (room.lastMessage || "").toLowerCase().includes(q);
  });
  const activeOtherId = activeRoom?.type === "dm" ? Object.keys(activeRoom.memberIds || {}).find((id) => id !== currentUserId) : null;
  const activeOther = activeOtherId ? profileMap[activeOtherId] : null;
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el || !activeMessages.length) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 110;
    if (near) { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); setUnreadCount(0); }
    else { setUnreadCount((count) => count + 1); setNearLatest(false); }
  }, [activeMessages.length, activeRoomId]);
  useEffect(() => { if (isSending) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [isSending]);
  useEffect(() => {
    const updateKeyboardInset = () => {
      const viewport = window.visualViewport;
      const inset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      document.documentElement.style.setProperty("--keyboard-inset", `${inset}px`);
    };
    updateKeyboardInset();
    window.visualViewport?.addEventListener("resize", updateKeyboardInset);
    window.addEventListener("resize", updateKeyboardInset);
    return () => { window.visualViewport?.removeEventListener("resize", updateKeyboardInset); window.removeEventListener("resize", updateKeyboardInset); };
  }, []);
  useEffect(() => { if (!inputText && composerRef.current) composerRef.current.style.height = "auto"; }, [inputText]);
  const handleTranscriptScroll = () => {
    const el = transcriptRef.current; if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setNearLatest(near); if (near) setUnreadCount(0);
  };
  const messageRows = useMemo(() => activeMessages.map((message, index) => {
    const previous = activeMessages[index - 1];
    const next = activeMessages[index + 1];
    const samePrevious = Boolean(previous && previous.senderId === message.senderId && dayKey(previous.created_at) === dayKey(message.created_at) && new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() <= 5 * 60 * 1000);
    const sameNext = Boolean(next && next.senderId === message.senderId && dayKey(next.created_at) === dayKey(message.created_at) && new Date(next.created_at).getTime() - new Date(message.created_at).getTime() <= 5 * 60 * 1000);
    const newDay = !previous || dayKey(previous.created_at) !== dayKey(message.created_at);
    return { message, first: !samePrevious, last: !sameNext, newDay, index };
  }), [activeMessages]);
  const reactToMessage = (id: string) => {
    const now = Date.now();
    if (lastTap.current.id === id && now - lastTap.current.at < 320) {
      setLocalReactions((previous) => ({ ...previous, [id]: previous[id]?.includes("❤️") ? previous[id] : [...(previous[id] || []), "❤️"] }));
      if (typeof navigator !== "undefined") navigator.vibrate?.(12);
    }
    lastTap.current = { id, at: now };
  };

  if (!currentUserId && authLoading) return (
    <div className="xora-page grid min-h-[55vh] place-items-center">
      <div className="rounded-3xl border border-border bg-surface/90 px-8 py-7 text-center shadow-card">
        <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <p className="text-sm font-medium">Restoring your Xora session…</p>
        <p className="mt-1 text-xs text-muted-foreground">Just a moment while we reconnect your conversations.</p>
      </div>
    </div>
  );

  if (!currentUserId) return (
    <div className="xora-page">
      <header className="brand-header">
        <div className="brand-lockup"><span className="xora-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M8 7c2 0 3 1 5 4l3 4 3-4c2-3 3-4 5-4M8 25c2 0 3-1 5-4l3-4 3 4c2 3 3 4 5 4" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><circle cx="25" cy="6" r="2" fill="currentColor"/></svg></span><div><div className="brand-name">Xora <span>Chat</span></div><p className="brand-tagline">A little closer, every day</p></div></div>
      </header>
      <main className="xora-login-card">
        <span className="xora-login-icon"><UsersRound /></span>
        <p className="xora-eyebrow">XORA COMMUNITY</p>
        <h1>Your people are here.</h1>
        <p>Join conversations about films, music, creativity and the things that bring the Xora community together.</p>
        <button onClick={onSignIn} className="xora-primary-button">Join the conversation <ArrowUpRight className="size-4"/></button>
        <div className="xora-login-topics"><span><Music2/> Music & culture</span><span><Film/> Film corner</span><span><BookOpen/> Learn together</span></div>
      </main>
    </div>
  );

  const tabOptions = [{id:"all",label:"All"},{id:"groups",label:"Circles"},{id:"directs",label:"Direct"},{id:"discover",label:"Explore"}] as const;
  const roomIcon = (room: ChatRoom) => {
    const value = (room.name || "").toLowerCase();
    if (value.includes("film") || value.includes("cinema") || value.includes("movie")) return Film;
    if (value.includes("music") || value.includes("song")) return Music2;
    if (value.includes("book") || value.includes("learn")) return BookOpen;
    if (value.includes("coffee")) return Coffee;
    if (value.includes("nature") || value.includes("outdoor") || value.includes("slow")) return Leaf;
    return Sun;
  };
  const liveAvatar = (profile: ProfileLite | null | undefined, size = "") => {
    const name = profile?.display_name || profile?.username || "Xora member";
    return profile?.avatar_url
      ? <img src={profile.avatar_url} alt={name} className={`avatar ${size}`} />
      : <span className={`avatar avatar-fallback ${size}`} style={{ background: avatarGradient(name), color: "#fff" }} aria-label={name}>{name.split(/\s+/).map((part) => part[0]).slice(0,2).join("").toUpperCase()}</span>;
  };
  const activeMembers = activeRoom ? Object.keys(activeRoom.memberIds || {}).map((id) => profileMap[id]).filter((profile): profile is ProfileLite => Boolean(profile)) : [];
  const activeTitle = activeRoom ? getRoomTitle(activeRoom, currentUserId, profileMap) : "";
  const ActiveRoomIcon = activeRoom ? roomIcon(activeRoom) : Sun;
  const activeSubtitle = activeRoom?.type === "dm" ? "Direct conversation" : `${activeMembers.length || Object.keys(activeRoom?.memberIds || {}).length} members · Community circle`;

  return (
    <div className="xora-page xora-live-page" data-chat-theme={chatTheme}>
      <header className="brand-header">
        <div className="brand-lockup">
          <span className="xora-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M8 7c2 0 3 1 5 4l3 4 3-4c2-3 3-4 5-4M8 25c2 0 3-1 5-4l3-4 3 4c2 3 3 4 5 4" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><circle cx="25" cy="6" r="2" fill="currentColor"/></svg></span>
          <div><div className="brand-name">Xora <span>Chat</span></div><p className="brand-tagline">A little closer, every day</p></div>
        </div>
        <div className="brand-actions">
          <span className="live-label"><span className="online-dot"/> LIVE, TOGETHER</span>
          {currentProfile && <div className="xora-profile-chip">{liveAvatar(currentProfile)}<span>{currentProfile.display_name || currentProfile.username}</span></div>}
          <button className="icon-control xora-icon-button" onClick={onOpenNewGroup} aria-label="Create a circle" title="Create a circle"><MoreHorizontal/></button>
        </div>
      </header>

      <main className={`chat-shell ${activeRoomId ? "mobile-chat" : ""} ${closingRoom ? "closing-room" : ""}`}>
        <aside className="chat-sidebar" aria-label="Conversations">
          <div className="sidebar-top">
            <div className="section-heading">
              <div><h1>Your people</h1><p className="xora-sidebar-subtitle">Conversations & circles</p></div>
              <div className="xora-action-pair">
                <button type="button" className="icon-control xora-icon-button" onClick={toggleChatTheme} title={chatTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-label={chatTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}><span className="xc-theme-glyph">{chatTheme === "dark" ? <Sun/> : <Moon/>}</span></button>
                <button className="icon-control xora-icon-button" onClick={onOpenNewDm} title="New message" aria-label="New message"><MessageCircle/></button>
                <button className="icon-control xora-icon-button xora-create-button" onClick={onOpenNewGroup} title="Create a circle" aria-label="Create a circle"><Plus/></button>
              </div>
            </div>
            <label className="search-field">
              <Search/><input value={roomFilter} onChange={(event) => onRoomFilterChange(event.target.value)} placeholder="Find a person or a circle" aria-label="Search conversations"/>
              {roomFilter && <button type="button" className="xora-clear-search" aria-label="Clear search" onClick={() => onRoomFilterChange("")}><X/></button>}
            </label>
            <nav className="chat-tabs" data-selected={listTab} aria-label="Conversation filters">
              {tabOptions.map((tab) => <button key={tab.id} type="button" className="filter-tab" data-active={listTab === tab.id} aria-pressed={listTab === tab.id} onClick={() => setListTab(tab.id)}>{tab.label}{tab.id === "all" && rooms.some((room) => room.lastMessage) && <span className="tab-count">{rooms.length}</span>}</button>)}
            </nav>
          </div>

          <section className="circles-strip" aria-label="Your circles">
            <div className="section-heading"><h2 className="tiny-heading">Your circles</h2><button type="button" className="xora-text-button" onClick={onOpenNewGroup}>Create new</button></div>
            <div className="circle-items">
              {rooms.filter((room) => room.type === "group").slice(0,3).map((room) => {
                const title = getRoomTitle(room, currentUserId, profileMap);
                const Icon = roomIcon(room);
                const memberCount = Object.keys(room.memberIds || {}).length;
                return <button key={room.id} type="button" className="circle-shortcut" data-active={room.id === activeRoomId} onClick={() => onSelectRoom(room.id)} aria-label={`Open ${title}`}><span className={`circle-art ${room.id === activeRoomId ? "selected" : ""}`}><img src={room.photo_url || circleArtworkFor(title)} alt="" loading="lazy"/></span><span className="circle-meta"><strong>{title}</strong><small>{memberCount} {memberCount === 1 ? "member" : "members"}</small></span></button>;
              })}
              <button type="button" className="circle-shortcut circle-create-shortcut" onClick={onOpenNewGroup} aria-label="Create circle"><span className="circle-art add"><Plus/></span><span className="circle-meta"><strong>Create new</strong><small>Start a space</small></span></button>
            </div>
          </section>

          <div className="list-label"><h2 className="tiny-heading">{listTab === "discover" ? "Find your circle" : "Conversations"}</h2><span>{listTab === "discover" ? "Made for you" : "Recent"} <ChevronDown className="inline ml-1 h-3 w-3"/></span></div>
          {listTab === "discover" && <p className="explore-intro">There’s a little corner of the world for everyone. Find yours.</p>}
          {listTab === "discover" && discoverableError && <div role="alert" className="xora-directory-error"><strong>Circle directory could not refresh</strong><p>{discoverableError}</p></div>}
          <div className="conversation-list">
            {filtered.map((room) => {
              const title = getRoomTitle(room, currentUserId, profileMap);
              const otherId = room.type === "dm" ? Object.keys(room.memberIds || {}).find((id) => id !== currentUserId) : null;
              const other = otherId ? profileMap[otherId] : null;
              const selected = room.id === activeRoomId;
              const Icon = roomIcon(room);
              if (listTab === "discover") {
                const joined = rooms.some((candidate) => candidate.id === room.id);
                const memberCount = Object.keys(room.memberIds || {}).length;
                return <article key={room.id} className="xora-discover-card">
                  <div className="xora-discover-cover"><img src={room.photo_url || circleArtworkFor(title)} alt="" loading="lazy"/><span className="xora-cover-shade"/><span className="xora-cover-count">{memberCount.toLocaleString()} {memberCount === 1 ? "member" : "members"}</span><span className="xora-cover-mark"><Icon/></span></div>
                  <div className="xora-discover-body">
                    <div className="xora-discover-heading"><span className="xora-discover-avatar"><img src={room.photo_url || circleArtworkFor(title)} alt="" loading="lazy"/></span><div><strong>{title}</strong><small><span className="xora-community-chip">COMMUNITY CIRCLE</span></small></div></div>
                    <p>{room.description?.trim() || "A welcoming space to meet people and start conversations."}</p>
                    {room.lastMessage && <div className="xora-discover-latest"><span>RECENTLY SHARED</span><p>{room.lastMessage}</p></div>}
                    <button type="button" className="xora-join-button" onClick={() => joined ? onSelectRoom(room.id) : onJoinGroup(room.id)} disabled={joiningGroupId === room.id}>{joiningGroupId === room.id ? <Loader2 className="animate-spin"/> : joined ? <MessageCircle/> : <Plus/>}{joiningGroupId === room.id ? "Joining…" : joined ? "Open circle" : "Join circle"}</button>
                  </div>
                </article>;
              }
              return <button type="button" key={room.id} className="conversation-item" data-active={selected} onClick={() => onSelectRoom(room.id)} aria-label={`Open ${title}`}>
                {room.type === "dm" ? (other ? liveAvatar(other, "large") : <span className="circle-art"><Users/></span>) : room.photo_url ? <img className="avatar large" src={room.photo_url} alt={title}/> : <span className={`circle-art ${room.name?.toLowerCase().includes("nature") ? "sage" : ""}`}><img src={circleArtworkFor(title)} alt="" loading="lazy"/></span>}
                <span className="conversation-details"><span className="conversation-title"><span>{title}</span>{room.type === "group" && <Users className="h-3 w-3 text-muted-foreground"/>}</span><span className="conversation-preview">{room.lastMessage || (room.type === "group" ? "Your circle is ready for a conversation" : "Say hello and get things started")}</span></span>
                <span className="conversation-meta"><span>{formatTime(room.lastMessageAt)}</span>{selected ? <CheckCheck className="h-3 w-3"/> : <span className="h-[18px]"/>}</span>
              </button>;
            })}
            {roomsLoading && !filtered.length ? <div className="xc-skeleton-list" aria-label="Loading conversations">{Array.from({ length: 4 }).map((_, index) => <div className="xc-skeleton-card" key={index}><i/><span><b/><small/></span></div>)}</div> : !filtered.length && <div className="empty-state"><MessagesSquare/><h3>{listTab === "discover" ? "No public circles yet" : roomFilter ? "No conversations found" : "Every circle begins with a hello."}</h3><p>{listTab === "discover" ? "When someone creates a community circle, it will appear here for everyone to discover and join." : "Start a conversation or create a circle to bring people together."}</p>{listTab !== "discover" && <button type="button" className="xora-text-button" onClick={onOpenNewGroup}>Create a circle</button>}</div>}
          </div>
          <section className="people-section" aria-label="People"><h2>People</h2><div className="flex items-center gap-3 rounded-2xl border border-[var(--xc-line)] bg-white px-3 py-3">{liveAvatar(currentProfile || undefined)}<div className="min-w-0"><strong className="block truncate text-xs">{currentProfile?.display_name || currentProfile?.username || "Your profile"}</strong><small className="block truncate text-[10px] text-muted-foreground">Here for the little things</small></div><span className="online-dot ml-auto" aria-label="Available"/></div></section>
        </aside>

        <section className="conversation-pane" aria-label={activeTitle || "Conversation"}>
          {activeRoom ? <>
            <header className="conversation-header">
              <button type="button" className="icon-control mobile-back" aria-label="Back to conversations" onClick={closeRoom}><ArrowLeft/></button>
              {activeRoom.type === "dm" && activeOther ? liveAvatar(activeOther, "large") : activeRoom.photo_url ? <img className="avatar large" src={activeRoom.photo_url} alt={activeTitle}/> : <span className="circle-art"><img src={circleArtworkFor(activeTitle)} alt="" /></span>}
              <div className="min-w-0"><h2>{activeTitle}</h2><p className="circle-subtitle">{activeRoom.type === "dm" ? <><span className="online-dot"/><span className="online-text">Direct conversation</span></> : <><span className="chat-member-count">{activeMembers.length || Object.keys(activeRoom.memberIds || {}).length} members</span><span className="chat-community-badge">Community circle</span></>}</p></div>
              {activeRoom.type === "group" && activeMembers.length > 0 && <div className="member-stack" aria-label="Circle members">{activeMembers.slice(0,4).map((profile) => <React.Fragment key={profile.id}>{liveAvatar(profile, "small")}</React.Fragment>)}{activeMembers.length > 4 && <span className="member-more">+{activeMembers.length - 4}</span>}</div>}
              <div className="header-tools"><button type="button" className="icon-control xora-icon-button" title="Conversation menu" aria-label="Conversation menu" aria-expanded={roomMenuOpen} onClick={() => setRoomMenuOpen((open) => !open)}><MoreHorizontal/></button></div>
            {roomMenuOpen && <div className="xc-room-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setRoomMenuOpen(false); onOpenNewDm(); }}>New message</button><button type="button" role="menuitem" onClick={() => { setRoomMenuOpen(false); onOpenNewGroup(); }}>Create a circle</button></div>}
            </header>
            {activeRoom.type === "group" && <div className="welcome-banner"><Sun/><div><strong>A little space for your people.</strong><p>Share the everyday, find a little inspiration, and just be yourself.</p></div><Heart className="heart"/></div>}
            <div className="transcript" ref={transcriptRef} onScroll={handleTranscriptScroll} role="log" aria-label="Messages" aria-live="polite">
              {messageRows.map(({ message, first, last, newDay }) => {
                const sender = profileMap[message.senderId];
                const senderName = message.senderName || sender?.display_name || sender?.username || (message.senderId === currentUserId ? currentProfile?.display_name || "You" : "Xora member");
                const own = message.senderId === currentUserId;
                const reactions = localReactions[message.id] || [];
                const reactionCounts = [...new Set(reactions)].map((emoji) => [emoji, reactions.filter((value) => value === emoji).length] as const);
                return <React.Fragment key={message.id}>
                  {newDay && <div className="day-separator"><span>{dayLabel(message.created_at)}</span></div>}
                  <article className={`chat-message ${own ? "own" : ""} ${first ? "group-start" : "group-middle"} ${last ? "group-end" : ""} ${freshMessages.current.has(message.id) ? "message-new" : ""}`}>
                    {!own && (sender?.avatar_url || message.senderAvatar ? <img className="avatar" src={sender?.avatar_url || message.senderAvatar || undefined} alt="" /> : <span className="avatar avatar-fallback" style={{ background: avatarGradient(senderName), color: "#fff" }}>{senderName.slice(0,1).toUpperCase()}</span>)}
                    <div className="message-body">
                      {!own && activeRoom.type === "group" && first && <div className="sender-name">{senderName}</div>}
                      <div className="message-bubble" role="button" tabIndex={0} aria-label="Double tap to react with a heart" onClick={() => reactToMessage(message.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); reactToMessage(message.id); } }}>
                        {message.type === "experience" && <div className="xora-experience-label"><Clapperboard/> Shared Xora experience</div>}
                        <p>{message.text}</p>
                        <span className="message-time">{messageTime(message.created_at)}{own && <CheckCheck aria-label="Sent" />}</span>
                      </div>
                      {reactionCounts.length > 0 && <div className="xc-reaction-row">{reactionCounts.map(([emoji, count]) => <span className="xc-reaction" key={emoji}>{emoji}{count > 1 ? ` ${count}` : ""}</span>)}</div>}
                    </div>
                  </article>
                </React.Fragment>;
              })}
              {!activeMessages.length && !isSending && <div className="empty-state"><MessageCircle/><h3>Say hello</h3><p>Make yourself at home. Share the first little moment.</p></div>}
              {isSending && inputText.trim() && <article className="chat-message own message-new"><div className="message-body"><div className="message-bubble"><p>{inputText}</p><span className="message-time">Sending <i className="xc-sending-dot"/></span></div></div></article>}
              <div ref={endRef}/>
            </div>
            <button type="button" className={`xc-latest-button ${nearLatest ? "" : "visible"}`} aria-label={unreadCount ? `Jump to latest, ${unreadCount} unread messages` : "Jump to latest"} onClick={() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); setUnreadCount(0); setNearLatest(true); }}><span>↓</span>{unreadCount > 0 && <b>{unreadCount > 9 ? "9+" : unreadCount}</b>}</button>
            {isActiveMember ? <div className="composer-area">
              <div className={`xc-emoji-tray ${emojiOpen ? "open" : ""}`}><div>{["😂","❤️","🔥","😍","👏","🙏","😮","🎬"].map((emoji) => <button key={emoji} type="button" aria-label={`Insert ${emoji}`} onClick={() => { onInputTextChange(inputText + emoji); setEmojiOpen(false); }}>{emoji}</button>)}</div></div>
              {isExperience && <div className="xora-experience-editor"><label htmlFor="experience-title">Share an experience</label><input id="experience-title" value={experienceTitle} onChange={(event) => onExperienceTitleChange(event.target.value)} placeholder="What are you watching or sharing?"/></div>}
              <form className="composer" onSubmit={onSend}>
                <button type="button" className={`icon-control xora-icon-button ${isExperience ? "xora-toggle-active" : ""}`} aria-label="Share an experience" title="Share an experience" onClick={onToggleExperience}><Clapperboard/></button>
                <textarea ref={composerRef} aria-label="Message" rows={1} enterKeyHint="send" placeholder={isExperience ? "Add a note about this experience…" : activeRoom.type === "dm" ? "A little hello…" : "Share a little something…"} value={inputText} onChange={(event) => { onInputTextChange(event.target.value); event.currentTarget.style.height = "auto"; event.currentTarget.style.height = Math.min(event.currentTarget.scrollHeight,120) + "px"; }} onFocus={() => setEmojiOpen(false)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && window.matchMedia("(pointer:fine)").matches) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
                <button type="button" className="icon-control xora-icon-button" aria-label="Open emoji tray" title="Emoji" onClick={() => setEmojiOpen((open) => !open)}><Smile/></button>
                <button type="submit" className={`send-control ${inputText.trim() || (isExperience && experienceTitle.trim()) ? "ready" : ""}`} aria-label="Send message" title="Send message" disabled={isSending || (!inputText.trim() && !(isExperience && experienceTitle.trim()))}>{isSending ? <Loader2 className="animate-spin"/> : <Send/>}</button>
              </form>
              <p className="composer-note"><Heart/>A little kindness goes a long way.</p>
            </div> : <div className="xc-join-bar"><p>Join this circle to take part in the conversation.</p><button type="button" onClick={() => onJoinGroup(activeRoom.id)}>Join circle</button></div>}
          </> : <div className="xora-empty-pane"><div className="xora-empty-art" aria-hidden="true"><img className="xora-empty-photo xora-empty-photo-main" src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1000&q=82" alt=""/><img className="xora-empty-photo xora-empty-photo-side" src="https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=500&q=82" alt=""/><span className="xora-empty-orbit"><MessageCircle/></span></div><p className="xora-eyebrow">XORA COMMUNITY</p><h2>Good conversations start here.</h2><p>Pick up where you left off, or find a circle that feels like yours.</p><button type="button" className="xora-primary-button" onClick={() => setListTab("discover")}>Explore circles <ArrowUpRight/></button></div>}
        </section>
      </main>
      <footer className="page-footer"><span className="footer-brand">Xora<span>TV</span> <span className="ml-2 text-[9px] text-muted-foreground">Life is better, shared.</span></span><span className="footer-right">Made for real connection <Heart className="h-3 w-3 text-clay"/></span></footer>
    </div>
  );
}
