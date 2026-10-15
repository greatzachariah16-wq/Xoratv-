import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, Plus, Users, Send, Search, ArrowLeft, Clock, Clapperboard, Sparkles, Lock, Loader2, Compass, MessagesSquare, UsersRound, ArrowUpRight, Film, Music2, BookOpen, Heart, MoreHorizontal, PanelLeftClose, CheckCheck, ChevronDown, Coffee, Info, Leaf, Paperclip, Smile, Sun, Volume2, VolumeX, X } from "lucide-react";

export type ChatRoom = { id: string; type: "dm" | "group"; name: string | null; photo_url: string | null; lastMessage: string | null; lastMessageAt: string | null; memberIds?: Record<string, boolean> };
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
export function getRoomTitle(room: ChatRoom, currentUserId: string | null, profileMap: Record<string, ProfileLite>): string {
  if (room.type === "group" && room.name) return room.name;
  if (room.type === "dm" && room.memberIds && currentUserId) {
    const other = Object.keys(room.memberIds).find((id) => id !== currentUserId);
    if (other && profileMap[other]) return profileMap[other].display_name || profileMap[other].username;
  }
  return room.name || "Xora conversation";
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
  currentUserId: string | null; currentProfile: ProfileLite | null; rooms: ChatRoom[]; discoverableRooms: ChatRoom[]; discoverableError?: string | null; joiningGroupId: string | null; onJoinGroup: (roomId: string) => void; activeRoomId: string | null; messages: ChatMessage[]; profileMap: Record<string, ProfileLite>; isSending: boolean; roomFilter: string; onRoomFilterChange: (v: string) => void; onSelectRoom: (roomId: string) => void; onBackToList: () => void; onOpenNewDm: () => void; onOpenNewGroup: () => void; inputText: string; onInputTextChange: (v: string) => void; isExperience: boolean; onToggleExperience: () => void; experienceTitle: string; onExperienceTitleChange: (v: string) => void; onSend: (e: React.FormEvent) => void; onSignIn: () => void;
}
export default function ChatPage({
  currentUserId, currentProfile, rooms, discoverableRooms, discoverableError, joiningGroupId, onJoinGroup, activeRoomId, messages, profileMap, isSending, roomFilter, onRoomFilterChange, onSelectRoom, onBackToList, onOpenNewDm, onOpenNewGroup, inputText, onInputTextChange, isExperience, onToggleExperience, experienceTitle, onExperienceTitleChange, onSend, onSignIn,
}: ChatPageProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [listTab, setListTab] = useState<"all" | "groups" | "directs" | "discover">("all");
  const activeRoom = rooms.find((room) => room.id === activeRoomId) || null;
  const activeMessages = messages.filter((message) => message.roomId === activeRoomId);
  const filtered = (listTab === "discover" ? discoverableRooms : rooms).filter((room) => {
    if (listTab === "groups" && room.type !== "group") return false;
    if (listTab === "directs" && room.type !== "dm") return false;
    const title = getRoomTitle(room, currentUserId, profileMap), q = roomFilter.toLowerCase();
    return title.toLowerCase().includes(q) || (room.lastMessage || "").toLowerCase().includes(q);
  });
  const activeOtherId = activeRoom?.type === "dm" ? Object.keys(activeRoom.memberIds || {}).find((id) => id !== currentUserId) : null;
  const activeOther = activeOtherId ? profileMap[activeOtherId] : null;
  useEffect(() => { if (activeMessages.length) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeMessages.length, activeRoomId]);

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
      : <span className={`avatar avatar-fallback ${size}`} aria-label={name}>{name.split(/\s+/).map((part) => part[0]).slice(0,2).join("").toUpperCase()}</span>;
  };
  const activeMembers = activeRoom ? Object.keys(activeRoom.memberIds || {}).map((id) => profileMap[id]).filter((profile): profile is ProfileLite => Boolean(profile)) : [];
  const activeTitle = activeRoom ? getRoomTitle(activeRoom, currentUserId, profileMap) : "";
  const ActiveRoomIcon = activeRoom ? roomIcon(activeRoom) : Sun;
  const activeSubtitle = activeRoom?.type === "dm" ? "Here for a good conversation" : activeMembers.length ? `${activeMembers.length} ${activeMembers.length === 1 ? "member" : "members"} · A little closer, every day` : "Community circle · A little closer, every day";

  return (
    <div className="xora-page xora-live-page">
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

      <main className={`chat-shell ${activeRoomId ? "mobile-chat" : ""}`}>
        <aside className="chat-sidebar" aria-label="Conversations">
          <div className="sidebar-top">
            <div className="section-heading">
              <div><h1>Your people</h1><p className="xora-sidebar-subtitle">Conversations & circles</p></div>
              <div className="xora-action-pair">
                <button className="icon-control xora-icon-button" onClick={onOpenNewDm} title="New message" aria-label="New message"><MessageCircle/></button>
                <button className="icon-control xora-icon-button xora-create-button" onClick={onOpenNewGroup} title="Create a circle" aria-label="Create a circle"><Plus/></button>
              </div>
            </div>
            <label className="search-field">
              <Search/><input value={roomFilter} onChange={(event) => onRoomFilterChange(event.target.value)} placeholder="Find a person or a circle" aria-label="Search conversations"/>
              {roomFilter && <button type="button" className="xora-clear-search" aria-label="Clear search" onClick={() => onRoomFilterChange("")}><X/></button>}
            </label>
            <nav className="chat-tabs" aria-label="Conversation filters">
              {tabOptions.map((tab) => <button key={tab.id} type="button" className="filter-tab" data-active={listTab === tab.id} aria-pressed={listTab === tab.id} onClick={() => setListTab(tab.id)}>{tab.label}{tab.id === "all" && rooms.some((room) => room.lastMessage) && <span className="tab-count">{rooms.length}</span>}</button>)}
            </nav>
          </div>

          <section className="circles-strip" aria-label="Your circles">
            <div className="section-heading"><h2 className="tiny-heading">Your circles</h2><button type="button" className="xora-text-button" onClick={onOpenNewGroup}>Create new</button></div>
            <div className="circle-items">
              {rooms.filter((room) => room.type === "group").slice(0,3).map((room) => {
                const title = getRoomTitle(room, currentUserId, profileMap);
                const Icon = roomIcon(room);
                return <button key={room.id} type="button" className="circle-shortcut" onClick={() => onSelectRoom(room.id)} aria-label={`Open ${title}`}><span className={`circle-art ${room.id === activeRoomId ? "selected" : ""}`}><Icon/></span><span>{title}</span></button>;
              })}
              <button type="button" className="circle-shortcut" onClick={onOpenNewGroup} aria-label="Create circle"><span className="circle-art add"><Plus/></span><span>New circle</span></button>
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
                  <div className="xora-discover-heading">{room.photo_url ? <img className="avatar large" src={room.photo_url} alt={title}/> : <span className="circle-art"><Icon/></span>}<div><strong>{title}</strong><small>{memberCount} {memberCount === 1 ? "member" : "members"} · Community circle</small></div></div>
                  <p>{room.lastMessage || "A place to meet people and start conversations."}</p>
                  <button type="button" className="xora-join-button" onClick={() => joined ? onSelectRoom(room.id) : onJoinGroup(room.id)} disabled={joiningGroupId === room.id}>{joiningGroupId === room.id ? <Loader2 className="animate-spin"/> : joined ? <MessageCircle/> : <Plus/>}{joiningGroupId === room.id ? "Joining…" : joined ? "Open circle" : "Join circle"}</button>
                </article>;
              }
              return <button type="button" key={room.id} className="conversation-item" data-active={selected} onClick={() => onSelectRoom(room.id)} aria-label={`Open ${title}`}>
                {room.type === "dm" ? (other ? liveAvatar(other, "large") : <span className="circle-art"><Users/></span>) : room.photo_url ? <img className="avatar large" src={room.photo_url} alt={title}/> : <span className={`circle-art ${room.name?.toLowerCase().includes("nature") ? "sage" : ""}`}><Icon/></span>}
                <span className="conversation-details"><span className="conversation-title"><span>{title}</span>{room.type === "group" && <Users className="h-3 w-3 text-muted-foreground"/>}</span><span className="conversation-preview">{room.lastMessage || (room.type === "group" ? "Your circle is ready for a conversation" : "Say hello and get things started")}</span></span>
                <span className="conversation-meta"><span>{formatTime(room.lastMessageAt)}</span>{selected ? <CheckCheck className="h-3 w-3"/> : <span className="h-[18px]"/>}</span>
              </button>;
            })}
            {!filtered.length && <div className="empty-state"><MessagesSquare/><h3>{listTab === "discover" ? "No public circles yet" : roomFilter ? "No conversations found" : "Every circle begins with a hello."}</h3><p>{listTab === "discover" ? "When someone creates a community circle, it will appear here for everyone to discover and join." : "Start a conversation or create a circle to bring people together."}</p>{listTab !== "discover" && <button type="button" className="xora-text-button" onClick={onOpenNewGroup}>Create a circle</button>}</div>}
          </div>
          <div className="sidebar-bottom">
            {liveAvatar(currentProfile || undefined)}
            <div><strong className="font-medium">{currentProfile?.display_name || currentProfile?.username || "Your profile"}</strong><small>Here for the little things</small></div><span className="online-dot" aria-label="Available"/>
          </div>
        </aside>

        <section className="conversation-pane" aria-label={activeTitle || "Conversation"}>
          {activeRoom ? <>
            <header className="conversation-header">
              <button type="button" className="icon-control mobile-back" aria-label="Back to conversations" onClick={onBackToList}><ArrowLeft/></button>
              {activeRoom.type === "dm" && activeOther ? liveAvatar(activeOther, "large") : activeRoom.photo_url ? <img className="avatar large" src={activeRoom.photo_url} alt={activeTitle}/> : <span className="circle-art"><ActiveRoomIcon/></span>}
              <div className="min-w-0"><h2>{activeTitle}</h2><p className="circle-subtitle">{activeRoom.type === "dm" ? <><span className="online-dot"/><span className="online-text">Direct conversation</span></> : <>{activeMembers.length || Object.keys(activeRoom.memberIds || {}).length} members <span>·</span><span className="online-dot"/><span className="online-text">Community circle</span></>}</p></div>
              {activeRoom.type === "group" && activeMembers.length > 0 && <div className="member-stack" aria-label="Circle members">{activeMembers.slice(0,4).map((profile) => <React.Fragment key={profile.id}>{liveAvatar(profile, "small")}</React.Fragment>)}{activeMembers.length > 4 && <span className="member-more">+{activeMembers.length - 4}</span>}</div>}
              <div className="header-tools"><button type="button" className="icon-control xora-icon-button" title="Create a circle" aria-label="Create a circle" onClick={onOpenNewGroup}><Plus/></button><button type="button" className="icon-control xora-icon-button" title="New message" aria-label="New message" onClick={onOpenNewDm}><MoreHorizontal/></button></div>
            </header>
            {activeRoom.type === "group" && <div className="welcome-banner"><Sun/><div><strong>A little space for your people.</strong><p>Share the everyday, find a little inspiration, and just be yourself.</p></div><Heart className="heart"/></div>}
            <div className="transcript" ref={endRef} role="log" aria-label="Messages" aria-live="polite">
              <div className="day-separator">Your conversation</div>
              {activeMessages.map((message) => {
                const sender = profileMap[message.senderId];
                const senderName = message.senderName || sender?.display_name || sender?.username || (message.senderId === currentUserId ? currentProfile?.display_name || "You" : "Xora member");
                const own = message.senderId === currentUserId;
                return <article key={message.id} className={`chat-message ${own ? "own" : ""}`}>
                  {sender ? liveAvatar(sender) : <span className="avatar avatar-fallback">{senderName.split(/\s+/).map((part) => part[0]).slice(0,2).join("").toUpperCase()}</span>}
                  <div className="message-body">
                    {!own && activeRoom.type === "group" && <div className="sender-name">{senderName}</div>}
                    <div className="message-bubble">{message.type === "experience" && <div className="xora-experience-label"><Clapperboard/> Shared Xora experience</div>}<p>{message.text}</p><span className="message-time">{new Date(message.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}{own && <CheckCheck/>}</span></div>
                  </div>
                </article>;
              })}
              {!activeMessages.length && <div className="empty-state"><MessageCircle/><h3>Every circle begins with a hello.</h3><p>Make yourself at home. Share the first little moment.</p></div>}
              <div ref={endRef}/>
            </div>
            <div className="composer-area">
              {isExperience && <div className="xora-experience-editor"><label htmlFor="experience-title">Share an experience</label><input id="experience-title" value={experienceTitle} onChange={(event) => onExperienceTitleChange(event.target.value)} placeholder="What are you watching or sharing?"/></div>}
              <form className="composer" onSubmit={onSend}>
                <button type="button" className={`icon-control xora-icon-button ${isExperience ? "xora-toggle-active" : ""}`} aria-label="Share an experience" title="Share an experience" onClick={onToggleExperience}><Clapperboard/></button>
                <input aria-label="Message" enterKeyHint="send" placeholder={isExperience ? "Add a note about this experience…" : activeRoom.type === "dm" ? "A little hello…" : "Share a little something…"} value={inputText} onChange={(event) => onInputTextChange(event.target.value)}/>
                <button type="button" className="icon-control xora-icon-button" aria-label="Add a kind emoji" title="Add a kind emoji" onClick={() => onInputTextChange(inputText + " 🤍")}><Smile/></button>
                <button type="submit" className="send-control" aria-label="Send message" title="Send message" disabled={isSending || (!inputText.trim() && !(isExperience && experienceTitle.trim()))}>{isSending ? <Loader2 className="animate-spin"/> : <Send/>}</button>
              </form>
              <p className="composer-note"><Heart/>A little kindness goes a long way.</p>
            </div>
          </> : <div className="xora-empty-pane"><span className="xora-empty-mark"><MessageCircle/></span><p className="xora-eyebrow">YOUR PEOPLE, YOUR SPACE</p><h2>A little closer, every day.</h2><p>Choose a conversation or explore circles to find your people.</p><button type="button" className="xora-primary-button" onClick={() => setListTab("discover")}>Explore communities <ArrowUpRight/></button></div>}
        </section>
      </main>
      <footer className="page-footer"><span className="footer-brand">Xora<span>TV</span> <span className="ml-2 text-[9px] text-muted-foreground">Life is better, shared.</span></span><span className="footer-right">Made for real connection <Heart className="h-3 w-3 text-clay"/></span></footer>
    </div>
  );
}
