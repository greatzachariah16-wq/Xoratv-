import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Menu,
  X,
  Search,
  LayoutGrid,
  Radio,
  Users,
  MessageSquareText,
  ShieldCheck,
  ShieldAlert,
  Wifi,
  Megaphone,
  Tv,
  Compass,
  FileVideo,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AdminSectionItem {
  id: string;
  title: string;
  category: "operations" | "users" | "growth" | "content";
  description: string;
  icon: React.ElementType;
  href?: string;
  isExternalRoute?: boolean;
  accentColor: string;
  badge?: string;
}

export const ADMIN_SECTIONS: AdminSectionItem[] = [
  // Operations & Health
  {
    id: "overview",
    title: "Platform Overview",
    category: "operations",
    description: "Core platform health, content review counts, and real-time totals.",
    icon: LayoutGrid,
    href: "/admin",
    accentColor: "text-primary",
  },
  {
    id: "presence",
    title: "Live Activity Tracker",
    category: "operations",
    description: "Real-time 2s heartbeat viewer presence and active session logs.",
    icon: Radio,
    href: "/admin/tracker",
    accentColor: "text-emerald-500",
    badge: "Live 2s",
  },
  {
    id: "fraud-guard",
    title: "Fraud Shield & Security",
    category: "operations",
    description: "Bot detection, hardware fingerprint collisions, and 4-tier enforcement.",
    icon: ShieldAlert,
    href: "/admin/fraud",
    accentColor: "text-rose-500",
  },

  // Users & Support
  {
    id: "users",
    title: "User Directory",
    category: "users",
    description: "Verified human account registrations, emails, and profile lookup.",
    icon: Users,
    href: "/admin/users",
    accentColor: "text-blue-500",
  },
  {
    id: "support",
    title: "Support Inbox",
    category: "users",
    description: "Community inquiries, user feedback tickets, and admin replies.",
    icon: MessageSquareText,
    href: "/admin/support",
    accentColor: "text-amber-500",
  },

  // Growth & Monetization
  {
    id: "data-rewards",
    title: "Automated MTN Data Rewards",
    category: "growth",
    description: "VTUshare wallet automation, 1GB data plan fulfillment, and vending logs.",
    icon: Wifi,
    href: "/admin/rewards",
    accentColor: "text-amber-400",
    badge: "VTUshare",
  },
  {
    id: "campaigns",
    title: "In-House Video Ads",
    category: "growth",
    description: "Sponsor campaign videos, targeting, and impressions tracking.",
    icon: Megaphone,
    href: "/admin/campaigns",
    accentColor: "text-purple-500",
  },

  // Content & Ingestion
  {
    id: "xseris",
    title: "Xseris Media Controller",
    category: "content",
    description: "Source crawler, TV series seasons, episodes, and video streaming catalog.",
    icon: Tv,
    href: "/admin/xseris",
    accentColor: "text-primary",
    badge: "Catalog",
  },
  {
    id: "discovery",
    title: "Provider Discovery Engine",
    category: "content",
    description: "Automated ingestion pipeline for YouTube, Vimeo, FAOTV, and RSS sources.",
    icon: Compass,
    href: "/admin/discovery",
    accentColor: "text-cyan-500",
  },
  {
    id: "content",
    title: "Content Moderation",
    category: "content",
    description: "Review queue, feed status toggles, and recent video publishing controls.",
    icon: FileVideo,
    href: "/admin/moderation",
    accentColor: "text-indigo-500",
  },
];

const CATEGORY_LABELS: Record<
  AdminSectionItem["category"],
  { label: string; description: string }
> = {
  operations: {
    label: "Operations & Analytics",
    description: "Real-time metrics, platform health & security",
  },
  users: {
    label: "Users & Communications",
    description: "Community directories, account records & support",
  },
  growth: {
    label: "Growth & Rewards",
    description: "MTN data delivery automation & campaign ads",
  },
  content: {
    label: "Content & Ingestion",
    description: "Xseris catalog, automated discovery & moderation",
  },
};

interface AdminNavigationMenuProps {
  activeSectionId?: string;
  variant?: "header" | "floating";
  onSectionClick?: (sectionId: string) => void;
}

export function AdminNavigationMenu({
  activeSectionId,
  variant = "header",
  onSectionClick,
}: AdminNavigationMenuProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  // Filter sections by search query
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return ADMIN_SECTIONS;
    const q = searchQuery.toLowerCase();
    return ADMIN_SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        CATEGORY_LABELS[s.category].label.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  // Group filtered sections by category
  const groupedSections = useMemo(() => {
    const groups: Record<AdminSectionItem["category"], AdminSectionItem[]> = {
      operations: [],
      users: [],
      growth: [],
      content: [],
    };
    for (const item of filteredSections) {
      groups[item.category].push(item);
    }
    return groups;
  }, [filteredSections]);

  const handleJump = (item: AdminSectionItem) => {
    setOpen(false);
    if (item.href) {
      void navigate({ to: item.href });
      return;
    }

    if (onSectionClick) {
      onSectionClick(item.id);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {variant === "floating" ? (
          <button
            type="button"
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-primary/30 bg-card/95 px-4 py-2.5 font-display text-xs font-semibold text-foreground shadow-2xl backdrop-blur-md transition-all hover:scale-105 hover:border-primary hover:bg-card active:scale-95"
            aria-label="Open Admin Sections Menu"
          >
            <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Menu className="size-3.5" />
            </span>
            <span>Sections Menu</span>
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              10
            </span>
          </button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="group relative h-9 gap-2 rounded-full border-border/80 bg-surface/80 px-3.5 text-xs font-semibold transition-colors hover:border-primary/50 hover:bg-secondary"
            aria-label="Open Admin Navigation Menu"
          >
            <Menu className="size-4 text-primary transition-transform group-hover:scale-110" />
            <span className="hidden sm:inline">Admin Menu</span>
            <span className="sm:hidden">Menu</span>
            <span className="flex size-4 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
              {ADMIN_SECTIONS.length}
            </span>
          </Button>
        )}
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col border-l border-border/70 bg-background/98 backdrop-blur-xl"
      >
        {/* Header zone */}
        <div className="border-b border-border/60 p-5 bg-card/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm shadow-card">
                X
              </span>
              <div>
                <SheetTitle className="font-display text-base font-bold">
                  Admin Command Menu
                </SheetTitle>
                <SheetDescription className="text-[11px] text-muted-foreground">
                  Quick navigation across all 10 management sections
                </SheetDescription>
              </div>
            </div>
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-full hover:bg-secondary"
                aria-label="Close menu"
              >
                <X className="size-4" />
              </Button>
            </SheetClose>
          </div>

          {/* Search filter input */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search sections (e.g. rewards, fraud, users, xseris)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 pl-9 pr-4 text-xs bg-background/80 border-border/80 rounded-xl focus-visible:ring-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Scrollable sections list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {(Object.keys(groupedSections) as Array<AdminSectionItem["category"]>).map(
            (categoryKey) => {
              const items = groupedSections[categoryKey];
              if (items.length === 0) return null;
              const categoryMeta = CATEGORY_LABELS[categoryKey];

              return (
                <div key={categoryKey} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      {categoryMeta.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground/70">
                      {items.length} {items.length === 1 ? "section" : "sections"}
                    </span>
                  </div>

                  <div className="grid gap-1.5">
                    {items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeSectionId === item.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleJump(item)}
                          className={`group flex items-start gap-3 w-full rounded-2xl p-3 text-left transition-all border ${
                            isActive
                              ? "bg-primary/10 border-primary/40 shadow-sm"
                              : "bg-card/40 border-border/50 hover:bg-secondary/70 hover:border-border"
                          }`}
                        >
                          <span
                            className={`grid size-9 shrink-0 place-items-center rounded-xl border border-border/60 bg-background/90 shadow-sm transition-transform group-hover:scale-105 ${item.accentColor}`}
                          >
                            <Icon className="size-4" />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-display text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                                {item.title}
                              </span>
                              {item.badge && (
                                <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-semibold text-muted-foreground border border-border/50">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground leading-relaxed">
                              {item.description}
                            </p>
                          </div>

                          <span className="mt-1 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary">
                            {item.isExternalRoute ? (
                              <ExternalLink className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            },
          )}

          {filteredSections.length === 0 && (
            <div className="py-12 text-center">
              <Search className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-2 text-xs font-semibold text-foreground">No matching sections</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Try searching for keywords like "rewards", "users", "ads", or "xseris".
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-border/60 bg-card/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <Link
              to="/"
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="size-3.5" /> Public View
            </Link>

            <Link
              to="/admin/xseris"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              <Tv className="size-3.5" /> Open Xseris Studio <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
