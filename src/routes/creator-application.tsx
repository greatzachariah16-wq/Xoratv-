import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, CheckCircle2, Clapperboard, Facebook, Instagram, ShieldCheck, Sparkles, Youtube } from "lucide-react";

export const Route = createFileRoute("/creator-application")({ component: CreatorApplicationPage });
type Platform = "Facebook" | "TikTok" | "YouTube";
type Social = { url: string; audience: string };
const initialSocials: Record<Platform, Social> = { Facebook: {url:"",audience:""}, TikTok:{url:"",audience:""}, YouTube:{url:"",audience:""} };
const platformIcons = { Facebook, TikTok: Instagram, YouTube };
const categories = ["Entertainment","Education & tutorials","Music","Comedy","Lifestyle","News & commentary","Technology","Gaming","Film & storytelling","Other"];
const steps = [{name:"About you",detail:"Your personal details"},{name:"Your audience",detail:"Public social profiles"},{name:"Your work",detail:"Content and review"}];

function CreatorApplicationPage() {
 const [step,setStep] = useState(0);
 const [form,setForm] = useState({fullName:"",email:"",username:"",channelName:"",country:"Nigeria",category:"Entertainment",about:"",sampleUrl:"",accepted:false});
 const [socials,setSocials] = useState<Record<Platform,Social>>(initialSocials);
 const [selected,setSelected] = useState<Platform[]>(["TikTok"]);
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState("");
 const [success,setSuccess] = useState(false);
 const eligible = useMemo(()=>selected.some(p=>Number(socials[p].audience)>=50 && /^https?:\/\//i.test(socials[p].url)),[selected,socials]);
 const update=(key:keyof typeof form,value:string|boolean)=>setForm(old=>({...old,[key]:value}));
 const togglePlatform=(p:Platform)=>setSelected(old=>old.includes(p)?old.filter(x=>x!==p):[...old,p]);

 function next(event:React.MouseEvent<HTMLButtonElement>) {
   event.preventDefault(); setError("");
   const formElement=document.getElementById("creator-application-form") as HTMLFormElement|null;
   if(step===0) {
     const required=formElement?.querySelectorAll< HTMLInputElement >("[data-step='0'] input[required], [data-step='0'] select[required]");
     for(const field of Array.from(required||[])){if(!field.reportValidity())return;}
   }
   if(step===1 && !eligible){setError("Add a public profile link and at least 50 followers/subscribers on Facebook, TikTok or YouTube.");return;}
   setStep(s=>Math.min(2,s+1));
   window.scrollTo({top:0,behavior:"smooth"});
 }
 async function submit(event:React.FormEvent<HTMLFormElement>) {
   event.preventDefault(); setError("");
   if(!eligible){setStep(1);setError("Add a public profile link and at least 50 followers/subscribers on one supported platform.");return;}
   if(!form.accepted){setError("Please confirm your details are accurate and accept the creator guidelines.");return;}
   setBusy(true);
   try {
     const backend=(import.meta as any).env?.VITE_RENDER_BACKEND_URL?.replace(/\/$/,"")||"";
     const response=await fetch(`${backend}/api/creator-applications`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,socials:Object.fromEntries(selected.map(p=>[p,socials[p]])),source:"preview-lab"})});
     const body=await response.json().catch(()=>({}));
     if(!response.ok||!body.ok)throw new Error(body.error||"We couldn't submit your application. Please try again.");
     setSuccess(true);
   } catch(err){setError(err instanceof Error?err.message:"Submission failed. Please try again.");}
   finally{setBusy(false);}
 }
 const reset=()=>{setStep(0);setSuccess(false);setForm({fullName:"",email:"",username:"",channelName:"",country:"Nigeria",category:"Entertainment",about:"",sampleUrl:"",accepted:false});setSocials(initialSocials);setSelected(["TikTok"]);};

 if(success)return <main className="min-h-screen bg-background px-4 py-12 text-foreground"><section className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-card sm:p-12"><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary"><CheckCircle2 size={32}/></div><p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-primary">Application received</p><h1 className="mt-3 font-display text-3xl font-semibold">Thanks for stepping forward.</h1><p className="mt-4 text-sm leading-7 text-muted-foreground">Your details have been submitted for manual review. An application does not automatically activate creator privileges.</p><button onClick={reset} className="mt-7 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Submit another application</button></section></main>;

 return <main className="min-h-screen bg-background text-foreground">
   <header className="border-b border-border bg-card"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8"><a href="/" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Clapperboard size={19}/></span><span><span className="block font-display text-lg font-bold">XoraTV</span><span className="block text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Creator network</span></span></a><span className="rounded-full border border-border bg-background px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Preview lab</span></div></header>
   <div className="mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-8 sm:pt-12">
     <div className="mx-auto max-w-3xl text-center"><div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary"><Sparkles size={14}/> Creator applications are open</div><h1 className="mt-5 font-display text-3xl font-semibold tracking-tight sm:text-5xl">Let's build something <span className="text-primary">great together.</span></h1><p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">Tell us about yourself, your audience and what you want to create on XoraTV. It takes just a few minutes.</p></div>
     <div className="mx-auto mt-8 grid max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-card lg:grid-cols-[260px_1fr] lg:rounded-3xl">
       <aside className="border-b border-border bg-muted/35 p-5 sm:p-7 lg:border-b-0 lg:border-r">
         <p className="text-[10px] font-bold uppercase tracking-[.2em] text-muted-foreground">Application steps</p>
         <div className="mt-5 flex gap-3 lg:flex-col lg:gap-0">{steps.map((item,i)=><div key={item.name} className="relative flex min-w-0 flex-1 gap-3 pb-0 lg:pb-7"><div className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-xl border text-xs font-bold ${i<step?"border-primary bg-primary text-primary-foreground":i===step?"border-primary bg-primary/10 text-primary":"border-border bg-card text-muted-foreground"}`}>{i<step?<Check size={16}/>:String(i+1).padStart(2,"0")}</div><div className="hidden min-w-0 pt-1 lg:block"><p className={`text-sm font-semibold ${i===step?"text-foreground":"text-muted-foreground"}`}>{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></div>{i<2&&<span className="absolute left-4 top-10 hidden h-7 w-px bg-border lg:block"/>}</div>)}</div>
         <div className="mt-2 hidden rounded-xl border border-border bg-card p-4 lg:block"><ShieldCheck size={19} className="text-primary"/><p className="mt-3 text-sm font-semibold">Human review</p><p className="mt-1 text-xs leading-5 text-muted-foreground">We check every application before granting creator access.</p></div>
       </aside>
       <form id="creator-application-form" onSubmit={submit} className="min-w-0">
         <div className="flex items-center justify-between border-b border-border px-5 py-5 sm:px-8"><div><p className="text-xs font-semibold text-primary">STEP 0{step+1} OF 03</p><h2 className="mt-1 font-display text-xl font-semibold sm:text-2xl">{["First, the basics","Show us your audience","Tell us what you create"][step]}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{["Your contact details and channel identity.","Connect at least one public social profile.","A little about your content and plans."][step]}</p></div><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Clapperboard size={20}/></span></div>
         <div className="p-5 sm:p-8">
           {step===0&&<div data-step="0" className="grid gap-5 sm:grid-cols-2"><Field label="Full name *"><input required autoComplete="name" value={form.fullName} onChange={e=>update("fullName",e.target.value)} placeholder="Your full name"/></Field><Field label="Email address *"><input required type="email" autoComplete="email" value={form.email} onChange={e=>update("email",e.target.value)} placeholder="you@example.com"/></Field><Field label="XoraTV username" hint="Optional"><input value={form.username} onChange={e=>update("username",e.target.value)} placeholder="@yourhandle"/></Field><Field label="Creator / channel name *"><input required value={form.channelName} onChange={e=>update("channelName",e.target.value)} placeholder="Your channel name"/></Field><Field label="Country *"><input required value={form.country} onChange={e=>update("country",e.target.value)} placeholder="Your country"/></Field><Field label="Content category *"><select value={form.category} onChange={e=>update("category",e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></Field></div>}
           {step===1&&<section><div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm font-semibold">Minimum audience: 50+</p><p className="mt-1 text-xs leading-5 text-muted-foreground">You only need to meet the threshold on one supported platform. Add a public profile link so our team can verify it.</p></div><div className="mt-5 flex flex-wrap gap-2">{(["Facebook","TikTok","YouTube"] as Platform[]).map(p=>{const Icon=platformIcons[p];const active=selected.includes(p);return <button type="button" key={p} onClick={()=>togglePlatform(p)} aria-pressed={active} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${active?"border-primary bg-primary/10 text-primary":"border-border bg-background text-muted-foreground hover:border-primary/50"}`}><Icon size={15}/>{p}{active&&<BadgeCheck size={14}/>}</button>})}</div><div className="mt-4 space-y-3">{selected.map(p=><div key={p} className="rounded-xl border border-border bg-background p-4"><div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm font-semibold">{p}</p><span className="rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground">Public profile</span></div><div className="grid gap-3 sm:grid-cols-[1fr_140px]"><Field label="Profile URL *"><input required type="url" placeholder="https://…" value={socials[p].url} onChange={e=>setSocials(old=>({...old,[p]:{...old[p],url:e.target.value}}))}/></Field><Field label={p==="YouTube"?"Subscribers *":"Followers *"}><input required type="number" min="0" value={socials[p].audience} placeholder="e.g. 250" onChange={e=>setSocials(old=>({...old,[p]:{...old[p],audience:e.target.value}}))}/></Field></div></div>)}</div>{selected.length===0&&<p className="mt-3 text-xs text-destructive">Select at least one platform to continue.</p>}<p className={`mt-4 text-xs ${eligible?"text-primary":"text-muted-foreground"}`}>{eligible?"✓ Minimum audience requirement met.":"At least one selected platform must have 50+ followers/subscribers and a profile URL."}</p></section>}
           {step===2&&<div className="space-y-5"><Field label="Tell us about your content *" hint={`${form.about.length}/1500`}><textarea required rows={5} maxLength={1500} value={form.about} onChange={e=>update("about",e.target.value)} placeholder="What do you create, who is it for, and what would you love to publish on XoraTV?"/></Field><Field label="Sample video or portfolio link" hint="Optional"><input type="url" value={form.sampleUrl} onChange={e=>update("sampleUrl",e.target.value)} placeholder="https://…"/></Field><label className="flex items-start gap-3 rounded-xl border border-border bg-muted/35 p-4"><input className="mt-1 size-4 shrink-0 accent-[hsl(var(--primary))]" type="checkbox" checked={form.accepted} onChange={e=>update("accepted",e.target.checked)}/><span className="text-xs leading-5 text-muted-foreground">I confirm that my details and audience figures are accurate, my profile links are public, and I agree to follow XoraTV's creator guidelines. I understand this application does not automatically grant creator access.</span></label></div>}
           {error&&<p role="alert" className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-5 text-destructive">{error}</p>}
           <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">{step>0?<button type="button" onClick={()=>{setError("");setStep(s=>s-1);window.scrollTo({top:0,behavior:"smooth"});}} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold hover:bg-muted"><ArrowLeft size={16}/> Back</button>:<span className="text-xs text-muted-foreground">Your details stay in this form until submitted.</span>}{step<2?<button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">Continue <ArrowRight size={16}/></button>:<button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">{busy?"Submitting…":"Submit application"} <ArrowRight size={16}/></button>}</div>
         </div>
       </form>
     </div>
     <p className="mx-auto mt-5 max-w-5xl text-center text-[11px] leading-5 text-muted-foreground">XoraTV Creator Network · Preview lab experiment · All applications require manual review.</p>
   </div>
 </main>;
}
function Field({label,hint,children}:{label:string;hint?:string;children:React.ReactNode}) {
 return <label className="block min-w-0"><span className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold"><span>{label}</span>{hint&&<span className="text-[10px] font-normal text-muted-foreground">{hint}</span>}</span><span className="block [&_input]:h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-input [&_input]:bg-background [&_input]:px-3 [&_input]:text-sm [&_input]:text-foreground [&_input]:outline-none [&_input]:placeholder:text-muted-foreground/70 [&_input]:focus:border-primary [&_input]:focus:ring-4 [&_input]:focus:ring-primary/10 [&_select]:h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-input [&_select]:bg-background [&_select]:px-3 [&_select]:text-sm [&_select]:text-foreground [&_select]:outline-none [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-input [&_textarea]:bg-background [&_textarea]:p-3 [&_textarea]:text-sm [&_textarea]:text-foreground [&_textarea]:outline-none [&_textarea]:placeholder:text-muted-foreground/70 [&_textarea]:focus:border-primary [&_textarea]:focus:ring-4 [&_textarea]:focus:ring-primary/10">{children}</span></label>;
}
