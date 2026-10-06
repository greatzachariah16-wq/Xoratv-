import { useEffect, useRef, useState } from "react";
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
  recordPostView,
  recordPostShare,
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
import { useLikes, useSubscriptions } from "@/hooks/useEngagement";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/events";
import { getOrCreateSessionId } from "@/lib/ranking";
import { UserAvatar } from "./UserAvatar";
import { VideoPlayer } from "./VideoPlayer";
import { LikePetalBurst } from "./LikePetalBurst";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  post: PostWithAuthor;
  vertical?: boolean;
  autoPlay?: boolean;
};

export function PostCard({ post, vertical = false, autoPlay = false }: Props) {
  const likes = useLikes();
  const subscriptions = useSubscriptions();
  const { user } = useAuth();
  const liked = likes.isLiked(post.id);
  const author = post.author;
  const isOwn = user?.id === post.author_id;
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [likeMoment, setLikeMoment] = useState(false);
  const [likeMomentOrigin, setLikeMomentOrigin] = useState<{ x: number; y: number } | null>(null);
  const [displayLikeCount, setDisplayLikeCount] = useState(post.like_count ?? 0);
  const likeButtonRef = useRef<HTMLButtonElement | null>(null);
  const viewRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setDisplayLikeCount(post.like_count ?? 0);
  }, [post.like_count]);

  useEffect(() => {
    if (post.kind !== "video" || typeof IntersectionObserver === "undefined") return;
    const node = viewRef.current;
    if (!node) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5);
      if (visible && !timer) {
        timer = setTimeout(() => {
          void recordPostView(post.id, user?.id || getOrCreateSessionId());
          timer = null;
        }, 2000);
      } else if (!visible && timer) {
        clearTimeout(timer);
        timer = null;
      }
    }, { threshold: [0.5] });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [post.id, post.kind, user?.id]);

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
      if (navigator.share) {
        await navigator.share({ title: post.title || "Xora", url });
        await recordPostShare(post.id);
      } else {
        await navigator.clipboard.writeText(url);
        await recordPostShare(post.id);
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
    <>
      <article ref={viewRef} className="rise overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-shadow duration-200 hover:shadow-lift">
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
              onClick={() => subscriptions.toggle(author.id)}
              disabled={subscriptions.pending}
              className={cn(
                "press ml-auto shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60",
                subscriptions.isSubscribed(author.id)
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {subscriptions.isSubscribed(author.id) ? "Subscribed" : "Subscribe"}
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

          <div className="relative mt-3 border-t border-border pt-2.5">
            <LikePetalBurst
              active={likeMoment}
              origin={likeMomentOrigin}
              onDone={() => {
                setLikeMoment(false);
                setLikeMomentOrigin(null);
              }}
            />
            <div className="flex items-center gap-1">
              <button
                ref={likeButtonRef}
                type="button"
                onClick={async () => {
                  const wasLiked = liked;
                  if (wasLiked) {
                    try {
                      await likes.toggleAsync(post.id);
                      setDisplayLikeCount((count) => Math.max(0, count - 1));
                    } catch {
                      // The mutation hook shows the error.
                    }
                    return;
                  }

                  try {
                    await likes.toggleAsync(post.id);
                    setDisplayLikeCount((count) => count + 1);
                    const rect = likeButtonRef.current?.getBoundingClientRect();
                    if (rect) {
                      setLikeMomentOrigin({
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2,
                      });
                    }
                    setLikeMoment(true);
                  } catch {
                    // The mutation hook shows the error; do not play the animation on failure.
                  }
                }}
                disabled={likes.pending}
                aria-pressed={liked}
                aria-label={liked ? "Unlike" : "Like"}
                className="press flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-60"
              >
              <Heart
                className={cn("size-4", liked ? "pop fill-primary text-primary" : "")}
                aria-hidden="true"
              />
              <span className="tabular-nums">{compactNumber(displayLikeCount)}</span>
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
              <span className="tabular-nums">{compactNumber(post.share_count ?? 0)}</span>
              </button>
            </div>
          </div>
        </div>
      </article>
    </>
  );
}
