import { memo, useEffect, useRef, useState } from "react";
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
  Gift,
  Play,
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
import { parseEmbedInfo } from "@/integrations/providers/embed";
import { LikePetalBurst } from "./LikePetalBurst";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  post: PostWithAuthor;
  vertical?: boolean;
  autoPlay?: boolean;
};

function PostCardComponent({ post, vertical = false, autoPlay = false }: Props) {
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
  const [videoOpened, setVideoOpened] = useState(false);
  const [thumbnailFallback, setThumbnailFallback] = useState(false);
  const likeButtonRef = useRef<HTMLButtonElement | null>(null);
  const viewRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setDisplayLikeCount(post.like_count ?? 0);
  }, [post.like_count]);

  useEffect(() => {
    setVideoOpened(false);
    setThumbnailFallback(false);
  }, [post.id, post.stream_url, post.poster_path]);

  const embedInfo = parseEmbedInfo(post.stream_url || post.media_path, post.source);
  const youtubeThumbnail = embedInfo?.provider === "youtube" && embedInfo.videoId
    ? `https://img.youtube.com/vi/${embedInfo.videoId}/hqdefault.jpg`
    : null;
  const feedThumbnail = thumbnailFallback ? post.poster_path : youtubeThumbnail || post.poster_path;

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
      <article ref={viewRef} className="rise press card-surface overflow-hidden rounded-[24px] transition-shadow duration-200">
        <div className="px-3 pt-3">
          {post.kind === "video" ? (
            <div className="relative">
              {videoOpened || autoPlay || Boolean(embedInfo) ? (
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
                  onClose={() => setVideoOpened(false)}
                />
              ) : (
                <div className={cn("relative aspect-video w-full overflow-hidden rounded-[24px] bg-[#2A1F1A]", vertical && "aspect-[9/16]")}>
                  {feedThumbnail ? (
                    <img
                      src={feedThumbnail}
                      alt=""
                      width={1280}
                      height={720}
                      loading="lazy"
                      decoding="async"
                      onError={() => setThumbnailFallback(true)}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ aspectRatio: vertical ? "9 / 16" : "16 / 9" }}
                    />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#5A382B] via-[#2A1F1A] to-[#17120F] px-8 text-center">
                      <span className="line-clamp-2 text-sm font-semibold text-white/80">{post.title || "Xora video"}</span>
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent" />
                  <span className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-4.5rem)] truncate rounded-full border border-white/25 bg-black/65 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white backdrop-blur-md">
                    4K HD
                  </span>
                  <button
                    type="button"
                    onClick={() => setVideoOpened(true)}
                    aria-label="Play video"
                    className="press absolute inset-0 z-20 grid place-items-center bg-black/10"
                  >
                    <span className="grid size-16 place-items-center rounded-full border border-white/45 bg-white/20 text-white shadow-xl backdrop-blur-xl">
                      <Play className="ml-1 size-7 fill-current" aria-hidden="true" />
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-surface-2">
              {post.poster_path ? (
                <img
                  src={post.poster_path}
                  alt={post.title || "Post image"}
                  loading="lazy"
                  className="max-h-[520px] w-full object-cover"
                />
              ) : null}
              <p className="whitespace-pre-wrap px-4 py-4 text-[15px] leading-relaxed text-foreground text-pretty">
                {post.caption}
              </p>
            </div>
          )}
        </div>

        {post.kind === "video" && post.special_prize_id && post.special_prize_link_token ? (
          <div className="px-3 pt-2">
            <a
              href={`/s/${encodeURIComponent(post.special_prize_link_token)}?postId=${encodeURIComponent(post.id)}`}
              className="press flex w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary/15"
            >
              <Gift className="size-4" aria-hidden="true" />
              Get your special prize
            </a>
          </div>
        ) : null}

        <div className={cn("px-3 pb-3", post.kind === "video" ? "pt-6" : "pt-3")}>
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
              <h3 className="line-clamp-2 font-display text-[17px] font-semibold leading-snug text-balance hover:text-primary">
                {post.title}
              </h3>
            </Link>
          ) : null}
        <header className={cn("flex min-w-0 items-center gap-2 border-t border-border/70 pt-4", post.kind === "video" ? "mt-6" : "mt-4")}>
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
            <UserAvatar path={author?.avatar_url} name={author?.display_name} size={36} />
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
                  "press grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground",
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

export const PostCard = memo(PostCardComponent);
