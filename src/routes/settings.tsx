import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CircleHelp,
  FileText,
  Settings as SettingsIcon,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Xora" },
      { name: "description", content: "Xora account settings, support, privacy and terms." },
    ],
  }),
  component: SettingsPage,
});

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
  return (
    <AppShell wide>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
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
            Manage your Xora information, get support, and review the policies that govern the
            platform.
          </p>
        </header>
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
