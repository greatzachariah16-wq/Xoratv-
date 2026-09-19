import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Lock, Film, CheckCircle2 } from "lucide-react";
import { addLocalPost } from "@/lib/api";
import {
  uploadMedia,
  uploadToCloudinary,
  isCloudinaryConfigured,
  resolveMediaUrl,
} from "@/lib/media";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/xora/AppShell";
import { EmptyState } from "@/components/xora/EmptyState";
import { cn } from "@/lib/utils";
import type { Enums } from "@/integrations/firebase/types";

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

type Feed = Enums<"feed_type">;

const MAX_DURATION_SECONDS = 1800; // 30 minutes
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

function CreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<"video" | "text">("video");
  const [feed, setFeed] = useState<Feed>("home");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);

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

        if (isCloudinaryConfigured()) {
          setProgress(5);
          // Upload directly to Cloudinary using unsigned preset
          const uploadRes = await uploadToCloudinary(video, {
            resourceType: "video",
            onProgress: (pct) => setProgress(pct),
          });

          // Delivery URL forces 240p transformation (h_240,c_scale,q_auto:low,f_mp4)
          streamUrl = uploadRes.deliveryUrl240p || uploadRes.playbackUrl;
          mediaPath = uploadRes.publicId || uploadRes.url;
          if (uploadRes.duration) {
            durationSeconds = uploadRes.duration;
          }

          // Optional cover image via Cloudinary
          if (poster) {
            try {
              const posterRes = await uploadToCloudinary(poster, {
                resourceType: "image",
                folder: "xora/posters",
              });
              posterPath = posterRes.url;
            } catch (posterErr) {
              console.warn("[Create] Cloudinary poster upload note:", posterErr);
              posterPath = await uploadMedia("posters", user.id, poster).catch(() => null);
            }
          }
        } else {
          // Fallback to Render upload when Cloudinary credentials are not set
          console.warn(
            "[Create] Cloudinary is not configured. Falling back to ephemeral Render disk upload.",
          );
          mediaPath = await uploadMedia("videos", user.id, video, setProgress);
          streamUrl = resolveMediaUrl("videos", mediaPath);
          if (poster) {
            posterPath = await uploadMedia("posters", user.id, poster).catch(() => null);
          }
        }
      }

      const postId = addLocalPost({
        author_id: user.id,
        kind,
        feed: kind === "text" ? ("home" as const) : feed,
        status: "published" as const,
        approval_status: "approved" as const,
        title: title.trim() || null,
        caption: caption.trim() || null,
        media_path: mediaPath,
        poster_path: posterPath,
        stream_url: streamUrl,
        duration_seconds: durationSeconds,
        featured: false,
        recommendation_score: 90,
        source: "creator",
      });
      return postId;
    },
    onSuccess: (postId) => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["profile-posts"] });
      toast.success("Posted");
      void navigate({ to: "/video/$postId", params: { postId } });
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
            <div>
              <span className="text-xs font-medium text-muted-foreground">Feed</span>
              <div className="mt-1.5 flex gap-2">
                {(["home", "shorts", "learn"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFeed(option)}
                    className={cn(
                      "press rounded-full border px-3 py-1.5 text-xs font-semibold capitalize",
                      feed === option
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center transition hover:border-primary/50">
              <Upload className="size-6 text-muted-foreground" aria-hidden="true" />
              <span className="mt-2 text-sm font-medium">
                {video ? video.name : "Choose a video file"}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                Max 30 minutes · delivered in 240p · max ~100MB
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
          {mutation.isPending ? "Publishing…" : "Publish"}
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
