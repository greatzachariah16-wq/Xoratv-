import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, GraduationCap, Home, Plus, Search, Shield, Clapperboard, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { notificationsQuery } from "@/lib/api";
import { Logo } from "./Logo";
import { UserAvatar } from "./UserAvatar";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/shorts", label: "Shorts", icon: Clapperboard },
  { to: "/learn", label: "Learn", icon: GraduationCap },
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
  const { profile, isAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unread = useUnreadCount();

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
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
          {profile ? (
            <Link
              to="/profile/$username"
              params={{ username: profile.username }}
              className="press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <User className="size-4.5" aria-hidden="true" />
              Profile
            </Link>
          ) : (
            <Link
              to="/auth"
              className="press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <User className="size-4.5" aria-hidden="true" />
              Sign in
            </Link>
          )}
          {isAdmin ? (
            <Link
              to="/admin"
              className="press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Shield className="size-4.5" aria-hidden="true" />
              Admin
            </Link>
          ) : null}
        </nav>

        <Link
          to="/create"
          className="press mt-6 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card"
        >
          <Plus className="size-4" aria-hidden="true" />
          Create
        </Link>

        <div className="mt-auto rounded-xl border border-border bg-surface p-3">
          <p className="font-display text-sm font-semibold">Xora Studio</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Short video, long ideas. Made for creators who teach.
          </p>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-md lg:hidden">
        <Link to="/" className="press">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
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
          {profile ? (
            <Link
              to="/profile/$username"
              params={{ username: profile.username }}
              aria-label="Your profile"
              className="press ml-1"
            >
              <UserAvatar path={profile.avatar_url} name={profile.display_name} size={32} />
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

      {/* Mobile bottom nav */}
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
          {[NAV[2], NAV[3]].map(({ to, label, icon: Icon }) => {
            const active = pathname.startsWith(to);
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={cn(
                    "press relative flex flex-col items-center gap-1 py-1.5 text-[10px] font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {label}
                  {to === "/notifications" && unread > 0 ? (
                    <span className="absolute right-4 top-0.5 size-2 rounded-full bg-primary" />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function FeedTabs({ active }: { active: "home" | "shorts" | "learn" }) {
  const tabs = [
    { key: "home", label: "Home", to: "/" },
    { key: "shorts", label: "Shorts", to: "/shorts" },
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
