import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Lock, CheckCircle2, Gift, Sparkles } from "lucide-react";

import {
  uploadToCloudinary,
  isCloudinaryConfigured,
} from "@/lib/media";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/xora/AppShell";
import { EmptyState } from "@/components/xora/EmptyState";
import { cn } from "@/lib/utils";
import { commerceFetch, creatorDashboardQuery } from "@/lib/commerce";


export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create a post — Xora" },
      {
        name: "description",
        content: "Upload a video or share a thought with the Xora community.",
      },
      { property: "og:title", content: "Create a post — Xora" },
      { property: "og:description", content: "Upload a video or share a thought on Xora." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CreatePage,
});

const MAX_DURATION_SECONDS = 1800; // 30 minutes
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

function CreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: creatorDashboard } = useQuery(creatorDashboardQuery(user?.id));
  const isActiveCreator = creatorDashboard?.dashboard?.creator?.status === "active";

  const [kind, setKind] = useState<"video" | "text">("video");
  
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [promoteSpecialPrize, setPromoteSpecialPrize] = useState(false);
  const [selectedSpecialPrize, setSelectedSpecialPrize] = useState("");
  const [specialPrizes, setSpecialPrizes] = useState<Array<{id:string;title:string;description?:string}>>([]);

  useEffect(() => {
    if (!isActiveCreator) return;
    let mounted = true;
    void commerceFetch<{prizes:Array<{id:string;title:string;description?:string}>}>("/api/commerce/special-prizes")
      .then(result => { if (mounted) setSpecialPrizes(Array.isArray(result.prizes) ? result.prizes : []); })
      .catch(() => { if (mounted) setSpecialPrizes([]); });
    return () => { mounted = false; };
  }, [isActiveCreator]);

  const handleVideoSelect = async (file: File | null) => {
    if (!file) {
      setVideo(null);
      setVideoDuration(null);
      return;
    }

    // 1. File size cap: 100 MB
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(
        `Video exceeds 100MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB). Please select a file under 100MB.`,
      );
      setVideo(null);
      setVideoDuration(null);
      return;
    }

    // 2. Format check
    if (!file.type.startsWith("video/")) {
      toast.error("Please choose a valid video file (MP4 or WebM).");
      setVideo(null);
      setVideoDuration(null);
      return;
    }

    // 3. Duration cap: 30 minutes (1800 seconds)
    try {
      const dur = await readDuration(file);
      if (dur > MAX_DURATION_SECONDS) {
        toast.error(
          `Video is ${Math.floor(dur / 60)} minutes long. Maximum allowed duration is 30 minutes (1800s).`,
        );
        setVideo(null);
        setVideoDuration(null);
        return;
      }
      setVideo(file);
      setVideoDuration(dur);
    } catch {
      toast.error("Unable to inspect video metadata. Please ensure it is a valid MP4/WebM file.");
      setVideo(null);
      setVideoDuration(null);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in first");
      let mediaPath: string | null = null;
      let posterPath: string | null = null;
      let streamUrl: string | null = null;
      let durationSeconds: number | null = null;
      let specialPrizeId: string | null = null;
      let specialPrizeLinkToken: string | null = null;

      if (kind === "video" && promoteSpecialPrize) {
        if (!isActiveCreator) throw new Error("Only active X Channel creators can promote Special Prizes.");
        if (!selectedSpecialPrize) throw new Error("Choose a Special Prize for this video, or switch the promotion off.");
        const linkResult = await commerceFetch<{link:{token:string}}>("/api/commerce/creator/special-prize-link", {
          method: "POST",
          body: JSON.stringify({ specialPrizeId: selectedSpecialPrize }),
        });
        specialPrizeId = selectedSpecialPrize;
        specialPrizeLinkToken = linkResult.link.token;
      }

      if (kind === "video") {
        if (!video) throw new Error("Choose a video file");

        // Validate size cap before upload
        if (video.size > MAX_FILE_SIZE_BYTES) {
          throw new Error("Video exceeds the 100MB maximum size limit.");
        }

        // Validate duration cap before upload
        let measured = videoDuration;
        if (measured === null) {
          measured = await readDuration(video).catch(() => null);
        }
        if (measured && measured > MAX_DURATION_SECONDS) {
          throw new Error(
            `Video is ${Math.floor(measured / 60)} minutes long. Maximum allowed duration is 30 minutes (1800s).`,
          );
        }
        durationSeconds = measured;

        // Store creator Shorts permanently in Cloudinary. Keep the durable
        // public_id as media_path and the permanent Cloudinary URL as stream_url.
        setProgress(5);
        const uploaded = await uploadToCloudinary(video, {
          resourceType: "video",
          creatorId: user.id,
          title: title.trim(),
          description: caption.trim(),
          onProgress: setProgress,
        });
        streamUrl = uploaded.url || uploaded.playbackUrl || null;
        mediaPath = uploaded.publicId || streamUrl;

        if (poster) {
          if (!isCloudinaryConfigured()) {
            throw new Error("Image uploads are temporarily unavailable. Please try again later.");
          }
          const posterRes = await uploadToCloudinary(poster, {
            resourceType: "image",
            folder: "xora/posters",
          });
          posterPath = posterRes.url || posterRes.playbackUrl || null;
          if (!posterPath) throw new Error("The cover image could not be saved.");
        }
      }

      if (kind === "text") {
        if (!poster) throw new Error("Add a picture to your post before publishing.");
        if (!isCloudinaryConfigured()) {
          throw new Error("Image uploads are temporarily unavailable. Please try again later.");
        }
        const imageRes = await uploadToCloudinary(poster, {
          resourceType: "image",
          folder: "xora/posts",
        });
        posterPath = imageRes.url || imageRes.playbackUrl || null;
        if (!posterPath) throw new Error("The post picture could not be saved.");
      }

      const result = await commerceFetch<{ ok: true; post: { id: string } }>("/api/commerce/creator/post", {
        method: "POST",
        body: JSON.stringify({
          kind,
          title: title.trim() || null,
          caption: caption.trim() || null,
          mediaPath,
          posterPath,
          streamUrl,
          durationSeconds,
          specialPrizeId,
          specialPrizeLinkToken,
        }),
      });
      return { postId: result.post.id, kind };
    },
    onSuccess: ({ postId, kind }) => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["feed-infinite"] });
      queryClient.invalidateQueries({ queryKey: ["profile-posts"] });
      queryClient.invalidateQueries({ queryKey: ["commerce", "creator-dashboard"] });
      toast.success("Posted");
      if (kind === "text") void navigate({ to: "/" });
      else void navigate({ to: "/video/$postId", params: { postId } });
    },
    onError: (error) => {
      setProgress(0);
      toast.error(error instanceof Error ? error.message : "Upload failed");
    },
  });

  if (!user) {
    return (
      <AppShell>
        <EmptyState
          icon={Lock}
          title="Sign in to create"
          description="You need an account to upload videos and share posts on Xora."
          action={
            <Link
              to="/auth"
              className="press inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Sign in
            </Link>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Create</h1>
      <p className="mt-1 text-sm text-muted-foreground">Share a video or a short written post.</p>

      <div className="mt-5 flex gap-1 rounded-full border border-border bg-surface p-1">
        {(["video", "text"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setKind(option)}
            className={cn(
              "press flex-1 rounded-full px-4 py-1.5 text-sm font-medium capitalize",
              kind === option
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="mt-5 space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-card"
      >
        {kind === "video" ? (
          <>
            <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
              <p className="text-xs font-semibold text-primary">Publishing to Shorts</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Creator videos appear in the Shorts feed and on your X Channel — not in the main Home feed.</p>
            </div>

            <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center transition hover:border-primary/50">
              <Upload className="size-6 text-muted-foreground" aria-hidden="true" />
              <span className="mt-2 text-sm font-medium">
                {video ? video.name : "Choose a video file"}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                Max 30 minutes · original upload preserved · max ~100MB
              </span>
              {video && videoDuration !== null ? (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  <CheckCircle2 className="size-3.5" />
                  {Math.floor(videoDuration / 60)}m {videoDuration % 60}s ·{" "}
                  {(video.size / (1024 * 1024)).toFixed(1)} MB
                </span>
              ) : null}
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={(e) => void handleVideoSelect(e.target.files?.[0] ?? null)}
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                {poster ? poster.name : "Cover image (optional)"}
              </span>
              <span className="font-semibold text-primary">Browse</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setPoster(e.target.files?.[0] ?? null)}
              />
            </label>

            {isActiveCreator ? (
              <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={promoteSpecialPrize}
                    onChange={event => setPromoteSpecialPrize(event.target.checked)}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-semibold"><Gift className="size-4 text-primary"/> Promote a Special Prize</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">Add a “Get your special prize” button beneath this video. It will open the selected Special Prize page.</span>
                  </span>
                </label>
                {promoteSpecialPrize ? (
                  <div className="mt-3 space-y-2">
                    <label htmlFor="special-prize-select" className="text-xs font-semibold">Choose the Special Prize</label>
                    <select
                      id="special-prize-select"
                      value={selectedSpecialPrize}
                      onChange={event => setSelectedSpecialPrize(event.target.value)}
                      required
                      className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Select an active Special Prize</option>
                      {specialPrizes.map(prize => <option key={prize.id} value={prize.id}>{prize.title}</option>)}
                    </select>
                    {specialPrizes.length === 0 ? <p className="text-[11px] text-muted-foreground">No active Special Prizes are available right now.</p> : <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Sparkles className="size-3.5 text-primary"/> You can turn this off for any video before publishing.</p>}
                  </div>
                ) : null}
              </section>
            ) : null}

            <div>
              <label htmlFor="title" className="text-xs font-medium text-muted-foreground">
                Title
              </label>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="What are you showing?"
              />
            </div>
          </>
        ) : null}

        {kind === "text" ? (
          <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-primary/30 bg-primary/5 px-4 py-6 text-center transition hover:border-primary/60">
            <Upload className="size-6 text-primary" aria-hidden="true" />
            <span className="mt-2 text-sm font-semibold">{poster ? poster.name : "Add a picture to your post"}</span>
            <span className="mt-1 text-xs text-muted-foreground">A picture is required for every text post.</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              onChange={(e) => setPoster(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : null}

        <div>
          <label htmlFor="caption" className="text-xs font-medium text-muted-foreground">
            {kind === "text" ? "Your post" : "Caption"}
          </label>
          <textarea
            id="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={kind === "text" ? 6 : 3}
            maxLength={1000}
            required={kind === "text"}
            className="mt-1 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder={kind === "text" ? "Say something…" : "Add context"}
          />
        </div>

        {mutation.isPending && progress > 0 ? (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Uploading video…</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="press w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {mutation.isPending ? (kind === "video" ? "Uploading and publishing…" : "Saving and publishing…") : "Publish"}
        </button>
      </form>
    </AppShell>
  );
}

function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const dur = Math.round(el.duration);
      if (!isFinite(dur) || isNaN(dur)) {
        resolve(0);
      } else {
        resolve(dur);
      }
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not inspect video duration metadata"));
    };
    el.src = url;
  });
}
