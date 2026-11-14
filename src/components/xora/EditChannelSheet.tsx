import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { z } from "zod";
import { ImagePlus, Loader2, Save, UserRound } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type Channel = {
  id: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
};

export type ChannelUpdate = Pick<Channel, "displayName" | "handle" | "bio" | "avatarUrl" | "bannerUrl">;

const channelSchema = z.object({
  displayName: z.string().trim().min(2, "Use at least 2 characters.").max(40, "Use 40 characters or fewer."),
  handle: z.string().trim().regex(/^[a-z0-9_]{3,20}$/, "Use 3–20 lowercase letters, numbers or underscores."),
  bio: z.string().max(160, "Keep your bio under 160 characters."),
  avatarUrl: z.string().url().or(z.literal("")),
  bannerUrl: z.string().url().or(z.literal("")),
});

type ChannelErrors = Partial<Record<keyof ChannelUpdate, string>>;

type EditChannelSheetProps = {
  open: boolean;
  channel: Channel;
  onOpenChange(open: boolean): void;
  onSave(update: ChannelUpdate): Promise<void>;
};

type ImageField = "avatarUrl" | "bannerUrl";

export function EditChannelSheet({ open, channel, onOpenChange, onSave }: EditChannelSheetProps) {
  const [draft, setDraft] = useState<ChannelUpdate>(() => ({
    displayName: channel.displayName,
    handle: channel.handle,
    bio: channel.bio,
    avatarUrl: channel.avatarUrl,
    bannerUrl: channel.bannerUrl,
  }));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<ImageField | null>(null);
  const [serverError, setServerError] = useState("");

  const errors = useMemo<ChannelErrors>(() => {
    const parsed = channelSchema.safeParse(draft);
    if (parsed.success) return {};
    return parsed.error.issues.reduce<ChannelErrors>((result, issue) => {
      const key = issue.path[0] as keyof ChannelUpdate;
      result[key] = issue.message;
      return result;
    }, {});
  }, [draft]);
  const changed = (Object.keys(draft) as Array<keyof ChannelUpdate>).some((key) => draft[key] !== channel[key] );
  const valid = Object.keys(errors).length === 0;

  function update<K extends keyof ChannelUpdate>(key: K, value: ChannelUpdate[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setServerError("");
  }

  async function uploadImage(field: ImageField, file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setServerError("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setServerError("Images must be 5MB or smaller.");
      return;
    }
    setUploading(field);
    setServerError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("bucket", field === "avatarUrl" ? "avatars" : "channel-featured");
      form.append("userId", channel.id);
      const response = await fetch("/api/upload", { method: "POST", body: form, credentials: "same-origin" });
      const result = await response.json() as { ok?: boolean; url?: string; error?: string };
      if (!response.ok || !result.ok || !result.url) throw new Error(result.error || "Image upload failed.");
      update(field, result.url);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setUploading(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = channelSchema.safeParse(draft);
    if (!parsed.success || !changed || busy || uploading) return;
    setBusy(true);
    setServerError("");
    try {
      await onSave(parsed.data);
      onOpenChange(false);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Could not save your channel.");
    } finally {
      setBusy(false);
    }
  }

  function handleFile(field: ImageField, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) void uploadImage(field, file);
    event.currentTarget.value = "";
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-[28px] border-border bg-surface p-5 text-foreground sm:mx-auto sm:max-w-xl sm:rounded-[28px]">
        <SheetHeader className="pr-10 text-left">
          <SheetTitle className="font-display text-xl">Edit your channel</SheetTitle>
          <SheetDescription>Update how viewers discover and recognise your X Channel.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <ImagePicker label="Profile photo" value={draft.avatarUrl} fallback={<UserRound className="size-6"/>} busy={uploading === "avatarUrl"} onChange={(event) => handleFile("avatarUrl", event)} />
            <ImagePicker label="Channel banner" value={draft.bannerUrl} fallback={<ImagePlus className="size-6"/>} busy={uploading === "bannerUrl"} onChange={(event) => handleFile("bannerUrl", event)} />
          </div>
          <Field label="Display name" error={errors.displayName}>
            <input value={draft.displayName} onChange={(event) => update("displayName", event.target.value)} minLength={2} maxLength={40} className="channel-edit-input" autoComplete="name" />
          </Field>
          <Field label="Handle" error={errors.handle}>
            <div className="flex h-12 items-center rounded-xl border border-border bg-background px-3">
              <span className="text-sm text-muted-foreground">@</span>
              <input value={draft.handle} onChange={(event) => update("handle", event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} minLength={3} maxLength={20} className="h-full min-w-0 flex-1 bg-transparent pl-1 text-sm outline-none" autoCapitalize="none" autoComplete="off" spellCheck={false}/>
            </div>
          </Field>
          <Field label="Bio" error={errors.bio}>
            <textarea value={draft.bio} onChange={(event) => update("bio", event.target.value)} maxLength={160} rows={3} className="channel-edit-input min-h-24 resize-none py-3" />
            <p className="mt-1 text-right text-xs text-muted-foreground">{draft.bio.length}/160</p>
          </Field>
          {serverError ? <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{serverError}</p> : null}
          <SheetFooter className="flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row">
            <SheetClose asChild><button type="button" className="min-h-11 rounded-xl border border-border px-5 text-sm font-semibold">Cancel</button></SheetClose>
            <button type="submit" disabled={!valid || !changed || busy || Boolean(uploading)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45">
              {busy ? <Loader2 className="size-4 animate-spin"/> : <Save className="size-4"/>}{busy ? "Saving…" : "Save changes"}
            </button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold">{label}{children}{error ? <span role="alert" className="mt-1 block text-xs font-medium text-destructive">{error}</span> : null}</label>;
}

function ImagePicker({ label, value, fallback, busy, onChange }: { label: string; value: string; fallback: React.ReactNode; busy: boolean; onChange(event: ChangeEvent<HTMLInputElement>): void }) {
  return <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-border bg-background p-3 text-center text-xs font-semibold text-muted-foreground">
    {value ? <img src={value} alt="" className="size-12 rounded-xl object-cover"/> : <span className="grid size-12 place-items-center rounded-xl bg-secondary text-primary">{fallback}</span>}
    <span className="inline-flex items-center gap-1.5">{busy ? <Loader2 className="size-3.5 animate-spin"/> : <ImagePlus className="size-3.5"/>}{busy ? "Uploading…" : label}</span>
    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={onChange}/>
  </label>;
}
