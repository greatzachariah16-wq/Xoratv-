import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, FileVideo, ShieldCheck, CheckCircle2, XCircle, Search } from "lucide-react";
import { adminPostsQuery, updateLocalPostStatus } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { RowSkeleton } from "@/components/xora/Skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";

export const Route = createFileRoute("/admin/moderation")({
  head: () => ({
    meta: [
      { title: "Content Moderation — Admin — Xora" },
      {
        name: "description",
        content: "Review queue, feed status toggles, and video publishing controls.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminModerationPage,
});

function AdminModerationPage() {
  const queryClient = useQueryClient();
  const { data: posts, isPending } = useQuery(adminPostsQuery());
  const [filter, setFilter] = useState<"all" | "published" | "pending" | "removed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "published" | "removed" }) => {
      updateLocalPostStatus(id, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      toast.success("Post status updated");
    },
    onError: () => toast.error("Couldn't update that post"),
  });

  const filteredPosts = (posts || []).filter((post) => {
    if (filter === "published" && post.status !== "published") return false;
    if (filter === "removed" && post.status !== "removed") return false;
    if (filter === "pending" && post.status === "published") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (post.title || post.caption || "").toLowerCase().includes(q);
      const matchAuthor = (post.author?.username || "").toLowerCase().includes(q);
      const matchFeed = (post.feed || "").toLowerCase().includes(q);
      if (!matchTitle && !matchAuthor && !matchFeed) return false;
    }

    return true;
  });

  return (
    <AdminProtectedLayout title="Content Moderation" currentSectionId="content">
      <section className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              <FileVideo className="size-3.5" /> Moderation Console
            </div>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Content & Feed Moderation
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Review user uploads, toggle publishing status across feeds, and inspect flagged media.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {filteredPosts.length} of {posts?.length ?? 0} items
            </span>
          </div>
        </div>

        {/* Filters and search bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border/80 bg-card p-4">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(["all", "published", "pending", "removed"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl capitalize transition-colors ${
                  filter === tab
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-surface text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search author, title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-8 pr-3 text-xs bg-background/80 border-border rounded-xl"
            />
          </div>
        </div>

        {/* Content list */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          {isPending ? (
            <div className="space-y-2 p-4">
              <RowSkeleton key="admin-skeleton-one" />
              <RowSkeleton key="admin-skeleton-two" />
              <RowSkeleton key="admin-skeleton-three" />
            </div>
          ) : filteredPosts.length ? (
            <div className="divide-y divide-border">
              {filteredPosts.map((post, index) => (
                <article
                  key={post.id || `admin-post-${index}`}
                  className="flex flex-col gap-3 p-4 transition-colors hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        post.status === "published"
                          ? "bg-emerald-500"
                          : post.status === "removed"
                            ? "bg-rose-500"
                            : "bg-amber-500"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {post.title || post.caption || "Untitled Content"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        @{post.author?.username || "unknown"} · {post.feed || "main"} ·{" "}
                        <span className="capitalize">{post.status}</span> ·{" "}
                        {timeAgo(post.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <Button asChild variant="secondary" size="sm" className="rounded-full text-xs">
                      <Link to="/video/$postId" params={{ postId: post.id }}>
                        <Eye className="size-3.5 mr-1" /> View
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs"
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate({
                          id: post.id,
                          status: post.status === "published" ? "removed" : "published",
                        })
                      }
                    >
                      {post.status === "published" ? "Remove" : "Publish"}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <ShieldCheck className="mx-auto size-8 text-primary" />
              <p className="mt-3 text-sm font-semibold text-foreground">No posts matching filter</p>
              <p className="mt-1 text-xs text-muted-foreground">
                All media items have been reviewed.
              </p>
            </div>
          )}
        </div>
      </section>
    </AdminProtectedLayout>
  );
}
