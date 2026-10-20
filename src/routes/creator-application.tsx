import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, BadgeCheck, BookOpen, CheckCircle2, ChevronRight, Clapperboard, Facebook, Instagram, ShieldCheck, Sparkles, Youtube } from "lucide-react";

export const Route = createFileRoute("/creator-application")({ component: CreatorApplicationPage });

type Platform = "Facebook" | "TikTok" | "YouTube";
type Social = { url: string; audience: string };
const initialSocials: Record<Platform, Social> = {
  Facebook: { url: "", audience: "" },
  TikTok: { url: "", audience: "" },
  YouTube: { url: "", audience: "" },
};

const platformIcons = { Facebook, TikTok: Instagram, YouTube: Youtube };

function CreatorApplicationPage() {
  const [form, setForm] = useState({ fullName: "", email: "", username: "", channelName: "", country: "Nigeria", category: "Entertainment", about: "", sampleUrl: "", accepted: false });
  const [socials, setSocials] = useState<Record<Platform, Social>>(initialSocials);
  const [selected, setSelected] = useState<Platform[]>(["TikTok"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const eligible = useMemo(() => selected.some((platform) => Number(socials[platform].audience) >= 50 && /^https?:\/\//i.test(socials[platform].url)), [selected, socials]);

  const update = (key: keyof typeof form, value: string | boolean) => setForm((old) => ({ ...old, [key]: value }));
  const togglePlatform = (platform: Platform) => setSelected((old) => old.includes(platform) ? old.filter((p) => p !== platform) : [...old, platform]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!eligible) { setError("Add a public profile link and at least 50 followers/subscribers on Facebook, TikTok or YouTube."); return; }
    if (!form.accepted) { setError("Please confirm the information is accurate and accept the creator guidelines."); return; }
    setBusy(true);
    try {
      const backend = (import.meta as any).env?.VITE_RENDER_BACKEND_URL?.replace(/\/$/, "") || "";
      const response = await fetch(`${backend}/api/creator-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, socials: Object.fromEntries(selected.map((platform) => [platform, socials[platform]])), source: "preview-lab" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || "We couldn't submit your application. Please try again.");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally { setBusy(false); }
  }

  if (success) return <main className="min-h-screen bg-[#f7f4f2] px-4 py-12 text-[#211b2d]"><section className="mx-auto max-w-xl rounded-[32px] border border-white bg-white p-8 text-center shadow-xl sm:p-12"><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><CheckCircle2 size={32}/></div><p className="mt-6 text-xs font-bold uppercase tracking-[.22em] text-violet-700">Application received</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Your creator journey starts here.</h1><p className="mt-4 leading-7 text-slate-600">Thanks for applying to XoraTV. Our team will manually review your details, usually within 24 hours. Submitting an application does not automatically activate creator privileges.</p><button onClick={() => { setSuccess(false); setForm({ fullName:"", email:"", username:"", channelName:"", country:"Nigeria", category:"Entertainment", about:"", sampleUrl:"", accepted:false }); setSocials(initialSocials); setSelected(["TikTok"]); }} className="mt-7 rounded-xl bg-[#302344] px-5 py-3 text-sm font-semibold text-white">Submit another application</button></section></main>;

  return <main className="min-h-screen overflow-hidden bg-[#f7f4f2] text-[#211b2d]">
    <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className="absolute -right-24 -top-32 size-[420px] rounded-full bg-violet-200/45 blur-3xl"/><div className="absolute -bottom-40 -left-24 size-[420px] rounded-full bg-rose-100/60 blur-3xl"/></div>
    <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8"><a href="/" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#302344] text-white shadow-lg"><Clapperboard size={20}/></span><span><span className="block text-lg font-bold tracking-tight">Xora<span className="text-violet-700">TV</span></span><span className="block text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">Creator network</span></span></a><span className="rounded-full border border-violet-200 bg-white/75 px-3 py-1.5 text-[11px] font-semibold text-violet-800">CREATOR APPLICATION LAB</span></header>
    <section className="relative mx-auto grid max-w-6xl gap-8 px-5 pb-12 pt-5 sm:px-8 lg:grid-cols-[.82fr_1.18fr] lg:gap-12 lg:pt-12">
      <div className="lg:sticky lg:top-8 lg:self-start">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-2 text-xs font-semibold text-violet-800"><Sparkles size={14}/> Your creativity deserves a channel</div>
        <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-.04em] sm:text-5xl">Make your next big thing <span className="text-violet-700">happen here.</span></h1>
        <p className="mt-5 max-w-lg text-sm leading-7 text-slate-600">Apply to become an XoraTV creator. Bring your videos, lessons, ideas and community to a home built for African creativity and stories from everywhere.</p>
        <div className="mt-7 space-y-3">
          {[["01","Show us your audience","At least 50 followers on Facebook or TikTok, or 50 YouTube subscribers."],["02","Tell us what you make","Share your content niche and public social profiles so our team can review them."],["03","Hear back from our team","Manual review usually takes 24 hours. Approval is never automatic."]].map(([n,title,desc])=><div key={n} className="flex gap-4 rounded-2xl border border-white/80 bg-white/65 p-4 shadow-sm backdrop-blur"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-100 text-xs font-bold text-violet-800">{n}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{desc}</p></div></div>)}
        </div>
        <div className="mt-6 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={16} className="text-emerald-700"/> Applications are reviewed by people, not auto-approved.</div>
      </div>
      <form onSubmit={submit} className="relative rounded-[28px] border border-white bg-white/90 p-5 shadow-[0_24px_90px_-38px_rgba(48,35,68,.35)] backdrop-blur-xl sm:p-8">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-violet-700">Application form</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Let's get to know you.</h2><p className="mt-2 text-xs leading-5 text-slate-500">Fields marked * are required.</p></div><div className="grid size-12 place-items-center rounded-2xl bg-[#f0eafa] text-violet-800"><BookOpen size={22}/></div></div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <Field label="Full name *"><input required autoComplete="name" value={form.fullName} onChange={e=>update("fullName",e.target.value)} placeholder="Your name" /></Field>
          <Field label="Email address *"><input required type="email" autoComplete="email" value={form.email} onChange={e=>update("email",e.target.value)} placeholder="you@example.com" /></Field>
          <Field label="XoraTV username (if you have one)"><input value={form.username} onChange={e=>update("username",e.target.value)} placeholder="@yourhandle" /></Field>
          <Field label="Creator / channel name *"><input required value={form.channelName} onChange={e=>update("channelName",e.target.value)} placeholder="What should your channel be called?" /></Field>
          <Field label="Country *"><input required value={form.country} onChange={e=>update("country",e.target.value)} /></Field>
          <Field label="Content category *"><select value={form.category} onChange={e=>update("category",e.target.value)}>{["Entertainment","Education & tutorials","Music","Comedy","Lifestyle","News & commentary","Technology","Gaming","Film & storytelling","Other"].map(x=><option key={x}>{x}</option>)}</select></Field>
        </div>
        <div className="mt-8 border-t border-slate-100 pt-6"><div className="flex items-end justify-between gap-3"><div><h3 className="text-base font-semibold">Your social audience</h3><p className="mt-1 text-xs leading-5 text-slate-500">Select every platform you want us to review.</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800">50+ required</span></div>
          <div className="mt-4 flex flex-wrap gap-2">{(["Facebook","TikTok","YouTube"] as Platform[]).map(platform=>{const Icon=platformIcons[platform];const active=selected.includes(platform);return <button type="button" key={platform} onClick={()=>togglePlatform(platform)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${active?"border-violet-300 bg-violet-50 text-violet-900":"border-slate-200 bg-white text-slate-600 hover:border-violet-200"}`}><Icon size={15}/>{platform}{active&&<BadgeCheck size={14}/>}</button>})}</div>
          <div className="mt-4 space-y-3">{selected.map(platform=><div key={platform} className="rounded-2xl border border-slate-200 bg-[#fcfbfd] p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold">{platform}<span className="text-[10px] font-normal text-slate-500">Public profile required</span></div><div className="grid gap-3 sm:grid-cols-[1fr_150px]"><Field label="Profile / channel URL *"><input required type="url" placeholder="https://…" value={socials[platform].url} onChange={e=>setSocials(old=>({...old,[platform]:{...old[platform],url:e.target.value}}))}/></Field><Field label={platform==="YouTube"?"Subscribers *":"Followers *"}><input required type="number" min="0" value={socials[platform].audience} placeholder="e.g. 250" onChange={e=>setSocials(old=>({...old,[platform]:{...old[platform],audience:e.target.value}}))}/></Field></div></div>)}</div>
          {selected.length===0&&<p className="mt-3 text-xs text-rose-600">Select at least one social platform.</p>}
          <p className={`mt-3 text-xs ${eligible?"text-emerald-700":"text-slate-500"}`}>{eligible?"✓ Eligibility threshold met on at least one selected platform.":"You need 50+ followers/subscribers and a profile link on at least one selected platform."}</p>
        </div>
        <div className="mt-7 grid gap-4"><Field label="Tell us about your content *"><textarea required rows={4} maxLength={1500} value={form.about} onChange={e=>update("about",e.target.value)} placeholder="What do you create, who is it for, and what would you love to publish on XoraTV?"/></Field><Field label="Sample video or portfolio link (optional)"><input type="url" value={form.sampleUrl} onChange={e=>update("sampleUrl",e.target.value)} placeholder="https://…"/></Field></div>
        <label className="mt-5 flex items-start gap-3 rounded-2xl bg-[#f7f4fa] p-4"><input className="mt-1 size-4 accent-violet-700" type="checkbox" checked={form.accepted} onChange={e=>update("accepted",e.target.checked)}/><span className="text-xs leading-5 text-slate-600">I confirm that the details and audience figures are accurate, my profile links are public, and I agree to follow XoraTV's creator guidelines. I understand this application is reviewed manually and does not grant creator access automatically.</span></label>
        {error&&<p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">{error}</p>}
        <button disabled={busy||selected.length===0} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#302344] px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/15 transition hover:bg-violet-900 disabled:cursor-not-allowed disabled:opacity-50">{busy?"Sending application…":"Submit creator application"}<ArrowRight size={16}/></button>
        <p className="mt-3 text-center text-[10px] leading-5 text-slate-500">We usually review applications within 24 hours. Please submit once and keep your profile links available for review.</p>
      </form>
    </section>
    <footer className="relative border-t border-white/80 px-5 py-6 text-center text-[11px] text-slate-500">XoraTV Creator Network · Preview Lab experiment · Not an approval or creator-access grant</footer>
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-2 block text-[11px] font-semibold text-slate-700">{label}</span><span className="block [&_input]:h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-sm [&_input]:text-slate-800 [&_input]:outline-none [&_input]:transition [&_input]:focus:border-violet-400 [&_input]:focus:ring-4 [&_input]:focus:ring-violet-100 [&_select]:h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-slate-200 [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-slate-200 [&_textarea]:bg-white [&_textarea]:p-3 [&_textarea]:text-sm [&_textarea]:outline-none [&_textarea]:focus:border-violet-400 [&_textarea]:focus:ring-4 [&_textarea]:focus:ring-violet-100">{children}</span></label>;
}
