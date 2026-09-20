import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ShieldCheck, LifeBuoy } from "lucide-react";
import { notificationsQuery, markNotificationsAsRead } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/xora/AppShell";
import { UserAvatar } from "@/components/xora/UserAvatar";
import { EmptyState } from "@/components/xora/EmptyState";
import { RowSkeleton } from "@/components/xora/Skeletons";
import { timeAgo } from "@/lib/format";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Xora" },
      { name: "description", content: "Likes, comments and support replies on Xora." },
      { property: "og:title", content: "Notifications — Xora" },
      { property: "og:description", content: "Your latest Xora activity." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationsPage,
});

const COPY: Record<string, string> = {
  like: "liked your post",
  comment: "commented on your post",
  follow: "started following you",
  support_reply: "replied to your support ticket",
};

function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(notificationsQuery(user?.id));

  useEffect(() => {
    if (!user || !data?.some((n) => !n.read)) return;
    markNotificationsAsRead(user.id);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [user, data, queryClient]);

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Notifications</h1>

      <div className="mt-5 space-y-2">
        {!user ? (
          <EmptyState
            icon={Bell}
            title="Sign in to see activity"
            description="Likes, comments and support replies land here once you have an account."
            action={
              <Link
                to="/auth"
                className="press inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Sign in
              </Link>
            }
          />
        ) : isPending ? (
          <>
            <RowSkeleton />
            <RowSkeleton />
          </>
        ) : !data?.length ? (
          <EmptyState
            icon={Bell}
            title="All quiet"
            description="When people like, comment, follow or support team responds, it shows up here."
          />
        ) : (
          data.map((item) => {
            const isSupport =
              item.kind === "support_reply" || item.actor_id === "xora_support_admin";
            return (
              <div
                key={item.id}
                className={`flex items-start gap-3 rounded-2xl border p-3.5 transition-colors ${
                  isSupport ? "border-primary/30 bg-primary/5" : "border-border bg-surface"
                }`}
              >
                {isSupport ? (
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground font-bold shadow-sm">
                    <ShieldCheck className="size-5" />
                  </div>
                ) : (
                  <UserAvatar
                    path={item.actor?.avatar_url}
                    name={item.actor?.display_name}
                    size={40}
                  />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="leading-snug">
                    <span className="font-semibold text-foreground">
                      {isSupport
                        ? "Xora Support Team"
                        : item.actor?.display_name || item.actor?.username || "Someone"}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {COPY[item.kind] ?? "sent you an alert"}
                    </span>
                  </p>
                  {item.message ? (
                    <p className="mt-1 text-xs text-foreground/90 font-medium line-clamp-2 bg-background/50 p-2 rounded-xl border border-border/50">
                      {item.message}
                    </p>
                  ) : null}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {timeAgo(item.created_at)}
                  </span>
                </div>
                {isSupport ? (
                  <Link
                    to="/support"
                    className="press shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm flex items-center gap-1"
                  >
                    <LifeBuoy className="size-3" /> View Ticket
                  </Link>
                ) : item.post_id ? (
                  <Link
                    to="/video/$postId"
                    params={{ postId: item.post_id }}
                    className="press shrink-0 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold"
                  >
                    View
                  </Link>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
