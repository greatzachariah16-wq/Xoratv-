import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Baby,
  BarChart3,
  BellRing,
  ClipboardCheck,
  Clapperboard,
  Film,
  Gem,
  GraduationCap,
  Headset,
  House,
  Menu,
  MessagesSquare,
  MonitorPlay,
  Plus,
  RadioTower,
  Search,
  Settings,
  Shield,
  Signal,
  TvMinimalPlay,
  UserRound,
  UserRoundPen,
  WalletCards,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePresenceTracker } from "@/hooks/usePresenceTracker";
import { notificationsQuery } from "@/lib/api";
import { walletQuery } from "@/lib/commerce";
import { Logo } from "./Logo";
import { UserAvatar } from "./UserAvatar";
import { XSportsIcon } from "./XSportsIcon";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: House },
  { to: "/shorts", label: "Shorts", icon: Clapperboard },
  { to: "/xtv-series", label: "X Series", icon: MonitorPlay },
  { to: "/tv", label: "Live TV", icon: TvMinimalPlay },
  { to: "/xsports", label: "XSports", icon: XSportsIcon },
  { to: "/kids", label: "Xora Kids", icon: Baby },
  { to: "/learn", label: "Learn", icon: GraduationCap },
  { to: "/creator-studio", label: "X Channel", icon: RadioTower },
  { to: "/chat", label: "Community Chat", icon: MessagesSquare },
  { to: "/catalog", label: "Movie Catalog", icon: Film },
  { to: "/special-prizes", label: "Special Prizes", icon: Gem },
  { to: "/data-rewards", label: "Data Rewards", icon: Signal },
  { to: "/surveys", label: "Surveys", icon: ClipboardCheck },
  { to: "/search", label: "Search", icon: Search },
  { to: "/wallet", label: "Xora Wallet", icon: WalletCards },
  { to: "/notifications", label: "Notifications", icon: BellRing },
  { to: "/support", label: "Support", icon: Headset },
] as const;

type NavIconComponent = (typeof NAV)[number]["icon"];

function NavIconTile({
  icon: Icon,
  active = false,
  compact = false,
}: {
  icon: NavIconComponent;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-[15px] border transition-all duration-200 before:pointer-events-none before:absolute before:inset-[3px] before:rounded-[11px] before:border before:border-white/55 after:pointer-events-none after:absolute after:inset-x-2 after:bottom-[3px] after:h-px after:bg-white/70",
        compact ? "size-10 rounded-[14px]" : "size-11",
        active
          ? "border-[#9b472d] bg-gradient-to-br from-[#d77c58] via-[#b15232] to-[#873b27] text-[#fffaf5] shadow-[inset_0_1px_1px_rgba(255,255,255,0.38),0_4px_10px_rgba(130,57,35,0.24)]"
          : "border-[#e5d1c0] bg-gradient-to-br from-[#fffdf8] via-[#f7ecdf] to-[#e8d3c1] text-[#874b35] shadow-[inset_0_1px_1px_rgba(255,255,255,0.95),0_3px_8px_rgba(82,54,39,0.11)] group-hover:-translate-y-0.5 group-hover:border-[#c98b6d] group-hover:text-[#a4482b] group-hover:shadow-[0_5px_12px_rgba(130,57,35,0.16)]",
      )}
    >
      <span className="pointer-events-none absolute inset-x-2 top-0 h-px bg-white/90" />
      <Icon className="relative z-10 size-[23px] stroke-[2.25] drop-shadow-[0_2px_1px_rgba(66,35,23,0.28)]" aria-hidden="true" />
    </span>
  );
}

function useUnreadCount() {
  const { user } = useAuth();
  const { data } = useQuery(notificationsQuery(user?.id));
  return (data ?? []).filter((n) => !n.read).length;
}

export function AppShell({
  children,
  rail,
  wide = false,
}: {
  children: ReactNode;
  rail?: ReactNode;
  wide?: boolean;
}) {
  usePresenceTracker();
  const { user, profile, isAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unread = useUnreadCount();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: walletData } = useQuery(walletQuery(user?.id));

  const currentProfile =
    profile ||
    (user
      ? {
          id: user.id,
          username: user.displayName
            ? user.displayName.toLowerCase().replace(/\s+/g, "_")
            : user.email
              ? user.email.split("@")[0]
              : "user_" + user.id.slice(0, 6),
          display_name: user.displayName || user.email?.split("@")[0] || "User",
          avatar_url:
            user.photoURL ||
            "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        }
      : null);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col overflow-y-auto border-r border-border bg-sidebar px-4 py-6 lg:flex">
        <Link to="/" className="press flex items-center px-2">
          <Logo />
        </Link>
        <nav aria-label="Primary" className="mt-8 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-3">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "press group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold tracking-[0.01em] transition-all",
                  active
                    ? "bg-gradient-to-r from-primary/15 via-primary/8 to-transparent text-foreground ring-1 ring-primary/20 shadow-sm"
                    : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
                )}
              >
                <NavIconTile icon={Icon} active={active} compact />
                <span className="min-w-0 flex-1">{label}</span>
                {to === "/wallet" && user ? (
                  <span className="ml-auto text-[11px] font-semibold tabular-nums text-muted-foreground">₦{Number(walletData?.wallet?.balance || 0).toLocaleString()}</span>
                ) : null}
                {to === "/notifications" && unread > 0 ? (
                  <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{unread}</span>
                ) : null}
              </Link>
            );
          })}
          {currentProfile ? (
            <>
              <Link
                to="/profile/$username"
                params={{ username: currentProfile.username }}
                className={cn(
                  "press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                  pathname.startsWith("/profile")
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <NavIconTile icon={UserRound} compact active={pathname.startsWith("/profile")} /> Profile
              </Link>
              <Link
                to="/edit-profile"
                className="press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <NavIconTile icon={UserRoundPen} compact active={pathname.startsWith("/edit-profile")} />
                Edit profile
              </Link>
            </>
          ) : (
            <Link
              to="/auth"
              className={cn(
                "press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                pathname.startsWith("/auth")
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <NavIconTile icon={UserRound} compact active={pathname.startsWith("/auth")} /> Sign in
            </Link>
          )}
          {isAdmin ? (
            <>
              <Link
                to="/admin"
                className="press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <NavIconTile icon={Shield} compact /> Admin
              </Link>
              <Link
                to="/admin/commerce"
                className="press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <NavIconTile icon={BarChart3} compact /> Commerce
              </Link>
            </>
          ) : null}
        </nav>

        <Link
          to="/create"
          className="press mt-6 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card"
        >
          <Plus className="size-4 stroke-[2.2]" aria-hidden="true" /> Create
        </Link>

        <div className="mt-4 shrink-0 space-y-2">
          <Link
            to="/settings"
            className={cn(
              "press flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm font-medium",
              pathname.startsWith("/settings")
                ? "bg-accent text-accent-foreground"
                : "bg-surface text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
            aria-label="Settings"
          >
            <NavIconTile icon={Settings} compact active={pathname.startsWith("/settings")} />
            Settings
          </Link>
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="font-display text-sm font-semibold">Xora Studio</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Short video, long ideas. Made for creators who teach.
            </p>
            <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
              <Link to="/privacy" hash="privacy" className="hover:underline hover:text-foreground">
                Privacy
              </Link>
              <Link to="/privacy" hash="terms" className="hover:underline hover:text-foreground">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </aside>

      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-background/95 px-3 backdrop-blur-md sm:px-4 lg:hidden">
        <Link to="/" className="press">
          <Logo />
        </Link>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <Link to="/search" aria-label="Search" className="press grid size-11 place-items-center rounded-full hover:bg-secondary">
            <Search className="size-[21px] stroke-[1.8]" aria-hidden="true" />
          </Link>
          <Link to="/wallet" aria-label="Xora Wallet" className="press relative grid size-11 place-items-center rounded-full hover:bg-secondary">
            <WalletCards className="size-[21px] stroke-[1.8]" aria-hidden="true" />
            {user && Number(walletData?.wallet?.balance || 0) > 0 ? <span className="absolute right-1 top-1 min-w-2 rounded-full bg-primary px-1 text-[8px] font-bold leading-3 text-primary-foreground">{Number(walletData?.wallet?.balance || 0) >= 1000 ? "₦+" : "₦"}</span> : null}
          </Link>
          <Link to="/notifications" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} className="press relative grid size-11 place-items-center rounded-full hover:bg-secondary">
            <BellRing className="size-[21px] stroke-[1.8]" aria-hidden="true" />
            {unread > 0 ? <span className="absolute right-2 top-2 size-2 rounded-full bg-primary ring-2 ring-background" /> : null}
          </Link>

        </div>
      </header>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-x-3 top-[4.25rem] bottom-[calc(5rem+env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain rounded-[1.5rem] border border-primary/15 bg-background/98 p-2 shadow-lift backdrop-blur-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-2 rounded-[1.1rem] bg-gradient-to-r from-primary/10 via-primary/5 to-secondary p-3">
              <p className="font-display text-sm font-semibold">Explore XoraTV</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Everything you need, one tap away.</p>
            </div>
            <nav aria-label="Mobile navigation" className="grid grid-cols-2 gap-1">
              {NAV.map(({ to, label, icon: Icon }) => {
                const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "press flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-semibold shadow-sm transition-all",
                      active ? "border-primary/25 bg-gradient-to-br from-primary/15 via-primary/8 to-card text-foreground shadow-md" : "border-border/70 bg-card/75 text-foreground hover:border-primary/20 hover:bg-secondary/70",
                    )}
                  >
                    <NavIconTile icon={Icon} active={active} />
                    <span className="min-w-0 flex-1 leading-tight">{label}</span>
                  </Link>
                );
              })}
              <Link
                to="/create"
                onClick={() => setMobileMenuOpen(false)}
                className="press col-span-2 flex items-center gap-3 rounded-2xl border border-[#d9a98e] bg-gradient-to-r from-[#fff7ef] via-[#f5e7d9] to-[#ead3c1] px-3 py-3 text-sm font-semibold text-[#8f432b] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_3px_10px_rgba(130,57,35,0.12)]"
              >
                <NavIconTile icon={Plus} compact />
                <span className="flex-1">Create a post</span>
                <span className="text-xs font-bold tracking-wide">CREATE</span>
              </Link>
              {currentProfile ? (
                <Link to="/profile/$username" params={{ username: currentProfile.username }} onClick={() => setMobileMenuOpen(false)} className="press flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-secondary">
                  <span className="grid size-9 place-items-center overflow-hidden rounded-xl bg-secondary"><UserAvatar path={currentProfile.avatar_url} name={currentProfile.display_name} size={30} /></span>
                  Profile
                </Link>
              ) : (
                <Link to="/auth" onClick={() => setMobileMenuOpen(false)} className="press flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-secondary">
                  <NavIconTile icon={UserRound} compact />
                  Sign in
                </Link>
              )}
              {currentProfile ? (
                <Link to="/edit-profile" onClick={() => setMobileMenuOpen(false)} className="press flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-secondary">
                  <NavIconTile icon={UserRoundPen} compact />
                  Edit profile
                </Link>
              ) : null}
              {isAdmin ? (
                <>
                  <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="press flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-secondary">
                    <NavIconTile icon={Shield} compact />
                    Admin
                  </Link>
                  <Link to="/admin/commerce" onClick={() => setMobileMenuOpen(false)} className="press flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-secondary">
                    <NavIconTile icon={BarChart3} compact />
                    Commerce
                  </Link>
                </>
              ) : null}
              <Link to="/settings" onClick={() => setMobileMenuOpen(false)} className="press flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-secondary">
                <NavIconTile icon={Settings} compact active={pathname.startsWith("/settings")} />
                Settings
              </Link>
            </nav>
          </div>
        </div>
      ) : null}

      <main id="main" className="lg:pl-[248px] xl:pr-[320px]">
        <div
          className={cn(
            "mx-auto px-4 pb-24 pt-18 lg:px-8 lg:pb-14 lg:pt-8",
            wide ? "max-w-5xl" : "max-w-[620px]",
          )}
        >
          {children}
        </div>
      </main>

      <nav aria-label="Primary mobile navigation" className="fixed inset-x-0 bottom-0 z-50 grid h-[calc(64px+env(safe-area-inset-bottom))] grid-cols-5 border-t border-border/90 bg-background/95 px-1 pt-1 shadow-[0_-8px_24px_rgba(50,34,24,0.08)] backdrop-blur-xl lg:hidden">
        {[
          { to: "/", label: "Home", icon: House },
          { to: "/shorts", label: "Shorts", icon: Clapperboard },
          { to: "/xtv-series", label: "Series", icon: MonitorPlay },
          { to: "/tv", label: "Live TV", icon: TvMinimalPlay },
        ].map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileMenuOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "press flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 pb-[env(safe-area-inset-bottom)] text-[10px] font-semibold leading-none transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("grid size-8 place-items-center rounded-xl transition-colors", active ? "bg-primary/12" : "bg-transparent")}>
                <Icon className={cn("size-[20px] stroke-[2]", active && "stroke-[2.35]")} aria-hidden="true" />
              </span>
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-label="More navigation"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
          className={cn(
            "press flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 pb-[env(safe-area-inset-bottom)] text-[10px] font-semibold leading-none transition-colors",
            mobileMenuOpen ? "text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className={cn("grid size-8 place-items-center rounded-xl transition-colors", mobileMenuOpen && "bg-primary/12")}>
            {mobileMenuOpen ? <X className="size-[20px]" aria-hidden="true" /> : <Menu className="size-[20px]" aria-hidden="true" />}
          </span>
          <span>More</span>
        </button>
      </nav>

      {rail ? (
        <aside className="fixed inset-y-0 right-0 z-30 hidden w-[320px] overflow-y-auto border-l border-border bg-sidebar px-5 py-8 xl:block">
          {rail}
        </aside>
      ) : null}


    </div>
  );
}

export function FeedTabs({ active }: { active: "home" | "shorts" | "xtv-series" | "learn" }) {
  const tabs = [
    { key: "home", label: "Home", to: "/" },
    { key: "shorts", label: "Shorts", to: "/shorts" },
    { key: "xtv-series", label: "Series", to: "/xtv-series" },
    { key: "learn", label: "Learn", to: "/learn" },
  ] as const;
  return (
    <div className="mb-5 flex gap-1 rounded-full border border-border bg-surface p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          className={cn(
            "press flex-1 rounded-full px-4 py-1.5 text-center text-sm font-medium",
            active === tab.key
              ? "bg-primary text-primary-foreground shadow-card"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
