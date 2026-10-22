import { useState } from "react";
import { ImagePlus, Loader2, Plus, Upload, Video, CheckCircle2, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { commerceFetch } from "@/lib/commerce";
import { uploadToCloudinary } from "@/lib/cloudinary";

type LessonDraft = { key: string; title: string; videoUrl: string; videoPublicId: string };
const newLesson = (number: number): LessonDraft => ({ key: `lesson-${Date.now()}-${number}`, title: `Lesson ${number}`, videoUrl: "", videoPublicId: "" });

export function CourseCreatorForm({ onPublished, onCancel }: { onPublished: () => void; onCancel: () => void }) {
  const { user, profile } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Content Creation");
  const [level, setLevel] = useState("Beginner");
  const [unlockPoints, setUnlockPoints] = useState("5000");
  const [lessons, setLessons] = useState<LessonDraft[]>([newLesson(1)]);
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);

  async function uploadLesson(file: File, lessonKey: string) {
    setUploading(lessonKey); setNotice("");
    try {
      if (!file.type.startsWith("video/")) throw new Error("Choose a video file.");
      const lesson = lessons.find(item => item.key === lessonKey);
      const result = await uploadToCloudinary(file, {
        resourceType: "video", folder: "xora/courses/videos", creatorId: user?.id,
        title: title || lesson?.title || "Course lesson", description,
      });
      setLessons(current => current.map(item => item.key === lessonKey ? { ...item, videoUrl: result.playbackUrl || result.url, videoPublicId: result.publicId || "" } : item));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Lesson upload failed. Please try again."); }
    finally { setUploading(null); }
  }

  async function uploadThumbnail(file: File) {
    setUploading("thumbnail"); setNotice("");
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Thumbnail must be JPG, PNG, or WebP.");
      if (file.size > 8 * 1024 * 1024) throw new Error("Thumbnail must be 8 MB or smaller.");
      const result = await uploadToCloudinary(file, { resourceType: "image", folder: "xora/courses/thumbnails", creatorId: user?.id, title, description });
      setThumbnailUrl(result.url);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Thumbnail upload failed. Please try again."); }
    finally { setUploading(null); }
  }

  async function publish() {
    if (!user) { setNotice("Sign in to Xora first."); return; }
    const points = Number(unlockPoints);
    const cleanLessons = lessons.map((lesson, index) => ({ title: lesson.title.trim(), videoUrl: lesson.videoUrl, videoPublicId: lesson.videoPublicId, order: index + 1 }));
    if (!title.trim() || !description.trim() || description.trim().length > 500 || !thumbnailUrl || !cleanLessons.length || cleanLessons.some(lesson => !lesson.title || !lesson.videoUrl)) {
      setNotice("Add a course title, short description (up to 500 characters), required thumbnail, and a title plus uploaded video for every lesson."); return;
    }
    if (!Number.isInteger(points) || points < 1 || points > 1000000) { setNotice("Choose an unlock cost between 1 and 1,000,000 Xora Points."); return; }
    setBusy(true); setNotice("");
    try {
      await commerceFetch("/api/commerce/creator/course", {
        method: "POST",
        body: JSON.stringify({
          creatorId: user.id, title: title.trim(), description: description.trim(), category, level,
          unlockPoints: points, price: 0, lessons: cleanLessons,
          videoUrl: cleanLessons[0]?.videoUrl || null, videoPublicId: cleanLessons[0]?.videoPublicId || null,
          thumbnailUrl, creatorDisplayName: profile?.display_name || user.displayName || "Xora Creator",
        }),
      });
      setDone(true);
      setNotice("Your course is published on XoraTV Learn. Learners unlock all lessons with Xora Points earned from eligible CPA participation.");
      onPublished();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not publish course."); }
    finally { setBusy(false); }
  }

  return <section className="overflow-hidden rounded-[26px] border border-border bg-surface shadow-card">
    <div className="bg-gradient-to-br from-primary/10 via-surface to-accent/10 p-5 sm:p-6"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Video className="size-5"/></div><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-primary">X Channel · Creator tools</p><h2 className="mt-1 font-display text-xl font-semibold">Create a course</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">One course, multiple video lessons, and a required course thumbnail.</p></div></div></div>
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block cursor-pointer rounded-2xl border border-dashed border-border bg-background p-4 transition hover:border-primary/50"><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading!==null} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadThumbnail(file);e.currentTarget.value="";}}/><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-accent/15 text-primary">{uploading==="thumbnail"?<Loader2 className="size-5 animate-spin"/>:<ImagePlus className="size-5"/>}</span><span className="min-w-0"><b className="block text-sm">{thumbnailUrl?"Thumbnail uploaded ✓":"Upload required course thumbnail *"}</b><small className="mt-1 block text-[11px] leading-4 text-muted-foreground">JPG, PNG or WebP · max 8 MB</small></span></div></label>
        <div className="flex items-center rounded-2xl border border-border bg-background p-4"><div><b className="block text-sm">Course thumbnail</b><small className="mt-1 block text-[11px] leading-4 text-muted-foreground">Required before publishing. Shown on Learn course cards.</small></div></div>
      </div>
      {thumbnailUrl?<div className="overflow-hidden rounded-2xl border border-border bg-background"><img src={thumbnailUrl} alt="Course thumbnail preview" className="aspect-video max-h-64 w-full object-cover"/><p className="px-3 py-2 text-[11px] text-muted-foreground">Uploaded thumbnail preview</p></div>:null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">Course title</span><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} placeholder="e.g. Shoot cinematic videos on your phone" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"/></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold">Category</span><select value={category} onChange={e=>setCategory(e.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option>Content Creation</option><option>Business</option><option>Design</option><option>Technology</option><option>Music</option><option>Education</option><option>Personal Development</option></select></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold">Skill level</span><select value={level} onChange={e=>setLevel(e.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option>Beginner</option><option>Intermediate</option><option>Advanced</option><option>All levels</option></select></label>
        <label className="block sm:col-span-2"><span className="mb-1.5 flex items-center justify-between text-xs font-semibold"><span>Short course description</span><span className="font-normal text-muted-foreground">{description.length}/500</span></span><textarea value={description} onChange={e=>setDescription(e.target.value.slice(0,500))} maxLength={500} rows={3} placeholder="Briefly explain what learners will gain from this course…" className="w-full resize-y rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"/></label>
      </div>
      <section className="space-y-3 rounded-2xl border border-border bg-background p-3 sm:p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold">Course lessons</h3><p className="mt-1 text-[11px] text-muted-foreground">Upload a separate video for each lesson. Learners unlock the whole course once.</p></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">{lessons.length} {lessons.length===1?"lesson":"lessons"}</span></div>
        {lessons.map((lesson,index)=><div key={lesson.key} className="space-y-2 rounded-xl border border-border bg-surface p-3"><div className="flex items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">{index+1}</span><input aria-label={`Lesson ${index+1} title`} value={lesson.title} maxLength={120} onChange={e=>setLessons(current=>current.map(item=>item.key===lesson.key?{...item,title:e.target.value}:item))} placeholder={`Lesson ${index+1} title`} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-primary/20"/><button type="button" disabled={lessons.length===1||uploading===lesson.key} onClick={()=>setLessons(current=>current.filter(item=>item.key!==lesson.key))} aria-label={`Remove lesson ${index+1}`} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"><Trash2 className="size-4"/></button></div><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-background p-3 hover:border-primary/50"><input type="file" accept="video/*" className="sr-only" disabled={uploading!==null} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadLesson(file,lesson.key);e.currentTarget.value="";}}/><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{uploading===lesson.key?<Loader2 className="size-4 animate-spin"/>:<Upload className="size-4"/>}</span><span className="min-w-0 flex-1"><b className="block text-xs">{lesson.videoUrl?"Lesson video uploaded ✓":"Upload lesson video *"}</b><small className="mt-1 block text-[10px] leading-4 text-muted-foreground">{lesson.videoUrl?"Tap to replace video":"MP4 or another supported video · Cloudinary"}</small></span></label></div>)}
        <button type="button" disabled={uploading!==null||lessons.length>=50} onClick={()=>setLessons(current=>[...current,newLesson(current.length+1)])} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 text-xs font-semibold text-primary transition hover:bg-primary/5 disabled:opacity-50"><Plus className="size-4"/>Add another lesson</button>
      </section>
      <label className="block"><span className="mb-1.5 block text-xs font-semibold">Xora Points to unlock</span><input value={unlockPoints} onChange={e=>setUnlockPoints(e.target.value.replace(/\D/g,"").slice(0,7))} inputMode="numeric" type="number" min="1" max="1000000" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"/><small className="mt-1.5 block text-[11px] leading-5 text-muted-foreground">Learners earn points from eligible CPA participation. No cash payment or wallet debit is used to unlock courses.</small></label>
      {notice?<div role="status" className="rounded-xl border border-border bg-background p-3 text-xs leading-5">{notice}</div>:null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={onCancel} className="h-11 rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-muted">Cancel</button><button onClick={()=>void publish()} disabled={busy||uploading!==null||done||!title.trim()||!description.trim()||!thumbnailUrl||lessons.some(item=>!item.title.trim()||!item.videoUrl)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-card transition hover:brightness-105 disabled:opacity-50">{busy?<Loader2 className="size-4 animate-spin"/>:done?<CheckCircle2 className="size-4"/>:<Plus className="size-4"/>}{busy?"Publishing…":done?"Published":"Publish course"}</button></div>
    </div>
  </section>;
}
