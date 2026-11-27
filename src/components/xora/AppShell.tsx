import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Baby,
  BarChart3,
  Bell,
  BookOpen,
  CheckSquare,
  ChevronDown,
  Clapperboard,
  Headset,
  House,
  Menu,
  MessagesSquare,
  MonitorPlay,
  PanelsTopLeft,
  Plus,
  RadioTower,
  Search,
  Settings,
  Shield,
  Signal,
  Trophy,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePresenceTracker } from "@/hooks/usePresenceTracker";
import { notificationsQuery } from "@/lib/api";
import { walletQuery } from "@/lib/commerce";
import { Logo } from "./Logo";
import { UserAvatar } from "./UserAvatar";
import { cn } from "@/lib/utils";
import { AdsterraBannerAd } from "@/components/ads/AdsterraBannerAd";

const GROUPS = [
  {
    label: "Watch",
    collapsible: false,
    items: [
      { to: "/xsports", label: "XSports", icon: Trophy },
      { to: "/kids", label: "Xora Kids", icon: Baby },
    ],
  },
  {
    label: "Learn and connect",
    collapsible: false,
    items: [
      { to: "/learn", label: "Learn", icon: BookOpen },
      { to: "/bookstore", label: "Bookstore", icon: BookOpen },
      { to: "/chat", label: "Messages", icon: MessagesSquare },
    ],
  },
  {
    label: "Earn",
    collapsible: true,
    items: [
      { to: "/data-rewards", label: "Data Rewards", icon: Signal },
      { to: "/surveys", label: "Surveys", icon: CheckSquare },
      { to: "/wallet", label: "Wallet", icon: WalletCards },
    ],
  },
  {
    label: "Creators",
    collapsible: false,
    items: [{ to: "/creator-studio", label: "Creator Studio", icon: PanelsTopLeft }],
  },
  {
    label: "Account",
    collapsible: true,
    items: [
      { to: "/profile", label: "Profile", icon: UserRound },
      { to: "/settings", label: "Settings", icon: Settings },
      { to: "/support", label: "Support", icon: Headset },
    ],
  },
] as const;

type Destination = { to: string; label: string; icon: LucideIcon };
type NavDestinationLinkProps = Pick<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "className" | "onClick" | "aria-current"
> & {
  to: string;
  children: ReactNode;
};

function NavDestinationLink({ to, children, ...props }: NavDestinationLinkProps) {
  if (to === "/tv") {
    return (
      <Link
        to="/tv"
        search={{
          channel: undefined,
          q: undefined,
          filter: undefined,
          category: undefined,
          country: undefined,
        }}
        {...props}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link to={to as never} {...props}>
      {children}
    </Link>
  );
}

function NavIconTile({
  icon: Icon,
  active = false,
  compact = false,
}: {
  icon: LucideIcon;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-xl transition-colors",
        compact ? "size-9" : "size-10",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground group-hover:text-primary",
      )}
    >
      <Icon className="size-[19px] stroke-[1.9]" aria-hidden="true" />
    </span>
  );
}

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  if (to === "/profile")
    return pathname.startsWith("/profile") || pathname.startsWith("/edit-profile");
  return pathname === to || pathname.startsWith(`${to}/`);
}

function useUnreadCount() {
  const { user } = useAuth();
  const { data } = useQuery(notificationsQuery(user?.id));
  return (data ?? []).filter((notification) => !notification.read).length;
}

export function AppShell({
  children,
  rail,
  wide = false,
  extraWide = false,
  immersive = false,
  hideTopBanner = false,
  onSearchClick,
}: {
  children: ReactNode;
  rail?: ReactNode;
  wide?: boolean;
  extraWide?: boolean;
  immersive?: boolean;
  hideTopBanner?: boolean;
  onSearchClick?: () => void;
}) {
  usePresenceTracker();
  const { user, profile, isAdmin } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const unread = useUnreadCount();
  const { data: walletData } = useQuery(walletQuery(user?.id));
  const balance = Number(walletData?.wallet?.balance || 0);
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
          avatar_url: user.photoURL || "",
        }
      : null);
  const moreActive = useMemo(
    () => pathname === "/menu" || GROUPS.some((group) => group.items.some((item) => isActive(pathname, item.to))),
    [pathname],
  );
  const renderDestination = (item: Destination, compact = false, closeMenu?: () => void) => {
    const active = isActive(pathname, item.to);
    const destinationContent = (
      <>
        <NavIconTile icon={item.icon} active={active} compact />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.to === "/wallet" && balance > 0 ? (
          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
            ₦{balance.toLocaleString()}
          </span>
        ) : null}
      </>
    );
    const className = cn(
      "group flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm transition-colors",
      active
        ? "bg-clay-soft text-primary dark:bg-primary/15"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      compact && "min-w-0",
    );
    if (item.to === "/profile") {
      return currentProfile ? (
        <Link
          key={item.to}
          to="/profile/$username"
          params={{ username: currentProfile.username }}
          onClick={closeMenu}
          aria-current={active ? "page" : undefined}
          className={className}
        >
          {destinationContent}
        </Link>
      ) : (
        <Link key={item.to} to="/auth" onClick={closeMenu} className={className}>
          {destinationContent}
        </Link>
      );
    }
    return (
      <NavDestinationLink
        key={item.to}
        to={item.to}
        onClick={closeMenu}
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {destinationContent}
      </NavDestinationLink>
    );
  };

  return (
    <div
      className={cn(
        "min-h-screen w-full max-w-full",
        pathname === "/xtv-series"
          ? "xora-series-shell"
          : pathname === "/"
            ? "xora-home-shell bg-background"
            : "bg-background",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {!immersive ? (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col overflow-y-auto border-r border-border bg-sidebar px-4 py-5 lg:flex">
          <Link to="/" className="press flex min-h-10 items-center px-2">
            <Logo />
          </Link>
          <Link
            to="/create"
            className="press mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="size-4" aria-hidden="true" /> Create
          </Link>
          <Link
            to="/search"
            className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            <Search className="size-4" aria-hidden="true" /> Search XoraTV
          </Link>
          <NavDestinationLink
            to="/notifications"
            aria-current={isActive(pathname, "/notifications") ? "page" : undefined}
            className={cn(
              "mt-2 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm",
              isActive(pathname, "/notifications")
                ? "bg-clay-soft text-primary"
                : "text-muted-foreground hover:bg-secondary",
            )}
          >
            <Bell className="size-[18px]" aria-hidden="true" /> Notifications
            {unread > 0 ? (
              <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </NavDestinationLink>
          <nav
            aria-label="Primary navigation"
            className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-3"
          >
            <div className="space-y-1">
              {[
                { to: "/", label: "Home", icon: House },
                { to: "/shorts", label: "Shorts", icon: Clapperboard },
                { to: "/xtv-series", label: "X-Series", icon: MonitorPlay },
                { to: "/tv", label: "Live TV", icon: RadioTower },
              ].map((item) => renderDestination(item))}
            </div>
            {GROUPS.map((group) => {
              const content = (
                <div className="mt-1 space-y-1">
                  {group.items.map((item) => renderDestination(item))}
                </div>
              );
              return group.collapsible ? (
                <details key={group.label} className="group/section">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-secondary [&::-webkit-details-marker]:hidden">
                    {group.label}
                    <ChevronDown
                      className="size-4 transition-transform group-open/section:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  {content}
                </details>
              ) : (
                <section key={group.label}>
                  <h2 className="px-2 text-xs font-semibold text-muted-foreground">
                    {group.label}
                  </h2>
                  {content}
                </section>
              );
            })}
            {isAdmin ? (
              <section>
                <h2 className="px-2 text-xs font-semibold text-muted-foreground">Admin</h2>
                <div className="mt-1 space-y-1">
                  {renderDestination({ to: "/admin", label: "Admin", icon: Shield })}
                  {renderDestination({ to: "/admin/commerce", label: "Commerce", icon: BarChart3 })}
                </div>
              </section>
            ) : null}
          </nav>
          <div className="mt-auto rounded-xl border border-border bg-surface p-3">
            <p className="text-xs text-muted-foreground">Wallet balance</p>
            <p className="mt-1 font-display text-lg font-semibold tabular-nums">
              ₦{balance.toLocaleString()}
            </p>
          </div>
          {currentProfile ? (
            <Link
              to="/profile/$username"
              params={{ username: currentProfile.username }}
              className="mt-3 flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm hover:bg-secondary"
            >
              <UserAvatar
                path={currentProfile.avatar_url}
                name={currentProfile.display_name}
                size={30}
              />
              <span className="min-w-0 truncate">{currentProfile.display_name}</span>
            </Link>
          ) : (
            <Link
              to="/auth"
              className="mt-3 flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm hover:bg-secondary"
            >
              <UserRound className="size-5" /> Sign in
            </Link>
          )}
        </aside>
      ) : null}

      {!immersive ? (
        <header
          className={cn(
            "fixed inset-x-0 top-0 z-50 flex h-[var(--header-h)] items-center justify-between border-b border-border bg-background/95 px-3 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md sm:px-4 lg:hidden",
            pathname === "/xtv-series" && "xora-series-topbar",
          )}
        >
          <Link to="/" className="press">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            {pathname === "/xtv-series" && onSearchClick ? (
              <button
                type="button"
                onClick={onSearchClick}
                aria-label="Search Series"
                className="press grid size-11 place-items-center rounded-xl hover:bg-secondary"
              >
                <Search className="size-5" aria-hidden="true" />
              </button>
            ) : (
              <Link
                to="/search"
                aria-label="Search"
                className="press grid size-11 place-items-center rounded-xl hover:bg-secondary"
              >
                <Search className="size-5" aria-hidden="true" />
              </Link>
            )}
            <Link
              to="/create"
              aria-label="Create"
              className="press grid size-10 place-items-center rounded-full border border-primary/20 bg-clay-soft text-primary shadow-sm transition-transform active:scale-95 dark:bg-primary/15"
            >
              <Plus className="size-[21px] stroke-[2.1]" aria-hidden="true" />
            </Link>
            <Link
              to="/notifications"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
              className="press relative grid size-11 place-items-center rounded-xl hover:bg-secondary"
            >
              <Bell className="size-5" aria-hidden="true" />
              {unread > 0 ? (
                <span className="absolute right-0.5 top-0.5 grid min-w-[17px] place-items-center rounded-full bg-primary px-1 text-[9px] font-bold leading-[17px] text-primary-foreground ring-2 ring-background">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>
          </div>
        </header>
      ) : null}

      <main
        id="main"
        className={
          immersive
            ? "min-h-screen w-full overflow-x-clip"
            : cn("overflow-x-clip lg:pl-[248px]", rail && "xl:pr-[320px]")
        }
      >
        <div
          className={cn(
            immersive
              ? "w-full max-w-none px-0 pb-0 pt-0"
              : cn(
                  "mx-auto px-4 pb-[calc(100px+env(safe-area-inset-bottom))] lg:px-8 lg:pb-14 lg:pt-8",
                  pathname.startsWith("/profile/")
                    ? "pt-[var(--header-h)]"
                    : "pt-[calc(var(--header-h)+12px)]",
                ),
            !immersive && (extraWide ? "max-w-[1600px]" : wide ? "max-w-6xl" : "max-w-[620px]"),
          )}
        >
          {!hideTopBanner && !pathname.startsWith("/profile/") ? (
            <div className="ad-slot mb-5 flex items-center justify-center">
              <AdsterraBannerAd
                adKey="075ef17698a6be8914c3d3aaaf74c814"
                width={320}
                height={50}
                className="my-0 shadow-xs"
              />
            </div>
          ) : null}
          {children}
        </div>
      </main>

      {!immersive ? (
        <nav
          aria-label="Primary mobile navigation"
          className={cn(
            "xora-floating-nav fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-40 grid h-[66px] grid-cols-5 rounded-[22px] border border-[color:var(--xora-line)] px-1 pt-1 shadow-nav lg:hidden",
            pathname === "/xtv-series" && "xora-series-bottom-nav",
          )}
        >
          {[
            { to: "/", label: "Home", icon: House },
            { to: "/shorts", label: "Shorts", icon: Clapperboard },
            { to: "/xtv-series", label: "Series", icon: MonitorPlay },
            { to: "/tv", label: "Live TV", icon: RadioTower },
          ].map((item) => {
            const active = isActive(pathname, item.to);
            const Icon = item.icon;
            return (
              <NavDestinationLink
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "press flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold leading-none",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-xl",
                    active
                      ? "bg-clay-soft text-primary dark:bg-primary/15"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </NavDestinationLink>
            );
          })}
          <NavDestinationLink
            to="/menu"
            aria-current={moreActive ? "page" : undefined}
            className={cn("press flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold leading-none", moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            <span className={cn("grid size-8 place-items-center rounded-xl", moreActive && "bg-clay-soft text-primary dark:bg-primary/15")}>
              <Menu className="size-5" aria-hidden="true" />
            </span>
            <span>Menu</span>
          </NavDestinationLink>
        </nav>
      ) : null}

      {!immersive && rail ? (
        <aside className="fixed inset-y-0 right-0 z-30 hidden w-[320px] overflow-y-auto border-l border-border bg-sidebar px-5 py-7 xl:block">
          {rail}
        </aside>
      ) : null}
    </div>
  );
}

/** Secondary discovery tabs remain available on Shorts and Learn pages. Home uses its own feed filters. */
export function FeedTabs() {
  const tabs = [
    { key: "home", label: "Home", to: "/" },
    { key: "shorts", label: "Shorts", to: "/shorts" },
    { key: "xtv-series", label: "Series", to: "/xtv-series" },
    { key: "learn", label: "Learn", to: "/learn" },
  ] as const;

  return (
    <nav
      aria-label="Feed navigation"
      className="mb-5 flex w-full min-w-0 items-center gap-4 border-b border-border/80"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          activeOptions={tab.key === "home" ? { exact: true } : undefined}
          activeProps={{ "data-active": "true" }}
          inactiveProps={{ "data-active": "false" }}
          className="press relative inline-flex h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap px-2 text-sm font-semibold text-muted-foreground transition-colors data-[active=true]:text-foreground after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-8 after:-translate-x-1/2 after:rounded-full after:bg-transparent data-[active=true]:after:bg-primary"
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
