import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, Plus, Users, Send, Search, ArrowLeft, Clock, Clapperboard, Sparkles, Lock, Loader2, Compass, MessagesSquare, UsersRound, ArrowUpRight, Film, Music2, BookOpen, Heart, MoreHorizontal, PanelLeftClose } from "lucide-react";

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
  currentUserId: string | null; currentProfile: ProfileLite | null; rooms: ChatRoom[]; activeRoomId: string | null; messages: ChatMessage[]; profileMap: Record<string, ProfileLite>; isSending: boolean; roomFilter: string; onRoomFilterChange: (v: string) => void; onSelectRoom: (roomId: string) => void; onBackToList: () => void; onOpenNewDm: () => void; onOpenNewGroup: () => void; inputText: string; onInputTextChange: (v: string) => void; isExperience: boolean; onToggleExperience: () => void; experienceTitle: string; onExperienceTitleChange: (v: string) => void; onSend: (e: React.FormEvent) => void; onSignIn: () => void;
}
export default function ChatPage({
  currentUserId, currentProfile, rooms, activeRoomId, messages, profileMap, isSending, roomFilter, onRoomFilterChange, onSelectRoom, onBackToList, onOpenNewDm, onOpenNewGroup, inputText, onInputTextChange, isExperience, onToggleExperience, experienceTitle, onExperienceTitleChange, onSend, onSignIn,
}: ChatPageProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [listTab, setListTab] = useState<"all" | "groups" | "directs">("all");
  const activeRoom = rooms.find((room) => room.id === activeRoomId) || null;
  const activeMessages = messages.filter((message) => message.roomId === activeRoomId);
  const filtered = rooms.filter((room) => {
    if (listTab === "groups" && room.type !== "group") return false;
    if (listTab === "directs" && room.type !== "dm") return false;
    const title = getRoomTitle(room, currentUserId, profileMap), q = roomFilter.toLowerCase();
    return title.toLowerCase().includes(q) || (room.lastMessage || "").toLowerCase().includes(q);
  });
  const activeOtherId = activeRoom?.type === "dm" ? Object.keys(activeRoom.memberIds || {}).find((id) => id !== currentUserId) : null;
  const activeOther = activeOtherId ? profileMap[activeOtherId] : null;
  useEffect(() => { if (activeMessages.length) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeMessages.length, activeRoomId]);

  if (!currentUserId) return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-card">
      <div className="relative overflow-hidden bg-gradient-to-br from-clay-soft via-surface to-secondary px-6 py-12 sm:px-10 sm:py-16">
        <div className="absolute -right-12 -top-16 size-56 rounded-full bg-clay/10 blur-2xl" />
        <div className="relative max-w-xl"><span className="inline-flex items-center gap-2 rounded-full border border-clay/20 bg-surface/75 px-3 py-1.5 text-xs font-semibold text-clay"><UsersRound className="size-3.5" /> Xora community</span>
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Your people are here.</h1><p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">Join conversations about films, music, creativity and the things that bring the Xora community together.</p>
          <button onClick={onSignIn} className="press mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-card">Join the conversation <ArrowUpRight className="size-4" /></button>
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-6">{[{icon:Music2,title:"Music & culture",detail:"Talk sounds, artists and new finds"},{icon:Film,title:"Film corner",detail:"Share what you're watching"},{icon:BookOpen,title:"Learn together",detail:"Swap tips and creator knowledge"}].map(({icon:Icon,title,detail}) => <div key={title} className="rounded-2xl border border-border/70 bg-background/70 p-4"><Icon className="size-5 text-clay"/><p className="mt-3 font-display text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>)}</div>
    </div>
  );

  return <section className="mx-auto max-w-7xl overflow-hidden rounded-[1.35rem] border border-white/70 bg-surface shadow-[0_24px_80px_-32px_hsl(var(--foreground)/0.22)] ring-1 ring-border/60 sm:rounded-[1.75rem]">
    <div className="grid min-h-[min(78vh,780px)] grid-cols-1 lg:grid-cols-[330px_minmax(0,1fr)]">
      <aside className={`flex min-h-[70vh] flex-col border-r border-border/70 bg-[linear-gradient(180deg,hsl(var(--surface)),hsl(var(--background)/0.92))] lg:min-h-[680px] ${activeRoomId ? "hidden lg:flex" : "flex"}`}>
        <div className="relative overflow-hidden border-b border-border/70 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--clay)/0.15),transparent_62%)] px-4 pb-4 pt-5 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5"><div className="grid size-11 place-items-center rounded-[1.1rem] bg-gradient-to-br from-clay to-primary text-primary-foreground shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.65)] ring-1 ring-white/40"><MessageCircle className="size-5"/></div><div><h1 className="font-display text-lg font-semibold tracking-tight">Xora Chat <span className="ml-1 inline-block rounded-full bg-sage/15 px-1.5 py-0.5 align-middle text-[8px] font-bold uppercase tracking-wider text-sage">Live</span></h1><p className="text-[11px] text-muted-foreground">A little closer, every day</p></div></div>
            <div className="flex items-center gap-1"><button onClick={onOpenNewDm} title="New message" aria-label="New message" className="press grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-clay-soft/70 hover:text-clay"><MessageCircle className="size-4"/></button><button onClick={onOpenNewGroup} title="Create a circle" aria-label="Create a circle" className="press grid size-9 place-items-center rounded-xl bg-clay-soft text-clay hover:bg-primary hover:text-primary-foreground"><Plus className="size-4.5"/></button></div>
          </div>
          <label className="relative mt-4 block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input value={roomFilter} onChange={(event) => onRoomFilterChange(event.target.value)} placeholder="Search conversations" className="w-full rounded-2xl border border-border/70 bg-background/85 py-3 pl-9 pr-3 text-sm shadow-inner shadow-foreground/[0.02] outline-none transition placeholder:text-muted-foreground focus:border-clay/50 focus:bg-surface focus:ring-4 focus:ring-clay/10"/></label>
          <div className="mt-3 flex rounded-2xl border border-border/50 bg-background/80 p-1 shadow-inner shadow-foreground/[0.02]">{([{id:"all",label:"All"},{id:"groups",label:"Circles"},{id:"directs",label:"Direct"}] as const).map((tab) => <button key={tab.id} onClick={() => setListTab(tab.id)} className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold transition-all duration-200 ${listTab===tab.id?"bg-surface text-clay shadow-[0_2px_8px_-3px_hsl(var(--foreground)/0.22)] ring-1 ring-border/60":"text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>)}</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-4 pb-2 pt-4 sm:px-5"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Recent conversations</p><span className="text-[10px] tabular-nums text-muted-foreground">{filtered.length}</span></div>
          {filtered.length ? filtered.map((room) => {
            const title = getRoomTitle(room,currentUserId,profileMap);
            const otherId = room.type==="dm" ? Object.keys(room.memberIds||{}).find((id)=>id!==currentUserId) : null;
            const other = otherId ? profileMap[otherId] : null;
            const selected = room.id === activeRoomId;
            return <button key={room.id} onClick={()=>onSelectRoom(room.id)} className={`press group relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all duration-200 sm:px-5 ${selected?"bg-gradient-to-r from-clay-soft/90 via-clay-soft/45 to-transparent":"hover:bg-clay-soft/25"}`}>
              <div className="relative shrink-0"><Avatar path={room.type==="dm"?other?.avatar_url:room.photo_url} name={title} size="lg"/>{room.type==="group"&&<span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full border-2 border-surface bg-sage/20 text-sage"><Users className="size-2.5"/></span>}</div>
              <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className={`truncate text-[13px] ${selected?"font-semibold text-foreground":"font-medium"}`}>{title}</span><span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(room.lastMessageAt)}</span></div><p className={`mt-1 truncate text-xs ${selected?"text-foreground/70":"text-muted-foreground"}`}>{room.lastMessage || (room.type==="group"?"Your circle is ready for a conversation":"Say hello and get things started")}</p></div>
            </button>;
          }) : <div className="px-5 py-12 text-center"><div className="mx-auto grid size-12 place-items-center rounded-full bg-clay-soft/70 text-clay"><MessagesSquare className="size-5"/></div><p className="mt-3 text-sm font-semibold">{roomFilter.trim()?"No matches yet":"No conversations yet"}</p><p className="mx-auto mt-1 max-w-[220px] text-xs leading-5 text-muted-foreground">Start a conversation or create a circle to bring people together.</p><button onClick={onOpenNewGroup} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"><Plus className="size-3.5"/> Create a circle</button></div>}
        </div>
        <div className="border-t border-border/70 px-4 py-3 sm:px-5"><div className="flex items-center gap-2 text-[10px] text-muted-foreground"><Lock className="size-3.5 text-clay"/> Messages are kept for 30 days</div></div>
      </aside>

      <main className={`relative min-w-0 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top_right,hsl(var(--clay)/0.13),transparent_45%),radial-gradient(ellipse_at_bottom_left,hsl(var(--sage)/0.10),transparent_42%),hsl(var(--background)/0.92)] ${activeRoomId ? "flex min-h-[75vh]" : "hidden lg:flex"}`}>
        {!activeRoom ? <div className="relative flex min-h-[680px] flex-1 flex-col items-center justify-center overflow-hidden px-6 py-12 text-center">
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{backgroundImage:"radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0)",backgroundSize:"24px 24px"}}/>
          <div className="relative"><div className="mx-auto grid size-20 place-items-center rounded-[1.75rem] border border-clay/15 bg-clay-soft/70 text-clay shadow-card"><MessagesSquare className="size-8"/></div><h2 className="mt-5 font-display text-2xl font-semibold tracking-tight">A little more connected.</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Choose a conversation to pick up where you left off, or start a new one with your Xora community.</p><div className="mt-6 flex flex-wrap justify-center gap-2"><button onClick={onOpenNewDm} className="press inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold hover:border-clay/30"><MessageCircle className="size-4 text-clay"/> New message</button><button onClick={onOpenNewGroup} className="press inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><Plus className="size-4"/> Create a circle</button></div><p className="mt-8 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface/80 px-3 py-1.5 text-[10px] text-muted-foreground"><Heart className="size-3 text-clay"/> Made for shared interests, not just DMs</p></div>
        </div> : <>
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/60 bg-surface/85 px-3 py-3.5 shadow-[0_8px_24px_-22px_hsl(var(--foreground)/0.35)] backdrop-blur-xl sm:px-5">
            <button onClick={onBackToList} className="press grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-clay-soft/70 lg:hidden" aria-label="Back to conversations"><ArrowLeft className="size-4.5"/></button>
            <Avatar path={activeRoom.type==="dm"?activeOther?.avatar_url:activeRoom.photo_url} name={getRoomTitle(activeRoom,currentUserId,profileMap)} size="md"/>
            <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{getRoomTitle(activeRoom,currentUserId,profileMap)}</h2><p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="inline-block size-1.5 rounded-full bg-sage"/>{activeRoom.type==="group"?"Xora community circle":"Direct conversation"} <span className="text-border">·</span> <Lock className="size-3"/> 30-day history</p></div>
            <button onClick={onBackToList} className="press hidden size-9 place-items-center rounded-xl text-muted-foreground hover:bg-clay-soft/70 lg:grid" title="Back to conversations" aria-label="Back to conversations"><PanelLeftClose className="size-4"/></button>
            <button className="press grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-clay-soft/70" title="Conversation details" aria-label="Conversation details"><MoreHorizontal className="size-5"/></button>
          </header>
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto px-3 py-5 sm:px-6 sm:py-7" style={{backgroundImage:"radial-gradient(circle at 1px 1px, hsl(var(--border) / 0.35) 1px, transparent 0)",backgroundSize:"22px 22px"}}>
              <div className="mx-auto mb-6 flex w-fit max-w-full items-center gap-2 rounded-full border border-border/80 bg-surface/90 px-3.5 py-2 text-[10px] text-muted-foreground shadow-sm"><Lock className="size-3 text-clay"/> Messages in Xora Chat automatically expire after 30 days</div>
              {activeMessages.map((message)=>{const mine=message.senderId===currentUserId;const sender=profileMap[message.senderId];const name=sender?.display_name||message.senderName||"Community member";return <div key={message.id} className={`flex items-end gap-2 ${mine?"justify-end":"justify-start"}`}>{!mine&&activeRoom.type==="group"&&<Avatar path={sender?.avatar_url||message.senderAvatar} name={name} size="sm"/>}<div className={`flex max-w-[88%] flex-col sm:max-w-[72%] ${mine?"items-end":"items-start"}`}>{!mine&&activeRoom.type==="group"&&<span className="mb-1 ml-2 text-[10px] font-semibold text-clay">{name}</span>}<div className={`rounded-[1.25rem] px-3.5 py-2.5 text-[13px] leading-6 shadow-[0_6px_20px_-15px_hsl(var(--foreground)/0.35)] sm:px-4 ${mine?"rounded-br-[0.35rem] bg-gradient-to-br from-primary to-clay text-primary-foreground":"rounded-bl-[0.35rem] border border-white/80 bg-surface/95 text-foreground ring-1 ring-border/50 backdrop-blur-sm"}`}>{message.type==="experience"&&<div className={`mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold ${mine?"bg-white/15":"bg-clay-soft/70 text-clay"}`}><Clapperboard className="size-3.5"/><Sparkles className="size-3"/> Watch experience</div>}<p className="whitespace-pre-wrap break-words">{message.text}</p><div className={`mt-1 flex items-center justify-end gap-1 text-[9px] ${mine?"text-primary-foreground/70":"text-muted-foreground"}`}>{messageTime(message.created_at)}</div></div></div></div>;})}
              {!activeMessages.length&&<div className="flex min-h-[260px] flex-1 flex-col items-center justify-center text-center"><div className="grid size-14 place-items-center rounded-full border border-border bg-surface text-clay"><MessageCircle className="size-6"/></div><p className="mt-3 text-sm font-semibold">Say hello 👋</p><p className="mt-1 text-xs text-muted-foreground">Your conversation starts with the first message.</p></div>}
              <div ref={endRef}/>
            </div>
            <div className="border-t border-white/70 bg-surface/90 p-3 shadow-[0_-12px_32px_-28px_hsl(var(--foreground)/0.3)] backdrop-blur-xl sm:px-5 sm:py-4">
              {isExperience&&<div className="mb-3 flex items-center gap-2 rounded-xl border border-clay/20 bg-clay-soft/35 px-3 py-2.5"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-clay"><Clapperboard className="size-4"/></div><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold text-clay">Share a watch experience</p><input value={experienceTitle} onChange={(event)=>onExperienceTitleChange(event.target.value)} placeholder="Film or experience title" className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"/></div></div>}
              <form onSubmit={onSend} className="flex items-end gap-2 rounded-[1.35rem] border border-border/70 bg-background/90 p-2.5 shadow-[0_8px_24px_-20px_hsl(var(--foreground)/0.4)] transition-all focus-within:border-clay/50 focus-within:bg-surface focus-within:shadow-[0_0_0_4px_hsl(var(--clay)/0.08)]">
                <button type="button" onClick={onToggleExperience} aria-label="Share a watch experience" title="Share a watch experience" className={`press mb-0.5 grid size-9 shrink-0 place-items-center rounded-xl transition ${isExperience?"bg-clay-soft text-clay":"text-muted-foreground hover:bg-clay-soft/60 hover:text-clay"}`}><Clapperboard className="size-4.5"/></button>
                <textarea rows={1} value={inputText} onChange={(event)=>onInputTextChange(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();if(inputText.trim()||experienceTitle.trim()){event.currentTarget.form?.requestSubmit();}}}} placeholder="Write a message…" disabled={isSending} maxLength={2000} className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-[13px] leading-5 outline-none placeholder:text-muted-foreground disabled:opacity-60"/>
                <div className="flex shrink-0 items-center gap-1"><span className="hidden text-[9px] tabular-nums text-muted-foreground sm:inline">{inputText.length}/2000</span><button type="submit" disabled={isSending||(!inputText.trim()&&!experienceTitle.trim())} aria-label="Send message" className="press grid size-10 place-items-center rounded-[1rem] bg-gradient-to-br from-primary to-clay text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.6)] transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40">{isSending?<Loader2 className="size-4 animate-spin"/>:<Send className="size-4"/>}</button></div>
              </form>
              <p className="mt-2 flex items-center justify-between gap-2 px-1 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Sparkles className="size-3 text-clay"/> Keep it kind. Make room for everyone.</span><span className="inline-flex shrink-0 items-center gap-1"><Clock className="size-3"/> 30-day retention</span></p>
            </div>
          </div>
        </>}
      </main>
    </div>
  </section>;
}
