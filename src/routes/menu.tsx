import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft, Baby, BarChart3, BookOpen, CheckSquare, ChevronRight, Clapperboard,
  Film, Headset, House, MessagesSquare, MonitorPlay, PanelsTopLeft, RadioTower,
  Search, Settings, Shield, Signal, Trophy, UserRound, WalletCards,
} from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { walletQuery } from "@/lib/commerce";
import { UserAvatar } from "@/components/xora/UserAvatar";

export const Route = createFileRoute("/menu")({ component: MenuPage });

const primary = [
  { to: "/", label: "Home", detail: "Your personalised feed", icon: House },
  { to: "/shorts", label: "Shorts", detail: "Quick videos from creators", icon: Clapperboard },
  { to: "/xtv-series", label: "X-Series", detail: "Discover films and series", icon: MonitorPlay },
  { to: "/tv", label: "Live TV", detail: "Watch live channels", icon: RadioTower },
  { to: "/xsports", label: "XSports", detail: "Sports and live action", icon: Trophy },
  { to: "/kids", label: "Xora Kids", detail: "A safer space for kids", icon: Baby },
  { to: "/catalog", label: "Movie Catalog", detail: "Explore the library", icon: Film },
];
const groups = [
  { label: "Learn & connect", items: [
    { to: "/learn", label: "Learn", detail: "Courses and creator lessons", icon: BookOpen },
    { to: "/chat", label: "Messages", detail: "Your conversations", icon: MessagesSquare },
  ]},
  { label: "Earn", items: [
    { to: "/data-rewards", label: "Data Rewards", detail: "Earn eligible data rewards", icon: Signal },
    { to: "/surveys", label: "Surveys", detail: "Complete available surveys", icon: CheckSquare },
    { to: "/wallet", label: "Wallet", detail: "Balance and transactions", icon: WalletCards },
  ]},
  { label: "Creators", items: [
    { to: "/creator-studio", label: "Creator Studio", detail: "Manage your channel and posts", icon: PanelsTopLeft },
  ]},
  { label: "Account", items: [
    { to: "/profile", label: "Profile", detail: "Your Xora identity", icon: UserRound },
    { to: "/settings", label: "Settings", detail: "Preferences and privacy", icon: Settings },
    { to: "/support", label: "Support", detail: "Get help with XoraTV", icon: Headset },
  ]},
];

function MenuPage() {
  const { user, profile, isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const { data } = useQuery(walletQuery(user?.id));
  const balance = Number(data?.wallet?.balance || 0);
  const username = profile?.username || (user?.displayName ? user.displayName.toLowerCase().replace(/\s+/g, "_") : user?.email?.split("@")[0] || "");
  const query = search.trim().toLowerCase();
  const filteredPrimary = useMemo(() => primary.filter(item => !query || (item.label + " " + item.detail).toLowerCase().includes(query)), [query]);
  const filteredGroups = useMemo(() => groups.map(group => ({ ...group, items: group.items.filter(item => !query || (item.label + " " + item.detail).toLowerCase().includes(query)) })).filter(group => group.items.length), [query]);

  return <AppShell wide hideTopBanner>
    <div className="mx-auto max-w-3xl pb-8">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/" aria-label="Back to Home" className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-foreground shadow-sm"><ArrowLeft className="size-5"/></Link>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">XoraTV</p><h1 className="font-display text-2xl font-semibold tracking-tight">Explore menu</h1></div>
      </header>

      {user ? <Link to={username ? "/profile/$username" : "/settings"} params={username ? { username } : undefined} className="mb-5 flex items-center gap-3 rounded-[22px] border border-border bg-surface p-4 shadow-sm transition hover:border-primary/30">
        <UserAvatar path={profile?.avatar_url || user.photoURL || ""} name={profile?.display_name || user.displayName || user.email || "Your profile"} size={48}/>
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{profile?.display_name || user.displayName || "Your profile"}</strong><span className="mt-0.5 block text-xs text-muted-foreground">View your profile and channel</span></span>
        <ChevronRight className="size-5 text-muted-foreground"/>
      </Link> : <Link to="/auth" className="mb-5 flex items-center gap-3 rounded-[22px] border border-border bg-surface p-4"><UserRound className="size-7 text-primary"/><span className="flex-1 text-sm font-semibold">Sign in to XoraTV</span><ChevronRight className="size-5 text-muted-foreground"/></Link>}

      <label className="mb-6 flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-surface px-4 text-muted-foreground shadow-sm focus-within:border-primary/50">
        <Search className="size-5"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a destination" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"/>
      </label>

      <section className="mb-7">
        <div className="mb-3 flex items-end justify-between"><h2 className="font-display text-lg font-semibold">Discover</h2><span className="text-[11px] text-muted-foreground">Watch & explore</span></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filteredPrimary.map(item => { const Icon = item.icon; return <Link key={item.to} to={item.to as never} className="group min-h-[112px] rounded-[20px] border border-border bg-surface p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-card">
            <span className="mb-3 grid size-10 place-items-center rounded-2xl bg-clay-soft text-primary dark:bg-primary/15"><Icon className="size-5"/></span>
            <strong className="block text-sm">{item.label}</strong><span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{item.detail}</span>
          </Link>; })}
        </div>
      </section>

      {filteredGroups.map(group => <section key={group.label} className="mb-7">
        <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">{group.label}</h2>
        <div className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-sm">
          {group.items.map((item, index) => { const Icon = item.icon; const target = item.to === "/profile" ? (username ? "/profile/$username" : "/auth") : item.to; return <Link key={item.to} to={target as never} params={item.to === "/profile" && username ? { username } : undefined} className={"flex min-h-[68px] items-center gap-3 px-4 transition hover:bg-secondary/70 " + (index ? "border-t border-border/70" : "")}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-foreground"><Icon className="size-[19px]"/></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm">{item.label}</strong><span className="mt-0.5 block text-[11px] text-muted-foreground">{item.detail}</span></span>
            {item.to === "/wallet" && balance > 0 ? <span className="text-xs font-semibold tabular-nums">₦{balance.toLocaleString()}</span> : null}
            <ChevronRight className="size-4 text-muted-foreground"/>
          </Link>; })}
        </div>
      </section>)}

      {isAdmin ? <section className="mb-7"><h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Administration</h2><div className="overflow-hidden rounded-[20px] border border-border bg-surface">{[{to:"/admin",label:"Admin",icon:Shield},{to:"/admin/commerce",label:"Commerce",icon:BarChart3}].map(item => { const Icon=item.icon; return <Link key={item.to} to={item.to as never} className="flex min-h-14 items-center gap-3 border-b border-border/70 px-4 last:border-0"><Icon className="size-5 text-primary"/><span className="flex-1 text-sm font-medium">{item.label}</span><ChevronRight className="size-4 text-muted-foreground"/></Link>; })}</div></section> : null}

      <Link to="/wallet" className="flex items-center justify-between rounded-[20px] bg-clay-soft p-4 text-foreground dark:bg-primary/15"><span><span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Wallet balance</span><strong className="mt-1 block font-display text-2xl tabular-nums">₦{balance.toLocaleString()}</strong></span><span className="grid size-11 place-items-center rounded-2xl bg-background text-primary"><WalletCards className="size-6"/></span></Link>
    </div>
  </AppShell>;
}
