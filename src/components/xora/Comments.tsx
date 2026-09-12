import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { commentsQuery } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { timeAgo } from "@/lib/format";
import { UserAvatar } from "./UserAvatar";
import { RowSkeleton } from "./Skeletons";

export function Comments({ postId }: { postId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const { data, isPending } = useQuery(commentsQuery(postId));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["comments", postId] });
    queryClient.invalidateQueries({ queryKey: ["post", postId] });
    queryClient.invalidateQueries({ queryKey: ["feed"] });
  };

  const add = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to comment");
      const { error } = await supabase
        .from("comments")
        .insert({ post_id: postId, author_id: user.id, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error("Couldn't delete that comment"),
  });

  return (
    <section id="comments" className="mt-8 scroll-mt-20">
      <h2 className="font-display text-lg font-semibold">Comments</h2>

      {user ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) add.mutate();
          }}
          className="mt-3 flex items-start gap-2"
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            maxLength={600}
            aria-label="Write a comment"
            placeholder="Add a comment…"
            className="min-w-0 flex-1 resize-none rounded-xl border border-input bg-surface px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={add.isPending || !body.trim()}
            className="press rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Post
          </button>
        </form>
      ) : (
        <p className="mt-3 rounded-xl border border-border bg-surface p-3 text-sm text-muted-foreground">
          <Link to="/auth" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>{" "}
          to join the conversation.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {isPending ? (
          <RowSkeleton />
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">No comments yet — start the thread.</p>
        ) : (
          data.map((comment) => (
            <article key={comment.id} className="flex gap-3">
              <UserAvatar
                path={comment.author?.avatar_url}
                name={comment.author?.display_name}
                size={34}
              />
              <div className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {comment.author?.display_name || comment.author?.username}
                  </span>{" "}
                  · {timeAgo(comment.created_at)}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-pretty">{comment.body}</p>
              </div>
              {user?.id === comment.author_id ? (
                <button
                  type="button"
                  onClick={() => remove.mutate(comment.id)}
                  aria-label="Delete comment"
                  className="press grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
