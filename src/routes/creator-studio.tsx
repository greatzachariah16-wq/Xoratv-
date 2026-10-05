import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, BookOpen, Check, ChevronDown, Gift, Landmark, Loader2,
  Menu, PenLine, Plus, Radio, Settings2, Trash2, Upload, Users, Wallet,
  X, AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { UserAvatar } from "@/components/xora/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { commerceFetch, creatorDashboardQuery } from "@/lib/commerce";

export const Route = createFileRoute("/creator-studio")({ component: XChannel });

const BANK_OPTIONS = [
  ["Access Bank","access-bank"],["ALAT by Wema","alat-by-wema"],["Citibank Nigeria","citibank-nigeria"],
  ["Ecobank Nigeria","ecobank"],["FCMB","fcmb"],["Fidelity Bank","fidelity-bank"],["First Bank of Nigeria","first-bank"],
  ["Globus Bank","globus-bank"],["GTBank","gtbank"],["Jaiz Bank","jaiz-bank"],["Keystone Bank","keystone-bank"],
  ["Kuda","kuda"],["Moniepoint","moniepoint"],["OPay","opay"],["PalmPay","palmpay"],["Polaris Bank","polaris-bank"],
  ["PremiumTrust Bank","premiumtrust-bank"],["Providus Bank","providus-bank"],["Stanbic IBTC","stanbic-ibtc"],
  ["Sterling Bank","sterling-bank"],["UBA","uba"],["Union Bank","union-bank"],["Unity Bank","unity-bank"],
  ["Wema Bank","wema-bank"],["Zenith Bank","zenith-bank"],
] as const;

function bankLogoUrl(slug:string){return `https://cdn.jsdelivr.net/gh/supermx1/nigerian-banks-api@main/logos/${slug}.png`;}
function BankLogo({name,slug}:{name:string;slug:string}){
  const [failed,setFailed]=useState(false);
  return <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
    {!failed?<img src={bankLogoUrl(slug)} alt="" className="size-6 object-contain" onError={()=>setFailed(true)}/>:<span className="text-[10px] font-bold text-primary">{name.split(/\s+/).map(x=>x[0]).join("").slice(0,2)}</span>}
  </span>;
}

type Section="home"|"videos"|"shorts"|"courses"|"community"|"about"|"manage"|"analytics"|"earnings"|"customize";

function XChannel(){
  const {user,profile}=useAuth();
  const [section,setSection]=useState<Section>("home");
  const [menuOpen,setMenuOpen]=useState(false);
  const [registered,setRegistered]=useState(false);
  const [terms,setTerms]=useState(false);
  const [busy,setBusy]=useState(false);
  const [deleteTarget,setDeleteTarget]=useState<any>(null);
  const [deleteBusy,setDeleteBusy]=useState(false);
  const [payoutBusy,setPayoutBusy]=useState(false);
  const [bankOpen,setBankOpen]=useState(false);
  const [accountName,setAccountName]=useState("");
  const [accountNumber,setAccountNumber]=useState("");
  const [bankName,setBankName]=useState("");
  const [linkBusy,setLinkBusy]=useState(false);
  const {data,isPending,refetch}=useQuery(creatorDashboardQuery(user?.id));

  if(!user)return <AppShell wide><div className="mx-auto max-w-3xl rounded-[30px] border border-border bg-surface p-10 text-center shadow-card"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Radio className="size-7"/></div><h1 className="mt-5 font-display text-3xl font-semibold">X Channel</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">Sign in to create and manage your XoraTV creator channel.</p><Link to="/auth" className="mt-6 inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Sign in</Link></div></AppShell>;

  const dashboard=data?.dashboard;
  const creatorInfo=dashboard?.creator;
  const displayName=creatorInfo?.displayName||profile?.display_name||user.displayName||"Xora Creator";
  const username=creatorInfo?.username||profile?.username||user.email?.split("@")[0]||"creator";
  const avatar=profile?.avatar_url||user.photoURL||"";
  const courses=dashboard?.courses||[];
  const publishedCourses=courses.filter((c:any)=>c.status==="published");

  async function register(){
    setBusy(true);
    try{
      await commerceFetch("/api/commerce/creator/register",{method:"POST",body:JSON.stringify({userId:user.id,displayName,username})});
      setRegistered(true); await refetch();
    }catch(e){alert(e instanceof Error?e.message:"Channel registration failed.");}
    finally{setBusy(false);}
  }

  async function deleteCourse(){
    if(!deleteTarget)return;
    setDeleteBusy(true);
    try{
      await commerceFetch("/api/commerce/creator/course",{method:"DELETE",body:JSON.stringify({creatorId:user.id,courseId:deleteTarget.id})});
      setDeleteTarget(null); await refetch();
    }catch(e){alert(e instanceof Error?e.message:"Could not delete course.");}
    finally{setDeleteBusy(false);}
  }

  async function createOfferLink(){
    setLinkBusy(true);
    try{await commerceFetch("/api/offers/creator-link",{method:"POST",body:JSON.stringify({creatorId:user.id})});await refetch();}
    catch(e){alert(e instanceof Error?e.message:"Could not create your offer link.");}
    finally{setLinkBusy(false);}
  }

  async function savePayout(){
    setPayoutBusy(true);
    try{
      await commerceFetch("/api/commerce/creator/payout",{method:"POST",body:JSON.stringify({userId:user.id,accountName,accountNumber,bankName})});
      alert("Payout details saved.");await refetch();
    }catch(e){alert(e instanceof Error?e.message:"Could not save payout details.");}
    finally{setPayoutBusy(false);}
  }

  if(!creatorInfo&&!registered)return <AppShell wide>
    <div className="mx-auto max-w-5xl grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
      <section className="relative overflow-hidden rounded-[32px] border border-border bg-surface p-7 shadow-card sm:p-9">
        <div className="absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl"/>
        <div className="relative">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Radio className="size-6"/></div>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[.2em] text-primary">XoraTV creator network</p>
          <h1 className="mt-2 max-w-2xl font-display text-4xl font-semibold tracking-tight">Build your own X Channel.</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">Publish videos, Shorts and courses, grow subscribers, build a media identity and earn from eligible XoraTV activity.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background p-4"><Radio className="size-4 text-primary"/><p className="mt-3 text-sm font-semibold">Publish</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Turn your content into a real channel.</p></div>
            <div className="rounded-2xl border border-border bg-background p-4"><Users className="size-4 text-primary"/><p className="mt-3 text-sm font-semibold">Grow</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Build subscribers around your media brand.</p></div>
            <div className="rounded-2xl border border-border bg-background p-4"><Gift className="size-4 text-primary"/><p className="mt-3 text-sm font-semibold">Earn</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Eligible ad and CPA activity can contribute to creator earnings.</p></div>
          </div>
        </div>
      </section>
      <section className="rounded-[32px] border border-border bg-surface p-7 shadow-card sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Get started</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">Create your X Channel</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Your channel is separate from your personal XoraTV profile, but uses the same signed-in account.</p>
        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-background p-4"><input type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)} className="mt-0.5 size-4 accent-primary"/><span className="text-xs leading-5 text-muted-foreground">I agree to the X Channel creator terms and understand that creator activity may be reviewed by XoraTV.</span></label>
        <button onClick={()=>void register()} disabled={!terms||busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?<Loader2 className="size-4 animate-spin"/>:<Radio className="size-4"/>}{busy?"Creating channel…":"Create X Channel"}</button>
      </section>
    </div>
  </AppShell>;

  if(isPending)return <AppShell wide><div className="p-8 text-sm text-muted-foreground">Loading your X Channel…</div></AppShell>;

  const publicTabs:[Section,string][]=[["home","Home"],["videos","Videos"],["shorts","Shorts"],["courses","Courses"],["community","Community"],["about","About"]];
  const manageTabs:[Section,string][]=[["manage","Overview"],["analytics","Analytics"],["earnings","Earnings"],["customize","Customize"]];

  function PublicContent(){
    if(section==="videos")return <EmptyContent icon={<Upload/>} title="Your videos" text="Long-form videos published to this X Channel will appear here." action="Upload video" href="/create"/>;
    if(section==="shorts")return <EmptyContent icon={<Radio/>} title="Your Shorts" text="Your published Shorts will appear here as your channel grows." action="Open Shorts" href="/shorts"/>;
    if(section==="community")return <EmptyContent icon={<Users/>} title="Community" text="Channel announcements, posts and conversations will live here." action="Create post" href="/create"/>;
    if(section==="about")return <section className="rounded-2xl border border-border bg-surface p-6 shadow-card"><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">About this channel</p><h2 className="mt-2 font-display text-xl font-semibold">{displayName}</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{profile?.bio||"Welcome to my XoraTV channel."}</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><Stat label="Subscribers" value={String(dashboard?.stats?.followers||0)}/><Stat label="Courses" value={String(publishedCourses.length)}/><Stat label="Joined" value="XoraTV"/></div></section>;
    if(section==="courses")return <CourseShelf courses={publishedCourses}/>;
    return <div className="space-y-6"><section className="overflow-hidden rounded-3xl border border-border bg-ink text-white shadow-lift"><div className="relative aspect-[2.8/1] min-h-[180px] bg-gradient-to-br from-primary/80 via-ink to-foreground/90"><div className="absolute inset-0 opacity-20" style={{background:"radial-gradient(circle at 78% 20%, currentColor, transparent 35%)"}}/><div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-white/65">Featured on X Channel</p><h2 className="mt-2 max-w-2xl font-display text-2xl font-semibold sm:text-3xl">Your channel is ready for its first story.</h2><p className="mt-2 max-w-xl text-xs leading-5 text-white/65">Publish your best video and make it the first thing your audience sees.</p></div></div></section><section><div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-primary">Learn</p><h2 className="mt-1 font-display text-xl font-semibold">Courses from {displayName}</h2></div><button onClick={()=>setSection("courses")} className="text-xs font-semibold text-primary">View all</button></div><CourseShelf courses={publishedCourses.slice(0,4)}/></section></div>;
  }

  function ManageContent(){
    if(section==="analytics")return <section className="space-y-4"><PanelTitle eyebrow="Channel analytics" title="Know what your audience watches" text="Only live metrics available to XoraTV are shown here."/><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Subscribers" value={dashboard?.stats?.followers||0}/><Metric label="Published courses" value={publishedCourses.length}/><Metric label="Approved CPA" value={dashboard?.cpa?.approvedConversions||0}/><Metric label="Creator balance" value={`₦${Number(dashboard?.stats?.balance||0).toLocaleString()}`}/></div></section>;
    if(section==="earnings")return <section className="space-y-4"><PanelTitle eyebrow="Earnings" title="Creator earnings" text="Revenue from eligible XoraTV activity stays separate from user rewards and course unlocks."/><div className="grid gap-3 sm:grid-cols-3"><Metric label="Available" value={`₦${Number(dashboard?.stats?.balance||0).toLocaleString()}`}/><Metric label="Commission" value={`₦${Number(dashboard?.stats?.commission||0).toLocaleString()}`}/><Metric label="Approved CPA" value={dashboard?.cpa?.approvedConversions||0}/></div><div className="rounded-2xl border border-border bg-surface p-5"><p className="text-sm font-semibold">Payout details</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Save the bank account used for eligible creator payouts.</p><PayoutForm/></div><div className="rounded-2xl border border-border bg-surface p-5"><p className="text-sm font-semibold">Creator promotions</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Promote eligible CPA offers. X Channel does not sell mobile data or courses directly.</p><button onClick={()=>void createOfferLink()} disabled={linkBusy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">{linkBusy?<Loader2 className="size-4 animate-spin"/>:<Gift className="size-4"/>}{linkBusy?"Creating link…":"Create CPA offer link"}</button></div></section>;
    if(section==="customize")return <section className="space-y-4"><PanelTitle eyebrow="Channel customization" title="Shape your media identity" text="The public channel uses your existing XoraTV profile identity for now."/><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-border bg-surface p-5"><Settings2 className="size-5 text-primary"/><p className="mt-3 text-sm font-semibold">Channel identity</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Name: {displayName}<br/>Handle: @{username}</p></div><div className="rounded-2xl border border-border bg-surface p-5"><PenLine className="size-5 text-primary"/><p className="mt-3 text-sm font-semibold">Profile controls</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Update your profile photo and bio from your XoraTV profile.</p><Link to={`/profile/$username`} params={{username}} className="mt-3 inline-flex text-xs font-semibold text-primary">Open profile</Link></div></div></section>;
    return <div className="space-y-4"><PanelTitle eyebrow="Manage channel" title="Your creator workspace" text="Everything you need to publish and grow your X Channel."/><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Action icon={<Upload/>} title="Upload video" text="Publish long-form content" href="/create"/><Action icon={<Radio/>} title="Manage Shorts" text="Open your Shorts feed" href="/shorts"/><Action icon={<BookOpen/>} title="Create course" text="Teach through video lessons" href="/learn?create=1"/><Action icon={<Gift/>} title="CPA offers" text="Create an eligible offer link" onClick={()=>void createOfferLink()} /></div><section className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">Courses</p><h3 className="mt-1 font-display text-lg font-semibold">Your learning catalogue</h3></div><Link to="/learn?create=1" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"><Plus className="size-3.5"/>Create</Link></div>{courses.length?<div className="mt-4 space-y-2">{courses.map((c:any)=><div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"><BookOpen className="size-4 shrink-0 text-primary"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{c.title}</p><p className="text-[11px] text-muted-foreground">{c.status}</p></div><button onClick={()=>setDeleteTarget(c)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-destructive" aria-label="Delete course"><Trash2 className="size-4"/></button></div>)}</div>:<p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No courses yet. Create your first course to start teaching on X Channel.</p>}</section></div>;
  }

  function PayoutForm(){return <div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={accountName} onChange={e=>setAccountName(e.target.value)} placeholder="Account name" className="h-10 rounded-xl border border-border bg-background px-3 text-sm"/><input inputMode="numeric" maxLength={10} value={accountNumber} onChange={e=>setAccountNumber(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit account number" className="h-10 rounded-xl border border-border bg-background px-3 text-sm"/><div className="relative sm:col-span-2"><button onClick={()=>setBankOpen(v=>!v)} className="flex h-10 w-full items-center gap-3 rounded-xl border border-border bg-background px-3 text-left text-sm">{bankName?<BankLogo name={bankName} slug={BANK_OPTIONS.find(x=>x[0]===bankName)?.[1]||"gtbank"}/>:<span className="text-muted-foreground">Select bank</span>}<span className="flex-1">{bankName}</span><ChevronDown className="size-4"/></button>{bankOpen?<div className="absolute left-0 right-0 top-11 z-50 max-h-64 overflow-auto rounded-2xl border border-border bg-surface p-1 shadow-xl">{BANK_OPTIONS.map(([name,slug])=><button key={name} onClick={()=>{setBankName(name);setBankOpen(false)}} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-secondary"><BankLogo name={name} slug={slug}/><span className="flex-1 text-sm">{name}</span>{bankName===name?<Check className="size-4 text-primary"/>:null}</button>)}</div>:null}</div><button onClick={()=>void savePayout()} disabled={payoutBusy||accountNumber.length!==10||!bankName} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50 sm:col-span-2">{payoutBusy?<Loader2 className="size-3.5 animate-spin"/>:<Landmark className="size-3.5"/>}{payoutBusy?"Saving…":"Save payout details"}</button></div>}

  return <AppShell wide>
    <div className="space-y-4">
      <header className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
        <div className="relative h-44 sm:h-56 bg-ink"><div className="absolute inset-0 bg-gradient-to-br from-primary/70 via-ink to-foreground"/><div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_75%_20%,white,transparent_32%)]"/><div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7"><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-white/60">XoraTV X Channel</p></div></div>
        <div className="px-5 pb-5 sm:px-7 sm:pb-7"><div className="-mt-9 flex flex-col gap-4 sm:-mt-10 sm:flex-row sm:items-end sm:justify-between"><div className="flex min-w-0 items-end gap-3"><div className="rounded-2xl bg-surface p-1 shadow-card"><UserAvatar path={avatar} name={displayName} size={76}/></div><div className="min-w-0 pb-1"><h1 className="truncate font-display text-2xl font-semibold">{displayName}</h1><p className="text-xs text-muted-foreground">@{username} · {Number(dashboard?.stats?.followers||0).toLocaleString()} subscribers</p></div></div><button onClick={()=>setMenuOpen(v=>!v)} className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-border bg-background px-3 text-xs font-semibold sm:self-end"><Menu className="size-4"/>Manage</button></div><p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">{profile?.bio||"Build your audience on XoraTV."}</p><div className="mt-5 flex gap-1 overflow-x-auto pb-1 hide-scrollbar">{publicTabs.map(([key,label])=><button key={key} onClick={()=>setSection(key)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold ${section===key?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-secondary"}`}>{label}</button>)}</div></div>
      </header>

      {menuOpen?<div className="rounded-2xl border border-border bg-surface p-2 shadow-card"><div className="flex items-center gap-2 px-3 py-2"><Settings2 className="size-4 text-primary"/><p className="text-xs font-semibold">Manage X Channel</p></div><div className="grid gap-1 sm:grid-cols-4">{manageTabs.map(([key,label])=><button key={key} onClick={()=>{setSection(key);setMenuOpen(false)}} className="rounded-xl px-3 py-3 text-left text-xs font-semibold hover:bg-secondary">{label}</button>)}</div></div>:null}

      {section==="manage"||section==="analytics"||section==="earnings"||section==="customize"?<ManageContent/>:<PublicContent/>}

      {deleteTarget?<div className="fixed inset-0 z-[90] grid place-items-center bg-foreground/30 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl"><div className="flex items-start gap-3"><div className="grid size-9 place-items-center rounded-xl bg-destructive/10 text-destructive"><AlertTriangle className="size-4"/></div><div><h2 className="font-display text-lg font-semibold">Delete “{deleteTarget.title}”?</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">This removes the course from your channel catalogue.</p></div><button onClick={()=>setDeleteTarget(null)} className="ml-auto rounded-lg p-1.5 hover:bg-secondary"><X className="size-4"/></button></div><div className="mt-5 flex justify-end gap-2"><button onClick={()=>setDeleteTarget(null)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Cancel</button><button onClick={()=>void deleteCourse()} disabled={deleteBusy} className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground">{deleteBusy?<Loader2 className="size-3.5 animate-spin"/>:<Trash2 className="size-3.5"/>}Delete</button></div></div></div>:null}
    </div>
  </AppShell>;
}

function PanelTitle({eyebrow,title,text}:{eyebrow:string;title:string;text:string}){return <div><p className="text-[10px] font-semibold uppercase tracking-[.17em] text-primary">{eyebrow}</p><h2 className="mt-1 font-display text-2xl font-semibold">{title}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{text}</p></div>}
function Metric({label,value}:{label:string;value:any}){return <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>}
function Stat({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-border bg-background p-3"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>}
function EmptyContent({icon,title,text,action,href}:{icon:any;title:string;text:string;action:string;href:string}){return <section className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center shadow-card"><div className="mx-auto grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</div><h2 className="mt-4 font-display text-xl font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted-foreground">{text}</p><Link to={href as any} className="mt-5 inline-flex rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold hover:bg-secondary">{action}</Link></section>}
function Action({icon,title,text,href,onClick}:{icon:any;title:string;text:string;href?:string;onClick?:()=>void}){const body=<><div className="text-primary">{icon}</div><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{text}</p></>;return href?<Link to={href as any} className="rounded-2xl border border-border bg-surface p-4 shadow-sm hover:bg-secondary">{body}</Link>:<button onClick={onClick} className="rounded-2xl border border-border bg-surface p-4 text-left shadow-sm hover:bg-secondary">{body}</button>}
function CourseShelf({courses}:{courses:any[]}){return courses.length?<div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{courses.map(c=><div key={c.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm"><div className="grid aspect-video place-items-center rounded-xl bg-secondary text-primary"><BookOpen className="size-6"/></div><p className="mt-3 truncate text-sm font-semibold">{c.title}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Unlock through eligible XoraTV rewards, surveys or CPA activities.</p></div>)}</div>:<div className="mt-3 rounded-2xl border border-dashed border-border bg-surface p-7 text-center text-xs text-muted-foreground">No published courses yet.</div>}
