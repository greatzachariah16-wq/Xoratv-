import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, BadgeCheck, CheckCircle2, Clapperboard, Facebook, Instagram, ShieldCheck, Sparkles, Youtube, Video, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/creator-application")({ component: CreatorApplicationPage });

type Platform = "Facebook" | "TikTok" | "YouTube";
type Social = { url: string; audience: string };
const initialSocials: Record<Platform, Social> = {
  Facebook: { url: "", audience: "" }, TikTok: { url: "", audience: "" }, YouTube: { url: "", audience: "" },
};
const platformIcons = { Facebook, TikTok: Instagram, YouTube: Youtube };
const categories = ["Entertainment", "Education & tutorials", "Music", "Comedy", "Lifestyle", "News & commentary", "Technology", "Gaming", "Film & storytelling", "Other"];

function CreatorApplicationPage() {
  const [form, setForm] = useState({ fullName: "", email: "", username: "", channelName: "", country: "Nigeria", category: "Entertainment", about: "", sampleUrl: "", accepted: false });
  const [socials, setSocials] = useState<Record<Platform, Social>>(initialSocials);
  const [selected, setSelected] = useState<Platform[]>(["TikTok"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const eligible = useMemo(() => selected.some((platform) => Number(socials[platform].audience) >= 50 && /^https?:\/\//i.test(socials[platform].url)), [selected, socials]);
  const update = (key: keyof typeof form, value: string | boolean) => setForm(old => ({ ...old, [key]: value }));
  const togglePlatform = (platform: Platform) => setSelected(old => old.includes(platform) ? old.filter(p => p !== platform) : [...old, platform]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!eligible) { setError("Add a public profile link and at least 50 followers/subscribers on Facebook, TikTok or YouTube."); return; }
    if (!form.accepted) { setError("Please confirm your details are accurate and accept the creator guidelines."); return; }
    setBusy(true);
    try {
      const backend = (import.meta as any).env?.VITE_RENDER_BACKEND_URL?.replace(/\/$/, "") || "";
      const response = await fetch(`${backend}/api/creator-applications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, socials: Object.fromEntries(selected.map(platform => [platform, socials[platform]])), source: "preview-lab" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || "We couldn't submit your application. Please try again.");
      setSuccess(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Submission failed. Please try again."); }
    finally { setBusy(false); }
  }

  const reset = () => { setSuccess(false); setForm({ fullName:"", email:"", username:"", channelName:"", country:"Nigeria", category:"Entertainment", about:"", sampleUrl:"", accepted:false }); setSocials(initialSocials); setSelected(["TikTok"]); };

  if (success) return <main className="min-h-screen bg-background px-4 py-12 text-foreground"><section className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-card sm:p-12"><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary"><CheckCircle2 size={32}/></div><p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-primary">Application received</p><h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Your next chapter starts here.</h1><p className="mt-4 text-sm leading-7 text-muted-foreground">Thanks for applying to XoraTV. Our team will manually review your details. An application does not automatically activate creator privileges.</p><button onClick={reset} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Submit another application <ArrowRight size={16}/></button></section></main>;

  return <main className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border/70 bg-card/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <a href="/" className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Clapperboard size={19}/></span><span><span className="block font-display text-lg font-bold tracking-tight">XoraTV</span><span className="block text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Creator network</span></span></a>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><span className="size-1.5 rounded-full bg-primary"/> Preview application</span>
      </div>
    </header>

    <section className="mx-auto grid max-w-6xl gap-8 px-4 py-7 sm:px-8 sm:py-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-12">
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary"><Sparkles size={14}/> For creators with a story to tell</div>
        <h1 className="mt-5 max-w-xl font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">Your creativity.<br/><span className="text-primary">Your own channel.</span></h1>
        <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground">Bring your videos, lessons, music and ideas to XoraTV. Tell us what you create and where people can discover your work.</p>
        <div className="mt-7 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border p-4"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Video size={19}/></span><div><p className="text-sm font-semibold">A simple application</p><p className="mt-1 text-xs text-muted-foreground">Three quick steps to get started</p></div></div>
          {[
            ["01","Tell us about yourself","Your name, channel and the content you make."],
            ["02","Connect a public profile","At least 50 followers or subscribers on one supported platform."],
            ["03","Wait for a human review","Our team checks applications before any creator access is granted."],
          ].map(([n,title,desc],i)=><div key={n} className={`flex gap-3 p-4 ${i<2?"border-b border-border":""}`}><span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-xs font-bold text-primary">{n}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{desc}</p></div></div>)}
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary"/> Your application is reviewed manually. Please use genuine details and links to public profiles.</div>
      </aside>

      <form onSubmit={submit} className="overflow-hidden rounded-2xl border border-border bg-card shadow-card sm:rounded-3xl">
        <div className="border-b border-border bg-muted/35 px-5 py-6 sm:px-8">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Creator application · 01 / 03</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Let's meet the creator.</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Fill in the details below. Fields marked with * are required.</p>
          <div className="mt-5 flex gap-1.5" aria-hidden="true"><span className="h-1 flex-1 rounded-full bg-primary"/><span className="h-1 flex-1 rounded-full bg-primary/25"/><span className="h-1 flex-1 rounded-full bg-primary/25"/></div>
        </div>
        <div className="space-y-8 p-5 sm:p-8">
          <section><SectionTitle number="01" title="Your details" subtitle="How can we reach you?"/>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Full name *"><input required autoComplete="name" value={form.fullName} onChange={e=>update("fullName",e.target.value)} placeholder="Your full name"/></Field>
              <Field label="Email address *"><input required type="email" autoComplete="email" value={form.email} onChange={e=>update("email",e.target.value)} placeholder="you@example.com"/></Field>
              <Field label="XoraTV username" hint="Optional"><input value={form.username} onChange={e=>update("username",e.target.value)} placeholder="@yourhandle"/></Field>
              <Field label="Creator / channel name *"><input required value={form.channelName} onChange={e=>update("channelName",e.target.value)} placeholder="Your channel name"/></Field>
              <Field label="Country *"><input required value={form.country} onChange={e=>update("country",e.target.value)} placeholder="Your country"/></Field>
              <Field label="Content category *"><select value={form.category} onChange={e=>update("category",e.target.value)}>{categories.map(x=><option key={x}>{x}</option>)}</select></Field>
            </div>
          </section>

          <section className="border-t border-border pt-7"><SectionTitle number="02" title="Your audience" subtitle="Choose the platforms you want us to review."/><div className="mt-4 flex flex-wrap gap-2">{(["Facebook","TikTok","YouTube"] as Platform[]).map(platform=>{const Icon=platformIcons[platform];const active=selected.includes(platform);return <button type="button" key={platform} onClick={()=>togglePlatform(platform)} aria-pressed={active} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${active?"border-primary bg-primary/10 text-primary":"border-border bg-background text-muted-foreground hover:border-primary/50"}`}><Icon size={15}/>{platform}{active&&<BadgeCheck size={14}/>}</button>})}</div>
            <div className="mt-4 space-y-3">{selected.map(platform=><div key={platform} className="rounded-xl border border-border bg-background p-4"><div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm font-semibold">{platform}</p><span className="rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground">50+ required</span></div><div className="grid gap-3 sm:grid-cols-[1fr_140px]"><Field label="Public profile URL *"><input required type="url" placeholder="https://…" value={socials[platform].url} onChange={e=>setSocials(old=>({...old,[platform]:{...old[platform],url:e.target.value}}))}/></Field><Field label={platform==="YouTube"?"Subscribers *":"Followers *"}><input required type="number" min="0" value={socials[platform].audience} placeholder="e.g. 250" onChange={e=>setSocials(old=>({...old,[platform]:{...old[platform],audience:e.target.value}}))}/></Field></div></div>)}</div>
            {selected.length===0&&<p className="mt-3 text-xs text-destructive">Select at least one social platform.</p>}<p className={`mt-3 text-xs leading-5 ${eligible?"text-primary":"text-muted-foreground"}`}>{eligible?"✓ The minimum audience requirement is met on one selected platform.":"You need a public profile and at least 50 followers/subscribers on one selected platform."}</p>
          </section>

          <section className="border-t border-border pt-7"><SectionTitle number="03" title="Your creative work" subtitle="Give us a feel for what you want to share."/><div className="mt-4 space-y-4"><Field label="Tell us about your content *" hint={`${form.about.length}/1500`}><textarea required rows={4} maxLength={1500} value={form.about} onChange={e=>update("about",e.target.value)} placeholder="What do you create, who is it for, and what would you like to publish on XoraTV?"/></Field><Field label="Sample video or portfolio link" hint="Optional"><input type="url" value={form.sampleUrl} onChange={e=>update("sampleUrl",e.target.value)} placeholder="https://…"/></Field></div></section>

          <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/35 p-4"><input className="mt-1 size-4 shrink-0 accent-[hsl(var(--primary))]" type="checkbox" checked={form.accepted} onChange={e=>update("accepted",e.target.checked)}/><span className="text-xs leading-5 text-muted-foreground">I confirm that my details and audience figures are accurate, my profile links are public, and I agree to follow XoraTV's creator guidelines. I understand this application does not grant creator access automatically.</span></label>
          {error&&<p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-5 text-destructive">{error}</p>}
          <button disabled={busy||selected.length===0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{busy?"Sending application…":"Send creator application"}<ArrowRight size={16}/></button>
          <p className="text-center text-[11px] leading-5 text-muted-foreground">Please submit once. The team will review your application before any access is granted.</p>
        </div>
      </form>
    </section>
    <footer className="border-t border-border px-4 py-5 text-center text-[11px] text-muted-foreground">XoraTV Creator Network · Preview environment</footer>
  </main>;
}

function SectionTitle({number,title,subtitle}:{number:string;title:string;subtitle:string}) {
  return <div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{number}</span><div><h3 className="text-base font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</p></div><ChevronRight size={16} className="ml-auto mt-2 text-muted-foreground/60"/></div>;
}
function Field({label,hint,children}:{label:string;hint?:string;children:React.ReactNode}) {
  return <label className="block min-w-0"><span className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold"><span>{label}</span>{hint&&<span className="text-[10px] font-normal text-muted-foreground">{hint}</span>}</span><span className="block [&_input]:h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-input [&_input]:bg-background [&_input]:px-3 [&_input]:text-sm [&_input]:text-foreground [&_input]:outline-none [&_input]:transition [&_input]:placeholder:text-muted-foreground/70 [&_input]:focus:border-primary [&_input]:focus:ring-4 [&_input]:focus:ring-primary/10 [&_select]:h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-input [&_select]:bg-background [&_select]:px-3 [&_select]:text-sm [&_select]:text-foreground [&_select]:outline-none [&_select]:focus:border-primary [&_select]:focus:ring-4 [&_select]:focus:ring-primary/10 [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-input [&_textarea]:bg-background [&_textarea]:p-3 [&_textarea]:text-sm [&_textarea]:text-foreground [&_textarea]:outline-none [&_textarea]:placeholder:text-muted-foreground/70 [&_textarea]:focus:border-primary [&_textarea]:focus:ring-4 [&_textarea]:focus:ring-primary/10">{children}</span></label>;
}
