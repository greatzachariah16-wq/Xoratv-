import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { notificationsQuery } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
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
      { name: "description", content: "Likes, comments and new followers on your Xora posts." },
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
};

function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(notificationsQuery(user?.id));

  useEffect(() => {
    if (!user || !data?.some((n) => !n.read)) return;
    void supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false)
      .then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }));
  }, [user, data, queryClient]);

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Notifications</h1>

      <div className="mt-5 space-y-2">
        {!user ? (
          <EmptyState
            icon={Bell}
            title="Sign in to see activity"
            description="Likes, comments and follows land here once you have an account."
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
            description="When people like, comment or follow you, it shows up here."
          />
        ) : (
          data.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
            >
              <UserAvatar path={item.actor?.avatar_url} name={item.actor?.display_name} size={40} />
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">
                  {item.actor?.display_name || item.actor?.username || "Someone"}
                </span>{" "}
                <span className="text-muted-foreground">
                  {COPY[item.kind] ?? "interacted with you"}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {timeAgo(item.created_at)}
                </span>
              </p>
              {item.post_id ? (
                <Link
                  to="/video/$postId"
                  params={{ postId: item.post_id }}
                  className="press shrink-0 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold"
                >
                  View
                </Link>
              ) : null}
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
