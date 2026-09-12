import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/media";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/xora/AppShell";
import { EmptyState } from "@/components/xora/EmptyState";
import { cn } from "@/lib/utils";
import type { Enums } from "@/integrations/supabase/types";

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

function CreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<"video" | "text">("video");
  const [feed, setFeed] = useState<Feed>("home");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in first");
      let mediaPath: string | null = null;
      let posterPath: string | null = null;
      let durationSeconds: number | null = null;

      if (kind === "video") {
        if (!video) throw new Error("Choose a video file");
        durationSeconds = await readDuration(video).catch(() => null);
        mediaPath = await uploadMedia("videos", user.id, video, setProgress);
        if (poster) posterPath = await uploadMedia("posters", user.id, poster);
      }

      const { data, error } = await supabase
        .from("posts")
        .insert({
          author_id: user.id,
          kind,
          feed: kind === "text" ? ("home" as const) : feed,
          status: "published" as const,
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(caption.trim() ? { caption: caption.trim() } : {}),
          ...(mediaPath ? { media_path: mediaPath } : {}),
          ...(posterPath ? { poster_path: posterPath } : {}),
          ...(durationSeconds ? { duration_seconds: durationSeconds } : {}),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
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

            <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center">
              <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
              <span className="mt-2 text-sm font-medium">
                {video ? video.name : "Choose a video file"}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">MP4 or WebM</span>
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
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
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
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
      resolve(Math.round(el.duration));
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("metadata"));
    };
    el.src = url;
  });
}
