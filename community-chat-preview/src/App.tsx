import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, Bell, Bookmark, Check, CheckCheck,
  ChevronDown, ChevronRight, CircleHelp, Compass, Ellipsis, Film, Hash,
  Image as ImageIcon, Info, Link2, MessageCircle, MessageSquare, MoreHorizontal,
  Paperclip, Plus, Search, Send, Settings, Smile, Sparkle, Users, Video,
  X, Zap
} from "lucide-react";

type Section = "inbox" | "discover" | "circles" | "saved" | "profile";
type Filter = "all" | "unread" | "groups";
type Person = { name: string; handle: string; avatar: string; role?: string; bio?: string };
type Chat = {
  id: string; name: string; kind: "circle" | "direct"; avatar: string; lastMessage: string;
  time: string; unread: number; members: number; online: number; description: string;
  category: string; pinned?: boolean; color: string;
};
type Reaction = { emoji: string; count: number; active?: boolean };
type Message = {
  id: string; author: string; avatar: string; time: string; text: string;
  own?: boolean; reactions?: Reaction[]; reply?: string;
};

const people: Person[] = [
  { name: "Maya Bennett", handle: "@mayab", avatar: "https://i.pravatar.cc/120?img=47", role: "Film editor", bio: "Collecting stories, soundtracks and the small details that make a film stay with you." },
  { name: "Jordan Lee", handle: "@jordanlee", avatar: "https://i.pravatar.cc/120?img=12", role: "Community host", bio: "Building thoughtful spaces for people who love a good conversation." },
  { name: "Tobi Adebayo", handle: "@tobitalks", avatar: "https://i.pravatar.cc/120?img=68", role: "Creator", bio: "Football, culture and the beautiful chaos in between." },
  { name: "Nina Okafor", handle: "@ninao", avatar: "https://i.pravatar.cc/120?img=44", role: "Music curator", bio: "Sharing new sounds and old favourites from everywhere." },
  { name: "Ethan Brooks", handle: "@ethanb", avatar: "https://i.pravatar.cc/120?img=59", role: "Product designer", bio: "Curious about how good products make people feel welcome." },
  { name: "Amara James", handle: "@amaraj", avatar: "https://i.pravatar.cc/120?img=49", role: "Member", bio: "Here for the stories, the people and the late-night recommendations." },
];

const initialChats: Chat[] = [
  { id: "film", name: "The Film Room", kind: "circle", avatar: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=160&q=85", lastMessage: "Maya: That final scene deserves its own conversation.", time: "now", unread: 4, members: 1284, online: 86, description: "A thoughtful corner for people who love cinema, storytelling and the details in between.", category: "Film & TV", pinned: true, color: "lavender" },
  { id: "football", name: "Matchday Circle", kind: "circle", avatar: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=160&q=85", lastMessage: "Tobi: The second half is going to be interesting.", time: "2m", unread: 2, members: 3460, online: 214, description: "Live match talk, smart takes and all the moments worth replaying.", category: "Football", color: "mint" },
  { id: "maya", name: "Maya Bennett", kind: "direct", avatar: people[0].avatar, lastMessage: "Sent you the playlist we talked about.", time: "18m", unread: 0, members: 2, online: 1, description: "Direct conversation", category: "Direct", color: "peach" },
  { id: "creator", name: "Creator Lounge", kind: "circle", avatar: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=160&q=85", lastMessage: "Jordan: Small wins count. Share one today.", time: "31m", unread: 0, members: 892, online: 43, description: "A space for creators to exchange ideas, ask questions and grow together.", category: "Creators", color: "blue", pinned: true },
  { id: "sound", name: "Sound & Discovery", kind: "circle", avatar: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=160&q=85", lastMessage: "Nina: This week's finds are up 🎧", time: "1h", unread: 0, members: 631, online: 28, description: "New music, deep cuts and the songs you can't stop sharing.", category: "Music", color: "rose" },
  { id: "ethan", name: "Ethan Brooks", kind: "direct", avatar: people[4].avatar, lastMessage: "You: Let me send you the mockup.", time: "yesterday", unread: 0, members: 2, online: 0, description: "Direct conversation", category: "Direct", color: "sand" },
];

const initialMessages: Record<string, Message[]> = {
  film: [
    { id: "m1", author: "Maya Bennett", avatar: people[0].avatar, time: "10:42 AM", text: "I finally watched it last night. That final scene deserves its own conversation.", reactions: [{ emoji: "🎬", count: 8 }, { emoji: "❤️", count: 3 }] },
    { id: "m2", author: "Jordan Lee", avatar: people[1].avatar, time: "10:45 AM", text: "The silence before the last shot. I think that's what made it land so hard.", reactions: [{ emoji: "👏", count: 5 }] },
    { id: "m3", author: "Tobi Adebayo", avatar: people[2].avatar, time: "10:48 AM", text: "The sound design was doing so much work there. I want to watch it again with headphones." },
    { id: "m4", author: "You", avatar: "https://i.pravatar.cc/120?img=32", time: "10:51 AM", text: "Same. I also love how the director trusted us to sit with the ending instead of explaining everything.", own: true, reactions: [{ emoji: "💜", count: 4, active: true }] },
    { id: "m5", author: "Nina Okafor", avatar: people[3].avatar, time: "10:55 AM", text: "That is the difference between a good ending and one you keep thinking about all week." },
    { id: "m6", author: "Maya Bennett", avatar: people[0].avatar, time: "11:02 AM", text: "I made a little watchlist of films with that same kind of ending. Sharing it here after lunch.", reply: "Same. I also love how the director trusted us to sit with the ending..." },
  ],
  football: [
    { id: "f1", author: "Tobi Adebayo", avatar: people[2].avatar, time: "8:16 PM", text: "That press is finally starting to click. The midfield shape looks completely different tonight.", reactions: [{ emoji: "⚽", count: 12 }] },
    { id: "f2", author: "Amara James", avatar: people[5].avatar, time: "8:18 PM", text: "The second half is going to be interesting. They need to keep the tempo." },
    { id: "f3", author: "You", avatar: "https://i.pravatar.cc/120?img=32", time: "8:21 PM", text: "Agreed. The space between the lines is opening up now.", own: true },
  ],
  maya: [
    { id: "a1", author: "Maya Bennett", avatar: people[0].avatar, time: "Yesterday", text: "You should listen to this before the weekend. It has the same late-night feeling as that film soundtrack." },
    { id: "a2", author: "You", avatar: "https://i.pravatar.cc/120?img=32", time: "Yesterday", text: "That is exactly the mood I was looking for. Thank you!", own: true, reactions: [{ emoji: "🫶", count: 1, active: true }] },
    { id: "a3", author: "Maya Bennett", avatar: people[0].avatar, time: "11:18 AM", text: "Sent you the playlist we talked about." },
  ],
  creator: [
    { id: "c1", author: "Jordan Lee", avatar: people[1].avatar, time: "9:03 AM", text: "A reminder that small wins count. Share one thing you shipped, learned or improved this week." },
    { id: "c2", author: "You", avatar: "https://i.pravatar.cc/120?img=32", time: "9:12 AM", text: "I finally finished the first pass of a project I've been putting off. Keeping the momentum going.", own: true, reactions: [{ emoji: "🔥", count: 6 }] },
  ],
  sound: [
    { id: "s1", author: "Nina Okafor", avatar: people[3].avatar, time: "Yesterday", text: "This week's finds are up 🎧 A little alt-R&B, some highlife and a track I can't stop replaying." },
  ],
  ethan: [
    { id: "e1", author: "Ethan Brooks", avatar: people[4].avatar, time: "Yesterday", text: "The spacing is looking much better. Send the latest when you're ready." },
    { id: "e2", author: "You", avatar: "https://i.pravatar.cc/120?img=32", time: "Yesterday", text: "Let me send you the mockup.", own: true },
  ],
};

const emojiOptions = ["❤️", "😂", "🔥", "👏", "😍", "🎬", "⚽", "💜", "✨", "🙌"];
const number = (value: number) => value >= 1000 ? (value / 1000).toFixed(1).replace(".0", "") + "k" : String(value);

function Avatar({ src, name, size = "md", online = false }: { src: string; name: string; size?: "sm" | "md" | "lg" | "xl"; online?: boolean }) {
  return <span className={"avatar avatar-" + size}>
    <img src={src} alt={name} loading="lazy" />
    {online && <i className="online-dot" />}
  </span>;
}

function Brand() {
  return <span className="brand-mark" aria-label="XoraTV">x</span>;
}

export default function App() {
  const [section, setSection] = useState<Section>("inbox");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState("film");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [messages, setMessages] = useState<Record<string, Message[]>>(initialMessages);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [circleName, setCircleName] = useState("");
  const [circleDescription, setCircleDescription] = useState("");
  const [circleCategory, setCircleCategory] = useState("Film & TV");
  const [joined, setJoined] = useState<string[]>(["film", "football", "creator"]);
  const [following, setFollowing] = useState(false);
  const [profileOpen, setProfileOpen] = useState<Person | null>(null);
  const [notice, setNotice] = useState("");

  const activeChat = chats.find((chat) => chat.id === activeId) || chats[0];
  const activeMessages = messages[activeChat.id] || [];
  const filteredChats = useMemo(() => chats.filter((chat) => {
    const matchesQuery = (chat.name + " " + chat.lastMessage + " " + chat.category).toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "all" || (filter === "unread" && chat.unread > 0) || (filter === "groups" && chat.kind === "circle");
    return matchesQuery && matchesFilter;
  }), [chats, query, filter]);
  const circles = chats.filter((chat) => chat.kind === "circle");
  const activeJoined = joined.includes(activeChat.id);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  };

  const openChat = (id: string) => {
    setActiveId(id);
    setSection("inbox");
    setMobileChatOpen(true);
    setChats((items) => items.map((chat) => chat.id === id ? { ...chat, unread: 0 } : chat));
  };

  const changeSection = (next: Section) => {
    setSection(next);
    setMobileChatOpen(false);
    setQuery("");
  };

  const sendMessage = () => {
    if (!draft.trim()) return;
    const text = draft.trim();
    const newMessage: Message = {
      id: "msg-" + Date.now(),
      author: "You",
      avatar: "https://i.pravatar.cc/120?img=32",
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      text,
      own: true,
      reply: replyTo ? replyTo.text : undefined,
    };
    setMessages((current) => ({ ...current, [activeChat.id]: [...(current[activeChat.id] || []), newMessage] }));
    setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, lastMessage: "You: " + text, time: "now" } : chat));
    setDraft("");
    setReplyTo(null);
    setEmojiOpen(false);
    setAttachOpen(false);
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const toggleReaction = (messageId: string, emoji: string) => {
    setMessages((current) => ({
      ...current,
      [activeChat.id]: (current[activeChat.id] || []).map((message) => {
        if (message.id !== messageId) return message;
        const reactions = message.reactions || [];
        const found = reactions.find((reaction) => reaction.emoji === emoji);
        if (!found) return { ...message, reactions: [...reactions, { emoji, count: 1, active: true }] };
        return { ...message, reactions: reactions.map((reaction) => reaction.emoji === emoji ? { ...reaction, count: reaction.count + (reaction.active ? -1 : 1), active: !reaction.active } : reaction).filter((reaction) => reaction.count > 0) };
      }),
    }));
    setEmojiOpen(false);
  };

  const toggleJoin = (id: string) => {
    setJoined((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  const createCircle = (event: FormEvent) => {
    event.preventDefault();
    if (!circleName.trim() || !circleDescription.trim()) return;
    const id = "circle-" + Date.now();
    const circle: Chat = {
      id, name: circleName.trim(), kind: "circle",
      avatar: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=160&q=85",
      lastMessage: "Your circle is ready. Start the conversation.",
      time: "now", unread: 0, members: 1, online: 1, description: circleDescription.trim(),
      category: circleCategory, color: "lavender",
    };
    setChats((current) => [circle, ...current]);
    setMessages((current) => ({ ...current, [id]: [] }));
    setJoined((current) => [...current, id]);
    setCircleName("");
    setCircleDescription("");
    setCreateOpen(false);
    openChat(id);
    showNotice("Your circle is ready");
  };

  const navItems: { id: Section; label: string; icon: typeof MessageCircle }[] = [
    { id: "inbox", label: "Inbox", icon: MessageCircle },
    { id: "discover", label: "Discover", icon: Compass },
    { id: "circles", label: "Circles", icon: Users },
    { id: "saved", label: "Saved", icon: Bookmark },
    { id: "profile", label: "Profile", icon: Users },
  ];

  return <div className={"app-shell" + (mobileChatOpen ? " mobile-chat-open" : "")}>
    <aside className="left-rail">
      <Brand />
      <div className="rail-group">
        {navItems.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={"rail-button" + (section === item.id ? " active" : "")} title={item.label} aria-label={item.label} onClick={() => changeSection(item.id)}>
            <Icon size={20} strokeWidth={1.85} />
            <span className="rail-label">{item.label}</span>
          </button>;
        })}
      </div>
      <div className="rail-spacer" />
      <button className="rail-button" title="Help" onClick={() => showNotice("Help centre is coming soon")}><CircleHelp size={19} /></button>
      <button className="rail-button" title="Settings" onClick={() => showNotice("Settings preview")}><Settings size={19} /></button>
      <button className="rail-profile" onClick={() => changeSection("profile")} aria-label="Your profile"><Avatar src="https://i.pravatar.cc/120?img=32" name="You" size="md" online /></button>
    </aside>

    <div className="workspace">
      {section === "inbox" && <div className="inbox-grid">
        <aside className="conversation-list">
          <div className="list-heading">
            <div><span className="overline">YOUR SPACE</span><h1>Messages</h1></div>
            <button className="icon-button new-message" title="New message" onClick={() => showNotice("Choose a member to start a conversation")}><Plus size={19} /></button>
          </div>
          <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" /><kbd>⌘ K</kbd></label>
          <div className="filter-tabs" role="tablist" aria-label="Conversation filters">
            {(["all", "unread", "groups"] as Filter[]).map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All" : item === "unread" ? "Unread" : "Groups"}</button>)}
          </div>
          <div className="list-section-label"><span>RECENT</span><button onClick={() => showNotice("Your conversations are up to date")}><Ellipsis size={17} /></button></div>
          <div className="conversation-items">
            {filteredChats.map((chat) => <button key={chat.id} className={"conversation-row" + (activeId === chat.id ? " selected" : "")} onClick={() => openChat(chat.id)}>
              <span className="row-avatar-wrap"><Avatar src={chat.avatar} name={chat.name} size="lg" online={chat.online > 0 && chat.kind === "direct"} /></span>
              <span className="row-copy">
                <span className="row-top"><strong>{chat.name}</strong><time>{chat.time}</time></span>
                <span className="row-bottom"><span>{chat.lastMessage}</span>{chat.unread > 0 && <i className="unread-count">{chat.unread}</i>}</span>
              </span>
            </button>)}
            {filteredChats.length === 0 && <div className="empty-state"><Search size={22} /><strong>No conversations found</strong><span>Try another name or filter.</span></div>}
          </div>
          <div className="list-footer"><span className="live-indicator" /> All caught up <span className="footer-dot">·</span> XoraTV Community</div>
        </aside>

        <section className="chat-view">
          <header className="chat-header">
            <button className="back-button" onClick={() => setMobileChatOpen(false)} aria-label="Back to conversations"><ArrowLeft size={20} /></button>
            <Avatar src={activeChat.avatar} name={activeChat.name} size="lg" online={activeChat.online > 0} />
            <div className="chat-heading-copy"><strong>{activeChat.name}</strong><span>{activeChat.kind === "circle" ? number(activeChat.members) + " members · " + activeChat.online + " online" : "Active now"}</span></div>
            <div className="chat-header-actions">
              <button className="icon-button" title="Search in conversation" onClick={() => showNotice("Conversation search is ready to explore")}><Search size={19} /></button>
              <button className={"icon-button" + (infoOpen ? " active" : "")} title="Conversation details" onClick={() => setInfoOpen(!infoOpen)}><Info size={19} /></button>
              <button className="icon-button" title="More options" onClick={() => showNotice("More conversation options")}><MoreHorizontal size={20} /></button>
            </div>
          </header>

          {activeChat.kind === "circle" && <div className="pinned-strip"><span className="pin-icon"><Zap size={14} /></span><span><b>Welcome to {activeChat.name}</b><i>Keep it kind, curious and on topic.</i></span><button onClick={() => showNotice("Pinned message opened")}>View <ChevronRight size={14} /></button></div>}

          <div className="message-scroll">
            <div className="day-divider"><span>Today</span></div>
            <div className="message-stack">
              {activeMessages.map((message) => <div key={message.id} className={"message-row" + (message.own ? " own" : "")}>
                {!message.own && <button className="message-avatar-button" onClick={() => setProfileOpen(people.find((person) => person.name === message.author) || people[0])}><Avatar src={message.avatar} name={message.author} size="md" /></button>}
                <div className="message-content">
                  {!message.own && <div className="message-meta"><button onClick={() => setProfileOpen(people.find((person) => person.name === message.author) || people[0])}>{message.author}</button><time>{message.time}</time></div>}
                  {message.reply && <div className="reply-preview"><span />{message.reply}</div>}
                  <div className="message-bubble">{message.text}</div>
                  <div className="message-tools">
                    {message.reactions?.map((reaction) => <button key={reaction.emoji} className={"reaction-chip" + (reaction.active ? " reacted" : "")} onClick={() => toggleReaction(message.id, reaction.emoji)}>{reaction.emoji}<span>{reaction.count}</span></button>)}
                    <button className="quick-react" title="Add reaction" onClick={() => { setReplyTo(null); setEmojiOpen(true); }}><Smile size={14} /></button>
                    <button className="quick-reply" title="Reply to message" onClick={() => setReplyTo(message)}><ArrowDownLeft size={14} /></button>
                  </div>
                </div>
                {message.own && <Avatar src={message.avatar} name="You" size="md" />}
              </div>)}
              {activeMessages.length === 0 && <div className="empty-thread"><div className="empty-thread-icon"><MessageCircle size={24} /></div><strong>This circle is ready for a good conversation.</strong><span>Be the first to say hello.</span></div>}
            </div>
            <div className="typing-line"><span className="typing-dots"><i /><i /><i /></span><span>Maya is typing</span></div>
          </div>

          <div className="composer-wrap">
            {replyTo && <div className="replying-to"><span>Replying to <b>{replyTo.author}</b><small>{replyTo.text}</small></span><button onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={16} /></button></div>}
            {emojiOpen && <div className="emoji-picker">{emojiOptions.map((emoji) => <button key={emoji} onClick={() => { if (activeMessages.length) toggleReaction(activeMessages[activeMessages.length - 1].id, emoji); else setDraft((value) => value + emoji); }}>{emoji}</button>)}</div>}
            {attachOpen && <div className="attach-menu"><button onClick={() => { setAttachOpen(false); showNotice("Photo attachment preview"); }}><ImageIcon size={16} /> Photo</button><button onClick={() => { setAttachOpen(false); showNotice("Video attachment preview"); }}><Video size={16} /> Video</button><button onClick={() => { setAttachOpen(false); showNotice("Link sharing preview"); }}><Link2 size={16} /> Share a link</button></div>}
            <div className="composer">
              <button className="composer-action" title="Add attachment" onClick={() => { setAttachOpen(!attachOpen); setEmojiOpen(false); }}><Plus size={19} /></button>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onComposerKeyDown} rows={1} placeholder={"Message " + activeChat.name + "..."} aria-label="Write a message" />
              <button className="composer-action emoji-action" title="Choose emoji" onClick={() => { setEmojiOpen(!emojiOpen); setAttachOpen(false); }}><Smile size={19} /></button>
              <button className="send-button" title="Send message" onClick={sendMessage} disabled={!draft.trim()}><Send size={17} /></button>
            </div>
            <div className="composer-hint">Press <kbd>Enter</kbd> to send <span>·</span> <kbd>Shift + Enter</kbd> for a new line</div>
          </div>
        </section>

        {infoOpen && <aside className="details-panel">
          <div className="details-top"><span>CONVERSATION</span><button className="icon-button" title="Close details" onClick={() => setInfoOpen(false)}><X size={17} /></button></div>
          <div className="group-summary">
            <div className="group-cover"><img src={activeChat.avatar} alt="" /><span className="cover-fade" /></div>
            <h2>{activeChat.name}</h2><p>{activeChat.description}</p>
            {activeChat.kind === "circle" && <div className="group-stats"><span><b>{number(activeChat.members)}</b> members</span><span><b>{activeChat.online}</b> online</span></div>}
            {activeChat.kind === "circle" && <button className={"join-button" + (activeJoined ? " joined" : "")} onClick={() => toggleJoin(activeChat.id)}>{activeJoined ? <><Check size={15} /> Joined</> : <><Plus size={15} /> Join circle</>}</button>}
          </div>
          <div className="detail-section"><div className="detail-heading"><strong>Members online</strong><button onClick={() => showNotice("Showing all members")}>See all</button></div>
            {people.slice(0, 4).map((person, index) => <button className="member-row" key={person.handle} onClick={() => setProfileOpen(person)}><Avatar src={person.avatar} name={person.name} size="sm" online={index < 3} /><span><b>{person.name}</b><small>{index === 0 ? "Host" : person.role}</small></span><i className="member-status" /></button>)}
          </div>
          <div className="detail-section"><div className="detail-heading"><strong>Pinned for later</strong><button onClick={() => changeSection("saved")}>View all</button></div>
            <button className="pinned-item" onClick={() => showNotice("Pinned note opened")}><span className="pinned-thumb"><Film size={16} /></span><span><b>Community watchlist</b><small>Shared by Maya · 6 links</small></span><ChevronRight size={15} /></button>
            <button className="pinned-item" onClick={() => showNotice("Shared media opened")}><span className="pinned-thumb lavender"><ImageIcon size={16} /></span><span><b>Weekend film picks</b><small>12 photos and videos</small></span><ChevronRight size={15} /></button>
          </div>
          <div className="detail-bottom"><button onClick={() => showNotice("Notification preferences opened")}><Bell size={16} /> Notifications</button><button onClick={() => showNotice("Circle settings opened")}><Settings size={16} /> Circle settings</button></div>
        </aside>}
      </div>}

      {section === "discover" && <section className="page-view">
        <div className="page-header"><div><span className="overline">DISCOVER</span><h1>Find your people.</h1><p>Good conversations start with shared interests.</p></div><button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={17} /> Create a circle</button></div>
        <div className="discover-hero"><div className="hero-glow" /><div className="hero-copy"><span className="hero-tag"><span /> YOUR NEXT CONVERSATION STARTS HERE</span><h2>There’s a circle<br />for what you love.</h2><p>Meet people who care about the same things you do — from the films you watch to the ideas you can't stop thinking about.</p><label className="hero-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search interests, topics or circles" /></label></div><div className="hero-art"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core">x</div><div className="orbit-avatar one"><Avatar src={people[0].avatar} name="Maya" size="lg" /></div><div className="orbit-avatar two"><Avatar src={people[2].avatar} name="Tobi" size="lg" /></div><div className="orbit-avatar three"><Avatar src={people[3].avatar} name="Nina" size="lg" /></div><div className="orbit-avatar four"><Avatar src={people[4].avatar} name="Ethan" size="lg" /></div></div></div>
        <div className="section-title-row"><div><h2>Popular this week</h2><p>Communities people are enjoying right now</p></div><button className="text-link" onClick={() => changeSection("circles")}>Explore all <ArrowUpRight size={16} /></button></div>
        <div className="circle-grid">{circles.filter((chat) => (chat.name + chat.category).toLowerCase().includes(query.toLowerCase())).slice(0, 6).map((chat, index) => <CircleCard key={chat.id} chat={chat} joined={joined.includes(chat.id)} onJoin={() => toggleJoin(chat.id)} onOpen={() => openChat(chat.id)} index={index} />)}</div>
        <div className="topic-row"><span>EXPLORE BY INTEREST</span>{["Film & TV", "Football", "Creators", "Music", "Technology", "Culture"].map((topic) => <button key={topic} onClick={() => { setQuery(topic); }}>{topic}<ChevronRight size={14} /></button>)}</div>
      </section>}

      {section === "circles" && <section className="page-view">
        <div className="page-header"><div><span className="overline">YOUR COMMUNITIES</span><h1>Circles</h1><p>The places you keep coming back to.</p></div><button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={17} /> Create a circle</button></div>
        <div className="circle-grid circles-page-grid">{circles.map((chat, index) => <CircleCard key={chat.id} chat={chat} joined={joined.includes(chat.id)} onJoin={() => toggleJoin(chat.id)} onOpen={() => openChat(chat.id)} index={index} />)}</div>
      </section>}

      {section === "saved" && <section className="page-view narrow-page">
        <div className="page-header"><div><span className="overline">YOUR LIBRARY</span><h1>Saved</h1><p>Messages and moments worth keeping.</p></div></div>
        <div className="saved-list"><SavedItem name="Maya Bennett" avatar={people[0].avatar} circle="The Film Room" text="I made a little watchlist of films with that same kind of ending. Sharing it here after lunch." time="Today, 11:02 AM" onOpen={() => openChat("film")} /><SavedItem name="Jordan Lee" avatar={people[1].avatar} circle="Creator Lounge" text="A reminder that small wins count. Share one thing you shipped, learned or improved this week." time="Yesterday, 9:03 AM" onOpen={() => openChat("creator")} /><SavedItem name="Nina Okafor" avatar={people[3].avatar} circle="Sound & Discovery" text="This week's finds are up. A little alt-R&B, some highlife and a track I can't stop replaying." time="Monday, 4:40 PM" onOpen={() => openChat("sound")} /></div>
      </section>}

      {section === "profile" && <section className="page-view profile-page">
        <div className="page-header"><div><span className="overline">YOUR PROFILE</span><h1>Your corner of XoraTV.</h1><p>Make it easy for people to find and connect with you.</p></div><button className="secondary-button" onClick={() => showNotice("Profile editing preview")}><Settings size={16} /> Edit profile</button></div>
        <div className="profile-card"><div className="profile-banner" /><div className="profile-main"><Avatar src="https://i.pravatar.cc/120?img=32" name="You" size="xl" /><div className="profile-identity"><h2>Alex Morgan</h2><span>@alexmorgan · Member since 2026</span><p>Films, football and finding people who make the internet feel smaller.</p></div><button className="secondary-button" onClick={() => showNotice("Profile link copied")}><Link2 size={16} /> Share profile</button></div><div className="profile-stats"><span><b>248</b> followers</span><span><b>186</b> following</span><span><b>{joined.length}</b> circles</span></div></div>
        <div className="section-title-row"><div><h2>Your circles</h2><p>Communities you're part of</p></div><button className="text-link" onClick={() => changeSection("circles")}>View all <ArrowUpRight size={16} /></button></div>
        <div className="mini-circle-row">{circles.filter((chat) => joined.includes(chat.id)).map((chat) => <button key={chat.id} className="mini-circle" onClick={() => openChat(chat.id)}><Avatar src={chat.avatar} name={chat.name} size="md" /><span><b>{chat.name}</b><small>{number(chat.members)} members</small></span><ChevronRight size={16} /></button>)}</div>
      </section>}

      <nav className="mobile-bottom-nav" aria-label="Main navigation">
        {navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => changeSection(item.id)}><Icon size={19} /><span>{item.label}</span></button>; })}
      </nav>
    </div>

    {profileOpen && <div className="modal-backdrop" onClick={() => setProfileOpen(null)}><div className="profile-popover" onClick={(event) => event.stopPropagation()}>
      <button className="sheet-close" onClick={() => setProfileOpen(null)}><X size={18} /></button>
      <div className="profile-popover-banner" />
      <Avatar src={profileOpen.avatar} name={profileOpen.name} size="xl" />
      <div className="profile-popover-copy"><h2>{profileOpen.name}</h2><span>{profileOpen.handle} · {profileOpen.role}</span><p>{profileOpen.bio}</p></div>
      <div className="profile-popover-stats"><span><b>1.8k</b> followers</span><span><b>12</b> circles</span></div>
      <button className={"primary-button full-width" + (following ? " following" : "")} onClick={() => setFollowing(!following)}>{following ? <><Check size={16} /> Following</> : <><Plus size={16} /> Follow</>}</button>
    </div></div>}

    {createOpen && <div className="modal-backdrop" onClick={() => setCreateOpen(false)}><form className="create-modal" onSubmit={createCircle} onClick={(event) => event.stopPropagation()}>
      <div className="modal-heading"><div><span className="overline">START SOMETHING</span><h2>Create a circle</h2><p>Give people a place to meet around something they love.</p></div><button type="button" className="icon-button" onClick={() => setCreateOpen(false)}><X size={19} /></button></div>
      <label className="form-label">Circle name<input value={circleName} onChange={(event) => setCircleName(event.target.value)} placeholder="e.g. Indie Film Nights" maxLength={40} required /></label>
      <label className="form-label">What is it about?<textarea value={circleDescription} onChange={(event) => setCircleDescription(event.target.value)} placeholder="Tell people what makes this circle worth joining..." rows={3} maxLength={180} required /></label>
      <label className="form-label">Topic<select value={circleCategory} onChange={(event) => setCircleCategory(event.target.value)}>{["Film & TV", "Football", "Creators", "Music", "Technology", "Culture"].map((item) => <option key={item}>{item}</option>)}</select></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={!circleName.trim() || !circleDescription.trim()}><Plus size={16} /> Create circle</button></div>
    </form></div>}

    {notice && <div className="toast"><Check size={16} />{notice}</div>}
  </div>;
}

function CircleCard({ chat, joined, onJoin, onOpen, index }: { chat: Chat; joined: boolean; onJoin: () => void; onOpen: () => void; index: number }) {
  return <article className={"circle-card card-" + (index % 4)}>
    <button className="circle-card-image" onClick={onOpen}><img src={chat.avatar} alt="" loading="lazy" /><span className="image-shade" /><span className="category-label">{chat.category}</span><span className="members-pill"><span /> {number(chat.online)} online</span></button>
    <div className="circle-card-body"><button className="circle-card-title" onClick={onOpen}>{chat.name}</button><p>{chat.description}</p><div className="circle-card-footer"><span><Users size={14} /> {number(chat.members)} members</span><button className={"join-mini" + (joined ? " is-joined" : "")} onClick={onJoin}>{joined ? <><Check size={14} /> Joined</> : "Join circle"}</button></div></div>
  </article>;
}

function SavedItem({ name, avatar, circle, text, time, onOpen }: { name: string; avatar: string; circle: string; text: string; time: string; onOpen: () => void }) {
  return <button className="saved-item" onClick={onOpen}><Avatar src={avatar} name={name} size="md" /><span className="saved-copy"><span><b>{name}</b><small>in {circle}</small></span><p>{text}</p><time>{time}</time></span><Bookmark size={17} className="saved-icon" /></button>;
}
