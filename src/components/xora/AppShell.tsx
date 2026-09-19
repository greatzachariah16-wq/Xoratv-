import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  CircleHelp,
  GraduationCap,
  Home,
  Plus,
  Search,
  Settings,
  Shield,
  Clapperboard,
  Tv,
  User,
  MessageCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePresenceTracker } from "@/hooks/usePresenceTracker";
import { notificationsQuery } from "@/lib/api";
import { Logo } from "./Logo";
import { UserAvatar } from "./UserAvatar";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/shorts", label: "Shorts", icon: Clapperboard },
  { to: "/xtv-series", label: "X Series", icon: Tv },
  { to: "/learn", label: "Learn", icon: GraduationCap },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/notifications", label: "Alerts", icon: Bell },
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
    <div className="min-h-screen bg-background max-w-full overflow-x-hidden">
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
            <Link
              to="/admin"
              className="press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Shield className="size-4.5" aria-hidden="true" /> Admin
            </Link>
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

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-md lg:hidden">
        <Link to="/" className="press">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <Link
            to="/settings"
            aria-label="Settings"
            className="press grid size-9 place-items-center rounded-full hover:bg-secondary"
          >
            <Settings className="size-5" aria-hidden="true" />
          </Link>
          <Link
            to="/support"
            aria-label="Help & Support"
            className="press grid size-9 place-items-center rounded-full hover:bg-secondary"
          >
            <CircleHelp className="size-5" aria-hidden="true" />
          </Link>
          <Link
            to="/search"
            aria-label="Search"
            className="press grid size-9 place-items-center rounded-full hover:bg-secondary"
          >
            <Search className="size-5" aria-hidden="true" />
          </Link>
          <Link
            to="/notifications"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
            className="press relative grid size-9 place-items-center rounded-full hover:bg-secondary"
          >
            <Bell className="size-5" aria-hidden="true" />
            {unread > 0 ? (
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
            ) : null}
          </Link>
          {currentProfile ? (
            <Link
              to="/profile/$username"
              params={{ username: currentProfile.username }}
              aria-label="Your profile"
              className="press ml-1"
            >
              <UserAvatar
                path={currentProfile.avatar_url}
                name={currentProfile.display_name}
                size={32}
              />
            </Link>
          ) : (
            <Link to="/auth" aria-label="Sign in" className="press ml-1">
              <UserAvatar size={32} />
            </Link>
          )}
        </div>
      </header>

      <main id="main" className="lg:pl-[248px] xl:pr-[320px]">
        <div
          className={cn(
            "mx-auto px-4 pb-28 pt-4 lg:px-8 lg:pb-14 lg:pt-8",
            wide ? "max-w-5xl" : "max-w-[620px]",
          )}
        >
          {children}
        </div>
      </main>

      {rail ? (
        <aside className="fixed inset-y-0 right-0 z-30 hidden w-[320px] overflow-y-auto border-l border-border bg-sidebar px-5 py-8 xl:block">
          {rail}
        </aside>
      ) : null}

      <nav
        aria-label="Primary"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 pt-2 backdrop-blur-md lg:hidden"
        style={{ ["--safe-extra" as string]: "0.5rem" }}
      >
        <ul className="grid grid-cols-5">
          {[NAV[0], NAV[1]].map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={cn(
                    "press flex flex-col items-center gap-1 py-1.5 text-[10px] font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
          <li className="flex justify-center">
            <Link
              to="/create"
              aria-label="Create a post"
              className="press -mt-6 grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift ring-4 ring-background"
            >
              <Plus className="size-6" aria-hidden="true" />
            </Link>
          </li>
          {[NAV[2], NAV[3]].map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className={cn(
                  "press relative flex flex-col items-center gap-1 py-1.5 text-[10px] font-medium",
                  pathname.startsWith(to) ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
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
