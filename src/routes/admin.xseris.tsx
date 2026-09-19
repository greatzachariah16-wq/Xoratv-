import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { AdminLoginGate } from "@/components/admin/AdminLoginGate";
import { AdminSecurityBar } from "@/components/admin/AdminSecurityBar";
import { XserisController } from "@/components/xora/XserisController";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export const Route = createFileRoute("/admin/xseris")({
  head: () => ({
    meta: [
      { title: "Xseris Controller — Admin — Xora" },
      {
        name: "description",
        content: "Manage Xseris source imports and review the catalog queue.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: XserisAdminPage,
});

function XserisAdminPage() {
  const {
    isAuthenticated: isAdmin,
    checkingSession,
    sessionInfo,
    loginStep,
    setLoginStep,
    isSubmitting,
    errorMessage,
    remainingAttempts,
    isLocked,
    retryAfter,
    verifyPhrases,
    verifyMfa,
    resetLockout,
    logout,
    refreshSession,
  } = useAdminAuth();

  if (checkingSession) {
    return (
      <AppShell wide>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs font-mono text-muted-foreground">
              Verifying sovereign administrator authorization...
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell wide>
        <AdminLoginGate
          loginStep={loginStep}
          isSubmitting={isSubmitting}
          errorMessage={errorMessage}
          remainingAttempts={remainingAttempts}
          isLocked={isLocked}
          retryAfter={retryAfter}
          onVerifyPhrases={verifyPhrases}
          onVerifyMfa={verifyMfa}
          onResetLockout={resetLockout}
          onBackToPhrases={() => setLoginStep("phrases")}
        />
      </AppShell>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-4 sm:px-8 lg:px-10">
          <Link
            to="/admin"
            className="press flex min-w-0 items-center gap-3"
            aria-label="Back to admin dashboard"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary font-display text-lg font-bold text-primary-foreground shadow-card">
              X
            </span>
            <span className="min-w-0 leading-none">
              <span className="block font-display text-[15px] font-semibold">XoraTV</span>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Admin studio
              </span>
            </span>
          </Link>

          <nav
            aria-label="Admin sections"
            className="hidden items-center gap-7 text-[13px] font-medium md:flex"
          >
            <Link
              to="/admin"
              hash="overview"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Overview
            </Link>
            <Link
              to="/admin"
              hash="discovery"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Discovery
            </Link>
            <Link to="/admin/xseris" className="font-semibold text-foreground">
              Xseris
            </Link>
            <Link
              to="/admin"
              hash="content"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Content
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/admin/xseris"
              aria-current="page"
              className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-card md:hidden"
            >
              Xseris
            </Link>
            <span className="hidden items-center gap-2 text-xs font-medium text-muted-foreground sm:flex">
              <span className="size-2 rounded-full bg-success" /> Secure session
            </span>
            <span className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-bold">
              XA
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] px-4 pb-16 pt-5 sm:px-8 lg:px-10">
        <section className="relative overflow-hidden rounded-3xl bg-ink px-5 py-8 text-primary-foreground shadow-lift sm:px-10 sm:py-10 lg:px-12 lg:py-12">
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sage">
              <ShieldCheck className="size-3.5" /> Secure catalog operations
            </div>
            <h1 className="mt-4 bg-gradient-to-r from-primary via-primary to-sage bg-clip-text font-display text-4xl font-bold leading-[0.95] text-transparent sm:text-5xl lg:text-6xl">
              Xseris Controller
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-primary-foreground/60 sm:text-[15px]">
              Import permitted source links, review extracted metadata, assign categories, and
              publish approved titles into the XoraTV catalog.
            </p>
            <Link
              to="/admin"
              hash="overview"
              className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-sage transition-opacity hover:opacity-80"
            >
              <ArrowLeft className="size-4" /> Back to dashboard
            </Link>
          </div>
        </section>

        <div className="mt-5">
          <AdminSecurityBar
            sessionInfo={sessionInfo}
            onLogout={logout}
            onRefreshSession={refreshSession}
          />
        </div>

        <XserisController />
      </main>
    </div>
  );
}
