import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { adminPostsQuery, adminStatsQuery } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/xora/AppShell";
import { EmptyState } from "@/components/xora/EmptyState";
import { RowSkeleton } from "@/components/xora/Skeletons";
import { timeAgo } from "@/lib/format";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Xora" },
      { name: "description", content: "Moderation and platform stats for Xora administrators." },
      { property: "og:title", content: "Admin — Xora" },
      { property: "og:description", content: "Xora moderation dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();
  const { data: stats } = useQuery({ ...adminStatsQuery(), enabled: isAdmin });
  const { data: posts, isPending } = useQuery({ ...adminPostsQuery(), enabled: isAdmin });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "published" | "removed" }) => {
      const { error } = await supabase.from("posts").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      toast.success("Post updated");
    },
    onError: () => toast.error("Couldn't update that post"),
  });

  if (!loading && !isAdmin) {
    return (
      <AppShell>
        <EmptyState
          icon={ShieldAlert}
          title="Admins only"
          description="You don't have permission to view the moderation dashboard."
          action={
            <Link
              to="/"
              className="press inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Back to feed
            </Link>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="mt-1 text-sm text-muted-foreground">Platform health and content moderation.</p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Users", value: stats?.users ?? 0 },
          { label: "Posts", value: stats?.posts ?? 0 },
          { label: "Comments", value: stats?.comments ?? 0 },
          { label: "Not live", value: stats?.flagged ?? 0 },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-8 font-display text-lg font-semibold">Recent posts</h2>
      <div className="mt-3 space-y-2">
        {isPending ? (
          <>
            <RowSkeleton />
            <RowSkeleton />
          </>
        ) : (
          posts?.map((post) => (
            <div
              key={post.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {post.title || post.caption || "Untitled"}
                </p>
                <p className="text-xs text-muted-foreground">
                  @{post.author?.username} · {post.feed} · {post.status} ·{" "}
                  {timeAgo(post.created_at)}
                </p>
              </div>
              <Link
                to="/video/$postId"
                params={{ postId: post.id }}
                className="press shrink-0 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold"
              >
                View
              </Link>
              <button
                type="button"
                onClick={() =>
                  setStatus.mutate({
                    id: post.id,
                    status: post.status === "published" ? "removed" : "published",
                  })
                }
                className="press shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
              >
                {post.status === "published" ? "Remove" : "Restore"}
              </button>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
