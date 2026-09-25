import { Link } from "@tanstack/react-router";
import { ChevronRight, ArrowLeft } from "lucide-react";
import { AdminNavigationMenu } from "./AdminNavigationMenu";

interface AdminHeaderProps {
  title?: string;
  subtitle?: string;
  currentSectionId?: string;
  showBackToDashboard?: boolean;
}

export function AdminHeader({
  title,
  subtitle = "Admin studio",
  currentSectionId,
  showBackToDashboard = false,
}: AdminHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between px-4 py-3.5 sm:px-8 lg:px-10">
        {/* Left: Brand & Breadcrumb */}
        <div className="flex items-center gap-3">
          <Link to="/" className="press flex items-center gap-2.5" aria-label="Return to XoraTV">
            <span className="grid size-8 place-items-center rounded-lg bg-primary font-display text-base font-bold text-primary-foreground shadow-card">
              X
            </span>
            <span className="hidden sm:inline font-display text-sm font-semibold tracking-tight">
              XoraTV
            </span>
          </Link>

          <span className="text-border text-xs">/</span>

          <Link
            to="/admin"
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Admin</span>
          </Link>

          {title && (
            <>
              <ChevronRight className="size-3 text-muted-foreground/60" />
              <span className="text-xs font-semibold text-foreground truncate max-w-[180px] sm:max-w-none">
                {title}
              </span>
            </>
          )}
        </div>

        {/* Right: Quick Links, Menu Launcher, Session status */}
        <div className="flex items-center gap-2.5">
          {showBackToDashboard && (
            <Link
              to="/admin"
              className="hidden md:inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3" /> Dashboard
            </Link>
          )}

          {/* Clean Menu Icon Drawer */}
          <AdminNavigationMenu activeSectionId={currentSectionId} variant="header" />

          <span className="hidden items-center gap-1.5 text-xs font-medium text-muted-foreground lg:flex">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" /> Secure session
          </span>

          <span className="grid size-8 place-items-center rounded-full bg-secondary text-[11px] font-bold border border-border/70">
            XA
          </span>
        </div>
      </div>
    </header>
  );
}
