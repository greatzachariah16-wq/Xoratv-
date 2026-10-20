import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Check, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/xora/AppShell";
import { useAuth } from "@/hooks/useAuth";
import type { ProfileRecord } from "@/integrations/firebase/types";

export const Route = createFileRoute("/edit-profile")({
  head: () => ({ meta: [{ title: "Edit profile — XoraTV" }, { name: "description", content: "Personalise your XoraTV profile." }] }),
  component: EditProfilePage,
});

const AVATAR_STYLES = ["adventurer", "avataaars", "bottts", "lorelei", "micah", "notionists"] as const;
type AvatarStyle = (typeof AVATAR_STYLES)[number];
function avatarFor(style: AvatarStyle, seed: string) {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed || "xora-member")}`;
}
type ProfileResponse = { ok?: boolean; profile?: ProfileRecord; error?: string };

function EditProfilePage() {
  const { user, profile: authProfile, loading } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id;
  const profileUsername = authProfile?.username || "";
  const [profile, setProfileState] = useState<ProfileRecord | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [about, setAbout] = useState("");
  const [creating, setCreating] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>("adventurer");
  const [avatarSeed, setAvatarSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    let active = true;
    if (loading) return () => { active = false; };
    if (!userId) { setLoadingProfile(false); return () => { active = false; }; }
    setLoadingProfile(true);
    const load = async () => {
      try {
        const response = await fetch(`/api/profile?username=${encodeURIComponent(profileUsername)}`, {
          credentials: "same-origin", cache: "no-store",
        });
        const result = await response.json().catch(() => null) as ProfileResponse | null;
        if (!response.ok || !result?.ok || !result.profile) throw new Error(result?.error || "Could not load your profile.");
        if (!active) return;
        const current = result.profile;
        setProfileState(current);
        setDisplayName(current.display_name || "");
        const lines = (current.bio || "").split("\n");
        setAbout(lines.find(line => line.startsWith("About: "))?.slice(7) || (lines[0] && !lines[0].startsWith("Creating: ") ? lines[0] : ""));
        setCreating(lines.find(line => line.startsWith("Creating: "))?.slice(10) || "");
        setLocation(current.location || "");
        setWebsite(current.website || "");
        const url = current.avatar_url || "";
        const matched = AVATAR_STYLES.find(style => url.includes(`/${style}/svg`));
        if (matched) {
          setAvatarStyle(matched);
          try { setAvatarSeed(new URL(url).searchParams.get("seed") || current.username); }
          catch { setAvatarSeed(current.username); }
        } else setAvatarSeed(current.username);
      } catch (error) {
        if (!active) return;
        const fallback = authProfile;
        if (fallback) {
          setProfileState(fallback);
          setDisplayName(fallback.display_name || "");
          setAvatarSeed(fallback.username);
          setLocation(fallback.location || "");
          setWebsite(fallback.website || "");
          const lines = (fallback.bio || "").split("\n");
          setAbout(lines.find(line => line.startsWith("About: "))?.slice(7) || "");
          setCreating(lines.find(line => line.startsWith("Creating: "))?.slice(10) || "");
        } else {
          toast.error(error instanceof Error ? error.message : "Could not load your profile.");
        }
      } finally {
        if (active) setLoadingProfile(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [userId, profileUsername, loading]);

  if (!loading && !user) {
    return <AppShell wide><div className="mx-auto mt-10 max-w-xl rounded-3xl border border-border bg-surface p-7 text-center shadow-card"><h1 className="font-display text-2xl font-semibold">Sign in to edit your profile</h1><p className="mt-2 text-sm text-muted-foreground">Your profile settings are available after you sign in.</p><Link to="/auth" className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Sign in</Link></div></AppShell>;
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !profile || busy) return;
    const cleanName = displayName.trim();
    if (!cleanName) { toast.error("Please enter a display name."); return; }
    const cleanAbout = about.trim();
    const cleanCreating = creating.trim();
    setBusy(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: cleanName,
          avatar_url: avatarFor(avatarStyle, avatarSeed.trim() || profile.username),
          bio: [cleanAbout ? `About: ${cleanAbout}` : "", cleanCreating ? `Creating: ${cleanCreating}` : ""].filter(Boolean).join("\n"),
          location: location.trim(), website: website.trim(),
        }),
      });
      const result = await response.json().catch(() => null) as ProfileResponse | null;
      if (!response.ok || !result?.ok || !result.profile) {
        throw new Error(result?.error || "Could not save your profile. Please try again.");
      }
      setProfileState(result.profile);
      window.dispatchEvent(new CustomEvent("xora-auth-changed"));
      window.dispatchEvent(new CustomEvent("xora:profile-updated", { detail: result.profile }));
      toast.success("Your profile has been updated.");
      await navigate({ to: "/profile/$username", params: { username: result.profile.username } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your profile. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const preview = avatarFor(avatarStyle, avatarSeed.trim() || profile?.username || "xora-member");

  return <AppShell wide><main className="mx-auto max-w-3xl pb-12 pt-4 sm:pt-7">
    <Link to={profile ? "/profile/$username" : "/"} params={profile ? { username: profile.username } : undefined as never} className="mb-5 inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"><ArrowLeft className="size-4" /> Back to profile</Link>
    <header className="mb-6"><div className="mb-3 grid size-12 place-items-center rounded-2xl bg-accent text-primary"><Sparkles className="size-6" /></div><h1 className="font-display text-3xl font-semibold tracking-tight">Make your profile yours</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Choose your avatar and tell the XoraTV community what you’re about and what you’re creating. These descriptions are yours to write.</p></header>
    {loading || loadingProfile ? <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground"><LoaderCircle className="mx-auto mb-2 size-5 animate-spin" />Loading your profile…</div> : !profile ? <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">We couldn’t load your profile. Please refresh and try again.</div> : <form onSubmit={save} className="space-y-5">
      <section className="rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-6"><div className="flex items-center gap-3"><img src={preview} alt="Avatar preview" className="size-20 rounded-3xl border border-border bg-accent object-cover"/><div><h2 className="font-display text-lg font-semibold">Your avatar</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Pick an illustration style and personalise it with a name or word.</p></div></div>
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">{AVATAR_STYLES.map(style => <button key={style} type="button" onClick={() => setAvatarStyle(style)} className={`rounded-2xl border p-2 text-center transition ${avatarStyle === style ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-secondary/60"}`} aria-pressed={avatarStyle === style}><img src={avatarFor(style, avatarSeed.trim() || profile.username)} alt={`${style} avatar style`} className="mx-auto size-14 rounded-xl" loading="lazy"/><span className="mt-1 block text-[10px] font-semibold capitalize">{style}</span></button>)}</div>
        <label className="mt-4 block text-sm font-medium" htmlFor="avatar-seed">Personalise your avatar</label><input id="avatar-seed" value={avatarSeed} onChange={e => setAvatarSeed(e.target.value)} maxLength={48} placeholder="Your name, nickname or any word" className="mt-2 w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none transition focus:ring-2 focus:ring-primary/25"/>
      </section>
      <section className="rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-6"><h2 className="font-display text-lg font-semibold">Your details</h2><label htmlFor="display-name" className="mt-4 block text-sm font-medium">Display name</label><input id="display-name" value={displayName} onChange={e => setDisplayName(e.target.value)} required maxLength={60} className="mt-2 w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/25"/>
        <label htmlFor="about" className="mt-4 block text-sm font-medium">What are you about?</label><textarea id="about" value={about} onChange={e => setAbout(e.target.value)} rows={3} maxLength={280} placeholder="Share your interests, perspective or the things you love…" className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/25"/>
        <label htmlFor="creating" className="mt-4 block text-sm font-medium">What are you creating?</label><textarea id="creating" value={creating} onChange={e => setCreating(e.target.value)} rows={3} maxLength={280} placeholder="Tell people what you make, collect, teach or share…" className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/25"/>
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label htmlFor="location" className="block text-sm font-medium">Location <span className="font-normal text-muted-foreground">(optional)</span></label><input id="location" value={location} onChange={e => setLocation(e.target.value)} maxLength={80} placeholder="City or region" className="mt-2 w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/25"/></div><div><label htmlFor="website" className="block text-sm font-medium">Website <span className="font-normal text-muted-foreground">(optional)</span></label><input id="website" type="url" value={website} onChange={e => setWebsite(e.target.value)} maxLength={200} placeholder="https://…" className="mt-2 w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/25"/></div></div>
      </section>
      <button type="submit" disabled={busy || loadingProfile || !profile} className="sticky bottom-3 z-10 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60 sm:static sm:w-auto">{busy ? <LoaderCircle className="size-4 animate-spin"/> : <Check className="size-4"/>}{busy ? "Saving profile…" : "Save profile"}</button>
    </form>}
  </main></AppShell>;
}
