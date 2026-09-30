import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ImagePlus, Loader2, PlayCircle, Plus, Sparkles, Upload, Video } from "lucide-react";
import { AppShell, FeedTabs } from "@/components/xora/AppShell";
import { FeedList } from "@/components/xora/FeedList";
import { TrendingRail } from "@/components/xora/TrendingRail";
import { XoraInHouseAd } from "@/components/ads/XoraInHouseAd";
import { ContentLockGate } from "@/components/commerce/ContentLockGate";
import { commerceFetch, coursesMarketQuery, purchasedCoursesQuery, walletQuery, type Course } from "@/lib/commerce";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/learn")({ component: Learn });

function Learn() {
  const { user, profile } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("500");
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [uploading, setUploading] = useState<"video" | "thumbnail" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [purchased, setPurchased] = useState<string[]>([]);
  const { data, refetch } = useQuery(coursesMarketQuery());
  const wallet = useQuery(walletQuery(user?.id));
  const purchasedQuery = useQuery(purchasedCoursesQuery(user?.id));
  const ref = typeof window !== "undefined"
    ? (new URLSearchParams(window.location.search).get("promo") ||
      new URLSearchParams(window.location.search).get("ref"))
    : null;
  const promotionTarget = useQuery({
    queryKey: ["commerce", "promotion-target", ref],
    enabled: Boolean(ref),
    queryFn: async () => {
      const response = await commerceFetch<any>(`/api/commerce/promotion-target?token=${encodeURIComponent(ref || "")}`);
      return response.target;
    },
  });

  const courses = useMemo(() => {
    const all = data?.courses || [];
    const target = promotionTarget.data?.course;
    return target ? all.filter((course) => course.id === target.id) : all;
  }, [data, promotionTarget.data]);
  const purchasedIds = useMemo(() => new Set([...(purchasedQuery.data?.courseIds || []), ...purchased]), [purchasedQuery.data, purchased]);

  async function upload(file: File, type: "video" | "thumbnail") {
    setUploading(type);
    setNotice("");
    try {
      const result = await uploadToCloudinary(file, {
        resourceType: type === "video" ? "video" : "image",
        folder: type === "video" ? "xora/courses/videos" : "xora/courses/thumbnails",
      });
      if (type === "video") setVideoUrl(result.playbackUrl || result.url);
      else setThumbnailUrl(result.url);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  }

  async function createCourse() {
    if (!user) { window.location.href = "/auth"; return; }
    if (!videoUrl || !thumbnailUrl) {
      setNotice("Upload both the course video and thumbnail before publishing.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const reg = await commerceFetch<any>("/api/commerce/creator/register", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          displayName: profile?.display_name || user.displayName || "Creator",
          username: profile?.username || user.email?.split("@")[0] || user.id.slice(0, 8),
        }),
      });
      await commerceFetch("/api/commerce/creator/course", {
        method: "POST",
        body: JSON.stringify({
          creatorId: reg.creator.id,
          title,
          description,
          price: Number(price),
          videoUrl,
          thumbnailUrl,
        }),
      });
      setShowCreate(false);
      setTitle("");
      setDescription("");
      setPrice("500");
      setVideoUrl("");
      setThumbnailUrl("");
      await refetch();
      setNotice("Course published with its video and thumbnail.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not publish course.");
    } finally {
      setBusy(false);
    }
  }

  async function buyCourse(course: Course) {
    if (!user) { window.location.href = "/auth"; return; }
    setNotice("");
    try {
      const result = await commerceFetch<any>("/api/commerce/course/order", {
        method: "POST",
        body: JSON.stringify({ userId: user.id, courseId: course.id, referralCode: ref }),
      });
      setPurchased((items) => items.includes(course.id) ? items : [...items, course.id]);
      await wallet.refetch();
      setNotice(`₦${Number(course.price).toLocaleString()} was debited from your Xora Wallet.`);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not purchase course.";
      if (/insufficient wallet balance/i.test(message)) {
        window.location.href = `/wallet?returnTo=/learn&course=${encodeURIComponent(course.id)}`;
        return;
      }
      setNotice(message);
    }
  }

  return (
    <AppShell rail={<TrendingRail />} wide>
      <div className="min-w-0 space-y-5 sm:space-y-6">
        <header className="rounded-[24px] border border-border bg-surface p-4 shadow-card sm:rounded-[30px] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="size-5" />
                <span className="text-sm font-semibold">Xora Learn</span>
              </div>
              <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Learn something useful.</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Video courses from Xora creators. Paid courses are handled through your Xora Wallet.
              </p>
            </div>
            {user ? (
              <button
                onClick={() => setShowCreate((v) => !v)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                <Plus className="size-4" /> Create a course
              </button>
            ) : null}
          </div>
        </header>

        {notice ? <div className="rounded-2xl border border-border bg-surface p-4 text-sm">{notice}</div> : null}

        {showCreate ? (
          <section className="rounded-3xl border border-border bg-surface p-5 shadow-card">
            <div className="flex items-center gap-2">
              <Video className="size-5 text-primary" />
              <div>
                <h2 className="font-display text-xl font-semibold">Create a video course</h2>
                <p className="text-sm text-muted-foreground">Upload the lesson video and thumbnail first, then add the course details.</p>
              </div>
            </div>

            <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
              <label className="rounded-2xl border border-dashed border-border bg-background p-5 cursor-pointer">
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, "video"); }}
                />
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                    {uploading === "video" ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                  </div>
                  <div>
                    <p className="font-semibold">Course video</p>
                    <p className="text-xs text-muted-foreground">{videoUrl ? "Video uploaded ✓" : "Choose the course video"}</p>
                  </div>
                </div>
              </label>

              <label className="rounded-2xl border border-dashed border-border bg-background p-5 cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, "thumbnail"); }}
                />
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                    {uploading === "thumbnail" ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                  </div>
                  <div>
                    <p className="font-semibold">Video thumbnail</p>
                    <p className="text-xs text-muted-foreground">{thumbnailUrl ? "Thumbnail uploaded ✓" : "Choose the course thumbnail"}</p>
                  </div>
                </div>
              </label>
            </div>

            {thumbnailUrl ? <img src={thumbnailUrl} alt="Course thumbnail preview" className="mt-4 aspect-video max-h-72 w-full rounded-2xl object-cover" /> : null}

            <div className="mt-5 grid gap-3">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course title" className="rounded-xl border border-input bg-background px-3 py-3 text-sm" />
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will students learn?" rows={5} className="rounded-xl border border-input bg-background px-3 py-3 text-sm" />
              <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" placeholder="Price in NGN" className="rounded-xl border border-input bg-background px-3 py-3 text-sm" />
              <button onClick={() => void createCourse()} disabled={busy || uploading !== null || !title || !description || !videoUrl || !thumbnailUrl} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {busy ? "Publishing…" : "Publish video course"}
              </button>
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-3 flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <h2 className="font-display text-xl font-semibold">Courses marketplace</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {courses.map((course) => {
              const owned = purchasedIds.has(course.id);
              return (
                <article key={course.id} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
                  <div className="aspect-video bg-secondary">
                    {course.thumbnailUrl ? <img src={course.thumbnailUrl} alt="" className="size-full object-cover" /> : null}
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Video course</p>
                    <h3 className="mt-2 font-display text-xl font-semibold">{course.title}</h3>
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{course.description}</p>

                    <ContentLockGate enabled={course.contentLockEnabled === true} unlocked={owned}>
                      {owned && course.videoUrl ? (
                        <div className="mt-4 overflow-hidden rounded-2xl bg-black">
                          <video controls playsInline poster={course.thumbnailUrl || undefined} className="aspect-video w-full" src={course.videoUrl} />
                        </div>
                      ) : null}
                    </ContentLockGate>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="text-lg font-semibold">₦{Number(course.price || 0).toLocaleString()}</span>
                      {owned ? (
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700">
                          <PlayCircle className="size-4" /> Purchased
                        </span>
                      ) : (
                        <button
                          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                          onClick={() => void buyCourse(course)}
                        >
                          Buy with Wallet
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
            {!courses.length ? <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No courses have been published yet.</div> : null}
          </div>
        </section>

        <div>
          <FeedTabs active="learn" />
          <XoraInHouseAd placement="learn_feed" variant="banner" className="mb-4 mt-2" />
          <FeedList feed="learn" />
        </div>
      </div>
    </AppShell>
  );
}
