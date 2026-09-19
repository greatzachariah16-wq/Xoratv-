import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Heart,
  MessageCircle,
  Share2,
  Trash2,
  Loader2,
  MoreHorizontal,
  EyeOff,
  Ban,
} from "lucide-react";
import {
  deletePost,
  markNotInterestedAction,
  hideCreatorAction,
  type PostWithAuthor,
} from "@/lib/api";
import { compactNumber, duration, timeAgo } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLikes, useFollows } from "@/hooks/useEngagement";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/events";
import { UserAvatar } from "./UserAvatar";
import { VideoPlayer } from "./VideoPlayer";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  post: PostWithAuthor;
  vertical?: boolean;
  autoPlay?: boolean;
};

export function PostCard({ post, vertical = false, autoPlay = false }: Props) {
  const likes = useLikes();
  const follows = useFollows();
  const { user } = useAuth();
  const liked = likes.isLiked(post.id);
  const author = post.author;
  const isOwn = user?.id === post.author_id;
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deletePost(post.id, post.feed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["profile-posts"] });
      queryClient.invalidateQueries({ queryKey: ["post", post.id] });
      queryClient.invalidateQueries({ queryKey: ["search"] });
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Post deleted");
    },
    onError: () => toast.error("Couldn't delete this post"),
  });

  const share = async () => {
    trackEvent({
      type: "share",
      postId: post.id,
      authorId: post.author_id,
      genre: post.genre,
      feed: post.feed,
      userId: user?.id,
    });
    const url = `${window.location.origin}/video/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: post.title || "Xora", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* dismissed */
    }
  };

  const handleNotInterested = () => {
    markNotInterestedAction(post.id, post.genre, user?.id);
    queryClient.invalidateQueries({ queryKey: ["feed"] });
    toast.success("We'll show less content like this");
  };

  const handleHideAuthor = () => {
    if (!post.author_id) return;
    hideCreatorAction(post.id, post.author_id, user?.id);
    queryClient.invalidateQueries({ queryKey: ["feed"] });
    toast.success(`Hidden posts from @${author?.username || "creator"}`);
  };

  return (
    <article className="rise overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-shadow duration-200 hover:shadow-lift">
      <header className="flex items-center gap-3 px-3 pt-3">
        <Link
          to="/profile/$username"
          params={{ username: author?.username ?? "" }}
          onClick={() => {
            if (author?.id) {
              trackEvent({
                type: "click_profile",
                authorId: author.id,
                feed: post.feed,
                userId: user?.id,
              });
            }
          }}
          className="press flex min-w-0 items-center gap-3"
        >
          <UserAvatar path={author?.avatar_url} name={author?.display_name} size={40} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold">
              {author?.display_name || author?.username}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {timeAgo(post.created_at)}
              {author?.location ? ` · ${author.location}` : ""}
            </span>
          </span>
        </Link>
        {!isOwn && author ? (
          <button
            type="button"
            onClick={() => follows.toggle(author.id)}
            disabled={follows.pending}
            className={cn(
              "press ml-auto shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60",
              follows.isFollowing(author.id)
                ? "bg-secondary text-secondary-foreground"
                : "bg-primary text-primary-foreground",
            )}
          >
            {follows.isFollowing(author.id) ? "Following" : "Follow"}
          </button>
        ) : null}

        {/* Options / More menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Post options"
              className={cn(
                "press shrink-0 rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground",
                isOwn || (!isOwn && !author) ? "ml-auto" : "",
              )}
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {!isOwn && (
              <>
                <DropdownMenuItem onClick={handleNotInterested} className="gap-2 text-xs">
                  <EyeOff className="size-3.5 text-muted-foreground" />
                  Not interested
                </DropdownMenuItem>
                {author && (
                  <DropdownMenuItem onClick={handleHideAuthor} className="gap-2 text-xs">
                    <Ban className="size-3.5 text-muted-foreground" />
                    Hide @{author.username}
                  </DropdownMenuItem>
                )}
              </>
            )}
            {isOwn && (
              <DropdownMenuItem
                onClick={() => setConfirmOpen(true)}
                className="gap-2 text-xs text-destructive focus:text-destructive"
              >
                <Trash2 className="size-3.5" />
                Delete post
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {isOwn ? (
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this post?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this post? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault();
                    deleteMutation.mutate(undefined, {
                      onSettled: () => setConfirmOpen(false),
                    });
                  }}
                  disabled={deleteMutation.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </header>

      <div className="px-3 pt-3">
        {post.kind === "video" ? (
          <div className="relative">
            <VideoPlayer
              source={post.source}
              streamUrl={post.stream_url}
              mediaPath={post.media_path}
              posterPath={post.poster_path}
              externalUrl={post.stream_url}
              externalPoster={post.poster_path}
              vertical={vertical}
              title={post.title || "Xora video"}
              postId={post.id}
              authorId={post.author_id}
              genre={post.genre}
              feed={post.feed}
              autoPlay={autoPlay}
              loop={autoPlay}
            />
            {post.duration_seconds ? (
              <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-ink/70 px-2 py-1 font-mono text-[10px] text-background">
                {duration(post.duration_seconds)}
              </span>
            ) : null}
            {post.source && post.source !== "render" && post.source !== "creator" ? (
              <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-ink/70 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-background">
                {post.source}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="rounded-xl bg-surface-2 px-4 py-5 text-[15px] leading-relaxed text-foreground text-pretty">
            {post.caption}
          </p>
        )}
      </div>

      <div className="px-3 pb-3 pt-3">
        {post.title ? (
          <Link
            to="/video/$postId"
            params={{ postId: post.id }}
            onClick={() => {
              trackEvent({
                type: "open_video",
                postId: post.id,
                authorId: post.author_id,
                genre: post.genre,
                feed: post.feed,
                userId: user?.id,
              });
            }}
            className="block"
          >
            <h3 className="font-display text-[17px] font-semibold leading-snug text-balance hover:text-primary">
              {post.title}
            </h3>
          </Link>
        ) : null}
        {post.kind === "video" && post.caption ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {post.caption}
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-1 border-t border-border pt-2.5">
          <button
            type="button"
            onClick={() => likes.toggle(post.id)}
            aria-pressed={liked}
            aria-label={liked ? "Unlike" : "Like"}
            className="press flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
          >
            <Heart
              className={cn("size-4", liked ? "pop fill-primary text-primary" : "")}
              aria-hidden="true"
            />
            <span className="tabular-nums">{compactNumber(post.like_count ?? 0)}</span>
          </button>
          <Link
            to="/video/$postId"
            params={{ postId: post.id }}
            hash="comments"
            aria-label="Comments"
            onClick={() => {
              trackEvent({
                type: "open_video",
                postId: post.id,
                authorId: post.author_id,
                genre: post.genre,
                feed: post.feed,
                userId: user?.id,
              });
            }}
            className="press flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            <span className="tabular-nums">{compactNumber(post.comment_count ?? 0)}</span>
          </Link>
          <button
            type="button"
            onClick={share}
            aria-label="Share"
            className="press flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
          >
            <Share2 className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Share</span>
          </button>
        </div>
      </div>
    </article>
  );
}
