import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bell,
  BarChart3,
  GraduationCap,
  Home,
  Plus,
  Search,
  Settings,
  Shield,
  Clapperboard,
  Tv,
  User,
  Wallet,
  Gift,
  Radio,
  Baby,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePresenceTracker } from "@/hooks/usePresenceTracker";
import { notificationsQuery } from "@/lib/api";
import { walletQuery } from "@/lib/commerce";
import { Logo } from "./Logo";
import { UserAvatar } from "./UserAvatar";
import { AdsterraBannerAd } from "@/components/ads/AdsterraBannerAd";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/shorts", label: "Shorts", icon: Clapperboard },
  { to: "/xtv-series", label: "X Series", icon: Tv },
  { to: "/kids", label: "Xora Kids", icon: Baby },
  { to: "/learn", label: "Learn", icon: GraduationCap },
  { to: "/creator-studio", label: "X Channel", icon: Radio },
  { to: "/offers", label: "Offers", icon: Gift },
] as const;

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

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-border bg-sidebar px-4 py-6 lg:flex">
        <Link to="/" className="press flex items-center px-2">
          <Logo />
        </Link>
        <nav aria-label="Primary" className="mt-8 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="size-4.5" aria-hidden="true" />
                {label}
                {to === "/notifications" && unread > 0 ? (
                  <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                    {unread}
                  </span>
                ) : null}
              </Link>
            );
          })}
          <Link
            to="/rewards"
            className={cn(
              "press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
              pathname.startsWith("/rewards")
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Gift className="size-4.5" aria-hidden="true" /> Rewards
          </Link>
          <Link
            to="/search"
            className={cn(
              "press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
              pathname.startsWith("/search")
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Search className="size-4.5" aria-hidden="true" />
            Search
          </Link>
          <Link
            to="/wallet"
            className={cn(
              "press flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
              pathname.startsWith("/wallet")
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-3"><Wallet className="size-4.5" aria-hidden="true" /> Xora Wallet</span>
            {user ? <span className="text-xs font-semibold">₦{Number(walletData?.wallet?.balance || 0).toLocaleString()}</span> : null}
          </Link>
          {currentProfile ? (
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
              <User className="size-4.5" aria-hidden="true" /> Profile
            </Link>
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
              <User className="size-4.5" aria-hidden="true" /> Sign in
            </Link>
          )}
          {isAdmin ? (
            <>
              <Link
                to="/admin"
                className="press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Shield className="size-4.5" aria-hidden="true" /> Admin
              </Link>
              <Link
                to="/admin/commerce"
                className="press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <BarChart3 className="size-4.5" aria-hidden="true" /> Commerce
              </Link>
            </>
          ) : null}
        </nav>

        <Link
          to="/create"
          className="press mt-6 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card"
        >
          <Plus className="size-4" aria-hidden="true" /> Create
        </Link>

        <div className="mt-auto space-y-2">
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
            <Settings className="size-4.5" aria-hidden="true" />
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
            <Search className="size-5" aria-hidden="true" />
          </Link>
          <Link to="/wallet" aria-label="Xora Wallet" className="press relative grid size-11 place-items-center rounded-full hover:bg-secondary">
            <Wallet className="size-5" aria-hidden="true" />
            {user && Number(walletData?.wallet?.balance || 0) > 0 ? <span className="absolute right-1 top-1 min-w-2 rounded-full bg-primary px-1 text-[8px] font-bold leading-3 text-primary-foreground">{Number(walletData?.wallet?.balance || 0) >= 1000 ? "₦+" : "₦"}</span> : null}
          </Link>
          <Link to="/notifications" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} className="press relative grid size-11 place-items-center rounded-full hover:bg-secondary">
            <Bell className="size-5" aria-hidden="true" />
            {unread > 0 ? <span className="absolute right-2 top-2 size-2 rounded-full bg-primary ring-2 ring-background" /> : null}
          </Link>
          <button
            type="button"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
            className={cn(
              "press grid size-11 place-items-center rounded-2xl border shadow-sm transition-all",
              mobileMenuOpen
                ? "border-primary/30 bg-primary text-primary-foreground shadow-card"
                : "border-primary/15 bg-primary/5 text-primary hover:bg-primary/10",
            )}
          >
            {mobileMenuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </header>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-x-3 top-[4.25rem] overflow-hidden rounded-[1.5rem] border border-primary/15 bg-background/98 p-2 shadow-lift backdrop-blur-xl" onClick={(event) => event.stopPropagation()}>
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
                      "press flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium",
                      active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary",
                    )}
                  >
                    <span className={cn("grid size-9 place-items-center rounded-xl", active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                      <Icon className="size-4.5" aria-hidden="true" />
                    </span>
                    {label}
                  </Link>
                );
              })}
              <Link to="/rewards" onClick={() => setMobileMenuOpen(false)} className="press flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-secondary">
                <span className="grid size-9 place-items-center rounded-xl bg-secondary text-muted-foreground"><Gift className="size-4.5" aria-hidden="true" /></span>
                Rewards
              </Link>
              <Link to="/search" onClick={() => setMobileMenuOpen(false)} className="press flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-secondary">
                <span className="grid size-9 place-items-center rounded-xl bg-secondary text-muted-foreground"><Search className="size-4.5" aria-hidden="true" /></span>
                Search
              </Link>
              <Link to="/wallet" onClick={() => setMobileMenuOpen(false)} className="press flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-secondary">
                <span className="grid size-9 place-items-center rounded-xl bg-secondary text-muted-foreground"><Wallet className="size-4.5" aria-hidden="true" /></span>
                Xora Wallet
              </Link>
              {currentProfile ? (
                <Link to="/profile/$username" params={{ username: currentProfile.username }} onClick={() => setMobileMenuOpen(false)} className="press flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-secondary">
                  <span className="grid size-9 place-items-center overflow-hidden rounded-xl bg-secondary"><UserAvatar path={currentProfile.avatar_url} name={currentProfile.display_name} size={30} /></span>
                  Profile
                </Link>
              ) : (
                <Link to="/auth" onClick={() => setMobileMenuOpen(false)} className="press flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-secondary">
                  <span className="grid size-9 place-items-center rounded-xl bg-secondary text-muted-foreground"><User className="size-4.5" aria-hidden="true" /></span>
                  Sign in
                </Link>
              )}
              <Link to="/settings" onClick={() => setMobileMenuOpen(false)} className="press flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-secondary">
                <span className="grid size-9 place-items-center rounded-xl bg-secondary text-muted-foreground"><Settings className="size-4.5" aria-hidden="true" /></span>
                Settings
              </Link>
            </nav>
          </div>
        </div>
      ) : null}

      <main id="main" className="lg:pl-[248px] xl:pr-[320px]">
        <div
          className={cn(
            "mx-auto px-4 pb-20 pt-18 lg:px-8 lg:pb-14 lg:pt-8",
            wide ? "max-w-5xl" : "max-w-[620px]",
          )}
        >
          {children}
        </div>
      </main>

      {/* Fixed Global Bottom Adsterra Banner — pinned above the mobile navigation and at the bottom on desktop */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-y border-border/80 bg-background/95 px-3 py-1.5 shadow-xl backdrop-blur-md transition-all lg:bottom-0 lg:left-[248px] lg:border-b-0 xl:right-[320px]">
        <div
          className={cn(
            "mx-auto flex min-h-[50px] items-center justify-center",
            wide ? "max-w-5xl" : "max-w-[620px]",
          )}
        >
          <AdsterraBannerAd
            adKey="075ef17698a6be8914c3d3aaaf74c814"
            width={320}
            height={50}
            className="my-0 shadow-xs"
          />
        </div>
      </div>

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
