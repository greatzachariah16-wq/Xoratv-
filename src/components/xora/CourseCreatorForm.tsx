import { useState } from "react";
import { ImagePlus, Loader2, Plus, Upload, Video, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { commerceFetch } from "@/lib/commerce";
import { uploadToCloudinary } from "@/lib/cloudinary";

export function CourseCreatorForm({ onPublished, onCancel }: { onPublished: () => void; onCancel: () => void }) {
  const { user, profile } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Content Creation");
  const [level, setLevel] = useState("Beginner");
  const [unlockPoints, setUnlockPoints] = useState("5000");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoPublicId, setVideoPublicId] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [uploading, setUploading] = useState<"video" | "thumbnail" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);

  async function upload(file: File, type: "video" | "thumbnail") {
    setUploading(type);
    setNotice("");
    try {
      if (type === "video" && !file.type.startsWith("video/")) throw new Error("Choose a video file.");
      if (type === "thumbnail" && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Thumbnail must be JPG, PNG, or WebP.");
      if (type === "thumbnail" && file.size > 8 * 1024 * 1024) throw new Error("Thumbnail must be 8 MB or smaller.");
      const result = await uploadToCloudinary(file, {
        resourceType: type === "video" ? "video" : "image",
        folder: type === "video" ? "xora/courses/videos" : "xora/courses/thumbnails",
        creatorId: user?.id,
        title,
        description,
      });
      if (type === "video") {
        setVideoUrl(result.playbackUrl || result.url);
        setVideoPublicId(result.publicId || "");
      } else setThumbnailUrl(result.url);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Upload failed. Please try again.");
    } finally {
      setUploading(null);
    }
  }

  async function publish() {
    if (!user) { setNotice("Sign in to Xora first."); return; }
    const points = Number(unlockPoints);
    if (!title.trim() || !description.trim() || !videoUrl || !thumbnailUrl) {
      setNotice("Add a title, description, course video, and thumbnail before publishing.");
      return;
    }
    if (!Number.isInteger(points) || points < 1 || points > 1000000) {
      setNotice("Choose an unlock cost between 1 and 1,000,000 Xora Points.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await commerceFetch("/api/commerce/creator/course", {
        method: "POST",
        body: JSON.stringify({
          creatorId: user.id,
          title: title.trim(),
          description: description.trim(),
          category,
          level,
          unlockPoints: points,
          price: 0,
          videoUrl,
          videoPublicId,
          thumbnailUrl,
          creatorDisplayName: profile?.display_name || user.displayName || "Xora Creator",
        }),
      });
      setDone(true);
      setNotice("Your course is published on XoraTV Learn. Learners unlock it with Xora Points earned from eligible CPA participation.");
      onPublished();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not publish course.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="overflow-hidden rounded-[26px] border border-border bg-surface shadow-card">
    <div className="bg-gradient-to-br from-primary/10 via-surface to-accent/10 p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Video className="size-5"/></div>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-primary">X Channel · Creator tools</p><h2 className="mt-1 font-display text-xl font-semibold">Create a course</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Upload your real lesson video and thumbnail, then set the points needed to unlock it.</p></div>
      </div>
    </div>
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block cursor-pointer rounded-2xl border border-dashed border-border bg-background p-4 transition hover:border-primary/50">
          <input type="file" accept="video/*" className="sr-only" disabled={uploading!==null} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file,"video");e.currentTarget.value="";}}/>
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">{uploading==="video"?<Loader2 className="size-5 animate-spin"/>:<Upload className="size-5"/>}</span><span className="min-w-0"><b className="block text-sm">{videoUrl?"Video uploaded ✓":"Upload lesson video"}</b><small className="mt-1 block text-[11px] leading-4 text-muted-foreground">{videoUrl?"Choose again to replace it":"MP4 or another supported video format · uploads go directly to Cloudinary"}</small></span></div>
        </label>
        <label className="block cursor-pointer rounded-2xl border border-dashed border-border bg-background p-4 transition hover:border-primary/50">
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading!==null} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file,"thumbnail");e.currentTarget.value="";}}/>
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-accent/15 text-primary">{uploading==="thumbnail"?<Loader2 className="size-5 animate-spin"/>:<ImagePlus className="size-5"/>}</span><span className="min-w-0"><b className="block text-sm">{thumbnailUrl?"Thumbnail uploaded ✓":"Upload course thumbnail"}</b><small className="mt-1 block text-[11px] leading-4 text-muted-foreground">{thumbnailUrl?"Choose again to replace it":"JPG, PNG or WebP · max 8 MB"}</small></span></div>
        </label>
      </div>
      {thumbnailUrl?<div className="overflow-hidden rounded-2xl border border-border bg-background"><img src={thumbnailUrl} alt="Course thumbnail preview" className="aspect-video max-h-64 w-full object-cover"/><p className="px-3 py-2 text-[11px] text-muted-foreground">This real uploaded thumbnail will appear on the Learn course card.</p></div>:null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">Course title</span><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} placeholder="e.g. Shoot cinematic videos on your phone" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"/></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold">Category</span><select value={category} onChange={e=>setCategory(e.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option>Content Creation</option><option>Business</option><option>Design</option><option>Technology</option><option>Music</option><option>Education</option><option>Personal Development</option></select></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold">Skill level</span><select value={level} onChange={e=>setLevel(e.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option>Beginner</option><option>Intermediate</option><option>Advanced</option><option>All levels</option></select></label>
        <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">What will learners learn?</span><textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={2500} rows={4} placeholder="Describe the skills, outcomes, and lessons included…" className="w-full resize-y rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"/></label>
        <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">Xora Points to unlock</span><input value={unlockPoints} onChange={e=>setUnlockPoints(e.target.value.replace(/\D/g,"").slice(0,7))} inputMode="numeric" type="number" min="1" max="1000000" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"/><small className="mt-1.5 block text-[11px] leading-5 text-muted-foreground">Learners earn points from eligible CPA participation. No cash payment or wallet debit is used to unlock courses.</small></label>
      </div>
      {notice?<div role="status" className="rounded-xl border border-border bg-background p-3 text-xs leading-5">{notice}</div>:null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button onClick={onCancel} className="h-11 rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-muted">Cancel</button>
        <button onClick={()=>void publish()} disabled={busy||uploading!==null||done||!title.trim()||!description.trim()||!videoUrl||!thumbnailUrl} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-card transition hover:brightness-105 disabled:opacity-50">{busy?<Loader2 className="size-4 animate-spin"/>:done?<CheckCircle2 className="size-4"/>:<Plus className="size-4"/>}{busy?"Publishing…":done?"Published":"Publish course"}</button>
      </div>
    </div>
  </section>;
}
