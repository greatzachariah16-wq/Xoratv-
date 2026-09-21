import { createFileRoute, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminPostsQuery, adminStatsQuery, updateLocalPostStatus } from "@/lib/api";
import { AppShell } from "@/components/xora/AppShell";
import { RowSkeleton } from "@/components/xora/Skeletons";
import { ProviderDiscoveryPanel } from "@/components/xora/ProviderDiscoveryPanel";
import { timeAgo } from "@/lib/format";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminLoginGate } from "@/components/admin/AdminLoginGate";
import { AdminSecurityBar } from "@/components/admin/AdminSecurityBar";
import { AdminLiveUsersTracker } from "@/components/admin/AdminLiveUsersTracker";
import { AdminSupportInbox } from "@/components/admin/AdminSupportInbox";
import { AdminUsersDirectory } from "@/components/admin/AdminUsersDirectory";
import { AdminFraudShieldDashboard } from "@/components/admin/AdminFraudShieldDashboard";
import { AdminRewardsManager } from "@/components/admin/AdminRewardsManager";
import { AdminCampaignManager } from "@/components/admin/AdminCampaignManager";
import { Button } from "@/components/ui/button";
import {
  Activity,
  ArrowRight,
  Eye,
  FileVideo,
  MessageSquareText,
  Radio,
  ShieldCheck,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Xora" },
      { name: "description", content: "Moderation and platform stats for Xora administrators." },
      { property: "og:title", content: "Admin — Xora" },
      { property: "og:description", content: "Xora moderation dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
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

  const childMatches = useChildMatches();
  const isChildActive = childMatches.length > 0;

  const queryClient = useQueryClient();
  const { data: stats } = useQuery({ ...adminStatsQuery(), enabled: isAdmin && !isChildActive });
  const { data: posts, isPending } = useQuery({
    ...adminPostsQuery(),
    enabled: isAdmin && !isChildActive,
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "published" | "removed" }) => {
      updateLocalPostStatus(id, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      toast.success("Post updated");
    },
    onError: () => toast.error("Couldn't update that post"),
  });

  if (checkingSession) {
    return (
      <AppShell wide>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground font-mono">
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

  if (isChildActive) {
    return <Outlet />;
  }

  const publishedPosts = posts?.filter((post) => post.status === "published").length ?? 0;
  const reviewPosts = posts?.filter((post) => post.status !== "published").length ?? 0;
  const latestPost = posts?.[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between px-4 py-4 sm:px-8 lg:px-10">
          <Link to="/" className="press flex items-center gap-3" aria-label="Return to XoraTV">
            <span className="grid size-9 place-items-center rounded-lg bg-primary font-display text-lg font-bold text-primary-foreground shadow-card">
              X
            </span>
            <span className="leading-none">
              <span className="block font-display text-[15px] font-semibold">XoraTV</span>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Admin studio
              </span>
            </span>
          </Link>

          <nav
            aria-label="Admin sections"
            className="hidden items-center gap-6 text-[13px] font-medium text-muted-foreground md:flex"
          >
            <Link to="/admin" hash="overview" className="text-foreground">
              Overview
            </Link>
            <Link to="/admin" hash="presence" className="transition-colors hover:text-foreground">
              Live Tracker
            </Link>
            <Link to="/admin" hash="users" className="transition-colors hover:text-foreground">
              Users
            </Link>
            <Link to="/admin" hash="support" className="transition-colors hover:text-foreground">
              Support
            </Link>
            <Link
              to="/admin"
              hash="fraud-guard"
              className="transition-colors hover:text-foreground"
            >
              Fraud Shield
            </Link>
            <Link
              to="/admin"
              hash="data-rewards"
              className="transition-colors hover:text-foreground"
            >
              Data Rewards
            </Link>
            <Link to="/admin" hash="campaigns" className="transition-colors hover:text-foreground">
              In-House Ads
            </Link>
            <Link to="/admin" hash="discovery" className="transition-colors hover:text-foreground">
              Discovery
            </Link>
            <Link to="/admin" hash="content" className="transition-colors hover:text-foreground">
              Content
            </Link>
            <Link to="/admin/xseris" className="transition-colors hover:text-foreground">
              Xseris
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/admin/xseris"
              className="inline-flex h-9 items-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-card md:hidden"
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

      <main id="main" className="mx-auto max-w-[1480px] px-4 pb-16 pt-5 sm:px-8 lg:px-10">
        <section
          id="overview"
          className="relative overflow-hidden rounded-3xl bg-ink px-5 py-9 text-primary-foreground shadow-lift sm:px-10 sm:py-12 lg:px-12 lg:py-16"
        >
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sage">
              <Radio className="size-3.5" /> Platform operations
            </div>
            <h1 className="mt-5 bg-gradient-to-r from-primary via-primary to-sage bg-clip-text font-display text-5xl font-bold leading-[0.92] text-transparent sm:text-6xl lg:text-8xl">
              Content command center
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-relaxed text-primary-foreground/60 sm:text-[15px]">
              Review platform health, discover new programming, and keep every XoraTV feed ready for
              viewers.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button asChild className="h-11 rounded-full px-5 shadow-none">
                <a href="#discovery">
                  Open discovery <ArrowRight />
                </a>
              </Button>
              <span className="text-xs text-primary-foreground/45">
                {latestPost
                  ? `Latest post ${timeAgo(latestPost.created_at)}`
                  : "Awaiting first post"}
              </span>
            </div>
          </div>

          <div className="relative z-10 mt-8 grid gap-3 sm:grid-cols-2 lg:absolute lg:right-10 lg:top-12 lg:mt-0 lg:w-60 lg:grid-cols-1">
            <div className="rounded-2xl border border-primary-foreground/10 bg-primary-foreground/5 px-5 py-4 backdrop-blur-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-foreground/45">
                Published
              </span>
              <span className="mt-1 block font-display text-2xl font-semibold">
                {publishedPosts}
              </span>
              <span className="text-xs text-sage">Ready across all feeds</span>
            </div>
            <div className="rounded-2xl border border-primary-foreground/10 bg-primary-foreground/5 px-5 py-4 backdrop-blur-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-foreground/45">
                Needs attention
              </span>
              <span className="mt-1 block font-display text-2xl font-semibold">{reviewPosts}</span>
              <span className="text-xs text-primary-foreground/45">Items outside live status</span>
            </div>
          </div>
        </section>

        <section
          aria-label="Platform totals"
          className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          {[
            {
              label: "Registered Users",
              value: stats?.users ?? 0,
              detail: "Active accounts on XoraTV",
              icon: Users,
            },
            {
              label: "Content",
              value: stats?.posts ?? 0,
              detail: "Posts in library",
              icon: FileVideo,
            },
            {
              label: "Conversations",
              value: stats?.comments ?? 0,
              detail: "Community comments",
              icon: MessageSquareText,
            },
            {
              label: "Review queue",
              value: stats?.flagged ?? 0,
              detail: "Not currently live",
              icon: Activity,
            },
          ].map(({ label, value, detail, icon: Icon }) => (
            <article key={label} className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <Icon className="size-4 text-primary" aria-hidden="true" />
              </div>
              <strong className="mt-2 block font-display text-3xl font-semibold tabular-nums">
                {value}
              </strong>
              <span className="mt-1 block text-[11px] text-muted-foreground">{detail}</span>
            </article>
          ))}
        </section>

        <div className="mt-6">
          <AdminSecurityBar
            sessionInfo={sessionInfo}
            onLogout={logout}
            onRefreshSession={refreshSession}
          />
        </div>

        <div className="mt-8 space-y-8">
          <AdminLiveUsersTracker />
          <AdminUsersDirectory />
          <AdminSupportInbox />
          <AdminFraudShieldDashboard />
          <AdminRewardsManager />
          <AdminCampaignManager />
        </div>

        <Link
          to="/admin/xseris"
          className="group mt-5 block rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-card transition duration-200 hover:border-primary/40 hover:bg-primary/10 sm:p-5"
          aria-label="Open Xseris source and catalog controller"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-card transition-transform group-hover:scale-105">
                <Radio className="size-5" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  Xseris
                </p>
                <h2 className="mt-1 font-display text-lg font-semibold group-hover:text-primary">
                  Source & catalog controller
                </h2>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                  Process source links, review metadata, manage categories, and publish approved
                  titles.
                </p>
              </div>
            </div>
            <span className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-card transition group-hover:bg-primary/90 sm:w-auto">
              Open Xseris{" "}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </Link>

        <section id="discovery" className="scroll-mt-6">
          <ProviderDiscoveryPanel />
        </section>

        <section id="content" className="mt-10 scroll-mt-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Moderation
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold">Recent content</h2>
            </div>
            <span className="text-xs text-muted-foreground">{posts?.length ?? 0} items</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {isPending ? (
              <div className="space-y-2 p-4">
                <RowSkeleton key="admin-skeleton-one" />
                <RowSkeleton key="admin-skeleton-two" />
              </div>
            ) : posts?.length ? (
              <div className="divide-y divide-border">
                {posts.map((post, index) => (
                  <article
                    key={post.id || `admin-post-${index}`}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-secondary/45 sm:flex-row sm:items-center"
                  >
                    <span
                      className={`size-2 shrink-0 rounded-full ${post.status === "published" ? "bg-success" : "bg-primary"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {post.title || post.caption || "Untitled"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        @{post.author?.username} · {post.feed} · {post.status} ·{" "}
                        {timeAgo(post.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button asChild variant="secondary" size="sm" className="rounded-full">
                        <Link to="/video/$postId" params={{ postId: post.id }}>
                          <Eye /> View
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        disabled={setStatus.isPending}
                        onClick={() =>
                          setStatus.mutate({
                            id: post.id,
                            status: post.status === "published" ? "removed" : "published",
                          })
                        }
                      >
                        {post.status === "published" ? "Remove" : "Restore"}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-6 py-14 text-center">
                <ShieldCheck className="mx-auto size-7 text-sage" />
                <p className="mt-3 text-sm font-semibold">The content queue is clear</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  New posts will appear here for review.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
