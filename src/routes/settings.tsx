import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CircleHelp,
  FileText,
  Settings as SettingsIcon,
  Wallet,
  Smartphone,
  Sparkles,
  BookOpen,
  Tv,
  MessageCircle,
  Bell,
  Search,
  ShieldCheck,
  ChevronRight,
  Gauge,
  Check,
  Gift,
} from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { useDataSaver, type DataSaverMode } from "@/lib/data-saver";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Xora" },
      {
        name: "description",
        content: "Xora account settings, data usage optimization, support, privacy and terms.",
      },
    ],
  }),
  component: SettingsPage,
});

const APP_NAV_LINKS = [
  { href: "/wallet", label: "Xora Wallet", description: "Fund your wallet and use the same balance for data and course purchases.", icon: Wallet },
  { href: "/data", label: "Buy Data", description: "Browse Xora-approved mobile data plans and purchase from your wallet.", icon: Smartphone },
  { href: "/creator-studio", label: "Creator Studio", description: "Manage creator sales, courses, promotions, links and payouts.", icon: Sparkles },
  { href: "/offers", label: "Offer Wall", description: "Complete eligible offers to earn Xora Points for future data discounts and course unlocks.", icon: Gift },
  { href: "/learn", label: "Learn", description: "Explore video courses and create your own video course.", icon: BookOpen },
  { href: "/xtv-series", label: "X Series", description: "Browse Xora's video and series catalogue.", icon: Tv },
  { href: "/chat", label: "Chat", description: "Open your Xora conversations and community chat.", icon: MessageCircle },
  { href: "/notifications", label: "Alerts", description: "View notifications, activity and important account updates.", icon: Bell },
  { href: "/search", label: "Search", description: "Search Xora content, creators and videos.", icon: Search },
] as const;

const SETTINGS_LINKS = [
  {
    href: "/support",
    label: "Help & Support",
    description: "Get help, report a problem, or contact the Xora support team.",
    icon: CircleHelp,
  },
  {
    href: "/privacy#terms",
    label: "Terms of Service",
    description: "Read the rules and terms that apply when using XoraTV.",
    icon: FileText,
  },
  {
    href: "/privacy#privacy",
    label: "Privacy Policy",
    description: "See how XoraTV handles account, usage and support information.",
    icon: ShieldCheck,
  },
] as const;

function SettingsPage() {
  const { config, stats, setMode } = useDataSaver();

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const modes: {
    id: DataSaverMode;
    label: string;
    description: string;
    rate: string;
    tag: string;
  }[] = [
    {
      id: "300mb_saver",
      label: "300 MB / hr Max (Optimized)",
      description: "Strict 300MB/hr budget. Crisp 360p video, 550kbps bitrate ceiling.",
      rate: "≤ 300 MB/h",
      tag: "Recommended",
    },
    {
      id: "150mb_ultra",
      label: "150 MB / hr Ultra Saver",
      description: "Extreme data preservation for low data caps and 2G/3G networks.",
      rate: "≤ 150 MB/h",
      tag: "Ultra Low",
    },
    {
      id: "auto",
      label: "Smart Adaptive",
      description: "Automatically caps to 300MB/hr on cellular & mobile networks.",
      rate: "Adaptive",
      tag: "Auto",
    },
    {
      id: "off",
      label: "Standard Quality (Unlimited)",
      description: "Uncapped high definition for high-speed Wi-Fi and fiber connections.",
      rate: "Uncapped",
      tag: "Full HD",
    },
  ];

  return (
    <AppShell wide>
      <div className="mx-auto min-w-0 max-w-3xl">
        <div className="mb-6 sm:mb-8">
          <Link
            to="/"
            className="press inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to Xora
          </Link>
        </div>
        <header className="mb-8">
          <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
            <SettingsIcon className="size-6" />
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Manage your mobile data limits, platform preferences, and support policies.
          </p>
        </header>

        {/* Mobile Data Saver Optimization Card */}
        <section className="mb-8 overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-card">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Smartphone className="size-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Mobile Data Usage & 300 MB/hr Limit
              </h2>
              <p className="text-xs text-muted-foreground">
                Cap streaming bitrate and buffer sizes to prevent high cellular data consumption
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
            <div>
              <span className="text-[11px] font-medium uppercase text-muted-foreground">
                Session Usage
              </span>
              <p className="mt-1 text-base font-bold text-foreground">
                {formatBytes(stats.sessionBytesUsed)}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-medium uppercase text-muted-foreground">
                Rate Limit
              </span>
              <p className="mt-1 text-base font-bold text-emerald-600 dark:text-emerald-400">
                ≤ {config.maxBitrateKbps} kbps
              </p>
            </div>
            <div>
              <span className="text-[11px] font-medium uppercase text-muted-foreground">
                Data Saved
              </span>
              <p className="mt-1 text-base font-bold text-primary">~{stats.savingsPercent}%</p>
            </div>
          </div>

          <div className="mt-5 space-y-2.5">
            {modes.map((item) => {
              const active = config.mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition",
                    active
                      ? "border-primary bg-primary/5 shadow-xs"
                      : "border-border bg-surface hover:bg-secondary/50",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {active ? <Check className="size-3 stroke-[3]" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">{item.label}</span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase",
                          active
                            ? "bg-primary/20 text-primary"
                            : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {item.tag}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-6 overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Xora</p>
            <h2 className="mt-1 font-display text-lg font-semibold">Explore & manage</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">All secondary destinations are kept here so the mobile shell stays clean and easy to reach.</p>
          </div>
          <div className="grid gap-px bg-border sm:grid-cols-2">
            {APP_NAV_LINKS.map(({ href, label, description, icon: Icon }) => (
              <Link key={label} to={href as any} className="press flex min-h-20 items-center gap-3 bg-surface px-4 py-4 transition-colors hover:bg-secondary/60 sm:px-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
          {SETTINGS_LINKS.map(({ href, label, description, icon: Icon }, index) => (
            <a
              key={label}
              href={href}
              className={`press flex items-center gap-4 px-5 py-5 transition-colors hover:bg-secondary/60 sm:px-6 ${index > 0 ? "border-t border-border" : ""}`}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-sm font-semibold text-foreground">
                  {label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {description}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </a>
          ))}
        </section>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          XoraTV · Short video, long ideas.
        </p>
      </div>
    </AppShell>
  );
}
