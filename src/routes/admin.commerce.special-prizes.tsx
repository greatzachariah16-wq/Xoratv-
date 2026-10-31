import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, RefreshCw, Save, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { commerceFetch } from "@/lib/commerce";
import { uploadToCloudinary } from "@/lib/cloudinary";

export const Route = createFileRoute("/admin/commerce/special-prizes")({ component: SpecialPrizesAdmin });
type Prize = { id: string; title: string; description: string; details?: string; steps?: string[]; smsInstructions?: string; screenshots?: string[]; campaignId: string; imageUrl: string; scriptSnippet: string; currency: string; status: "active" | "paused"; clicks: number; createdAt: string; updatedAt: string };
type Banner = { enabled: boolean; imageUrl: string; updatedAt?: string };
type Traffic = { id:string; creatorId:string; creatorUsername:string; creatorDisplayName:string; prizeId:string; prizeTitle:string; postId:string|null; source:string; sourceType:string; medium:string|null; campaign:string|null; referrerHost:string|null; clickedAt:string };
const defaultBanner: Banner = { enabled: false, imageUrl: "" };
const empty = { id: "", title: "", description: "", details: "", steps: [] as string[], smsInstructions: "", screenshots: [] as string[], campaignId: "", imageUrl: "", scriptSnippet: "", currency: "USD", status: "active" as "active" | "paused" };
function SpecialPrizesAdmin() {
  const [prizes,setPrizes]=useState<Prize[]>([]);
  const [traffic,setTraffic]=useState<Traffic[]>([]);
  const [draft,setDraft]=useState(empty);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const [uploadingImage,setUploadingImage]=useState(false);
  const [uploadingScreenshots,setUploadingScreenshots]=useState(false);
  const [bannerDraft,setBannerDraft]=useState<Banner>(defaultBanner);
  const [bannerBusy,setBannerBusy]=useState(false);
  const [uploadingBanner,setUploadingBanner]=useState(false);
  async function load(){setLoading(true);try{const [r,b,t]=await Promise.all([commerceFetch<{prizes:Prize[]}>("/api/admin/commerce/special-prizes"),commerceFetch<{banner:Banner}>("/api/admin/commerce/special-prizes/banner"),commerceFetch<{traffic:Traffic[]}>("/api/admin/commerce/special-prizes/traffic")]);setPrizes(r.prizes||[]);setTraffic(t.traffic||[]);setBannerDraft({...defaultBanner,...(b.banner||{})});}catch(e){setMessage(e instanceof Error?e.message:"Could not load Special Prizes settings.");}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  function edit(p:Prize){setDraft({id:p.id,title:p.title,description:p.description,details:p.details||"",steps:p.steps||[],smsInstructions:p.smsInstructions||"",screenshots:p.screenshots||[],campaignId:p.campaignId,imageUrl:p.imageUrl||"",scriptSnippet:p.scriptSnippet||"",currency:p.currency||"USD",status:p.status});setMessage("");window.scrollTo({top:0,behavior:"smooth"});}
  async function uploadPrizeImage(file: File){
    setUploadingImage(true);setMessage("");
    try{
      if(!["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
      if(file.size>8*1024*1024) throw new Error("Offer image must be 8 MB or smaller.");
      const result=await uploadToCloudinary(file,{resourceType:"image",folder:"xora/special-prizes"});
      setDraft(current=>({...current,imageUrl:result.url}));
      setMessage("Image uploaded. Save the prize to publish it.");
    }catch(e){setMessage(e instanceof Error?e.message:"Image upload failed.");}
    finally{setUploadingImage(false);}
  }
  async function uploadFlowScreenshots(files: FileList | File[]){
    const selected=Array.from(files);
    if(!selected.length)return;
    if((draft.screenshots||[]).length+selected.length>12){setMessage("You can add up to 12 offer-flow screenshots.");return;}
    setUploadingScreenshots(true);setMessage("");
    try{
      const urls=await Promise.all(selected.map(async file=>{
        if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Choose JPG, PNG or WebP screenshots.");
        if(file.size>8*1024*1024)throw new Error("Each screenshot must be 8 MB or smaller.");
        const result=await uploadToCloudinary(file,{resourceType:"image",folder:"xora/special-prizes/flow"});
        return result.url;
      }));
      setDraft(current=>({...current,screenshots:[...(current.screenshots||[]),...urls]}));
      setMessage("Offer-flow screenshots uploaded. Save the offer to publish them.");
    }catch(e){setMessage(e instanceof Error?e.message:"Screenshot upload failed.");}
    finally{setUploadingScreenshots(false);}
  }
  async function uploadBannerImage(file: File){
    setUploadingBanner(true);setMessage("");
    try{
      if(!["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP banner image.");
      if(file.size>8*1024*1024) throw new Error("Banner image must be 8 MB or smaller.");
      const result=await uploadToCloudinary(file,{resourceType:"image",folder:"xora/special-prizes/banner"});
      setBannerDraft(current=>({...current,imageUrl:result.url,enabled:true}));
      setMessage("Banner image uploaded. Save banner settings to publish it.");
    }catch(e){setMessage(e instanceof Error?e.message:"Banner upload failed.");}
    finally{setUploadingBanner(false);}
  }
  async function saveBanner(e:FormEvent){
    e.preventDefault();setBannerBusy(true);setMessage("");
    try{
      const result=await commerceFetch<{banner:Banner}>("/api/admin/commerce/special-prizes/banner",{method:"POST",body:JSON.stringify(bannerDraft)});
      setBannerDraft({...defaultBanner,...result.banner});
      setMessage("Special Prizes banner saved and published.");
    }catch(e){setMessage(e instanceof Error?e.message:"Could not save banner settings.");}
    finally{setBannerBusy(false);}
  }
  async function save(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{await commerceFetch("/api/admin/commerce/special-prizes",{method:"POST",body:JSON.stringify(draft)});setDraft(empty);setMessage("Saved. The public Special Prizes page now uses the updated settings.");await load();}catch(e){setMessage(e instanceof Error?e.message:"Could not save prize.");}finally{setBusy(false);}}
  async function toggle(p:Prize){setBusy(true);setMessage("");try{await commerceFetch("/api/admin/commerce/special-prizes/status",{method:"POST",body:JSON.stringify({id:p.id,status:p.status==="active"?"paused":"active"})});setMessage(p.status==="active"?"Prize paused; it will no longer appear to users.":"Prize reactivated; it is visible again.");await load();}catch(e){setMessage(e instanceof Error?e.message:"Could not change status.");}finally{setBusy(false);}}
  async function remove(p:Prize){
    if(!window.confirm(`Delete “${p.title}” from the Special Prizes catalogue? This removes it from users' view.`)) return;
    setBusy(true);setMessage("");
    try{await commerceFetch("/api/admin/commerce/special-prizes/delete",{method:"POST",body:JSON.stringify({id:p.id})});setMessage("Offer deleted from the public catalogue.");await load();}
    catch(e){setMessage(e instanceof Error?e.message:"Could not delete offer.");}
    finally{setBusy(false);}
  }
  return <AdminProtectedLayout title="Special Prizes" subtitle="Manage Golden Goose campaigns without releasing a new XoraTV app version." currentSectionId="commerce-special-prizes">
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Public page appearance</p><h2 className="mt-1 font-display text-xl font-semibold">Special Prizes banner</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Upload the banner image you want users to see at the top of the Special Prizes page.</p></div>
        <form onSubmit={saveBanner} className="space-y-3">
          <label className="block text-xs font-semibold">Upload banner image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingBanner||bannerBusy} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadBannerImage(file);e.currentTarget.value="";}} className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal"/><span className="mt-1 block text-[10px] font-normal text-muted-foreground">JPG, PNG or WebP · maximum 8 MB. Uploading a new image replaces the current draft image.</span></label>
          {uploadingBanner?<p className="text-xs text-muted-foreground">Uploading banner image…</p>:null}
          {bannerDraft.imageUrl?<div className="space-y-2 rounded-xl border border-border bg-background p-3"><img src={bannerDraft.imageUrl} alt="Special Prizes banner preview" className="max-h-56 w-full rounded-lg object-cover"/><button type="button" onClick={()=>setBannerDraft({...bannerDraft,imageUrl:"",enabled:false})} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Remove banner image</button></div>:<p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">No banner image selected. Upload an image to replace the default banner design.</p>}
          <label className="block text-xs font-semibold">Or paste a banner image URL<input type="url" value={bannerDraft.imageUrl} onChange={e=>setBannerDraft({...bannerDraft,imageUrl:e.target.value,enabled:Boolean(e.target.value.trim())})} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal" placeholder="https://…/banner.jpg"/></label>
          <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={bannerDraft.enabled} disabled={!bannerDraft.imageUrl} onChange={e=>setBannerDraft({...bannerDraft,enabled:e.target.checked})}/> Show this banner to users</label>
          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="relative min-h-32 bg-gradient-to-br from-primary/20 via-background to-secondary p-5" style={bannerDraft.enabled&&bannerDraft.imageUrl?{backgroundImage:`linear-gradient(90deg,rgba(20,16,20,.82),rgba(20,16,20,.25)),url("${bannerDraft.imageUrl}")`,backgroundSize:"cover",backgroundPosition:"center"}:undefined}>
              <p className={bannerDraft.enabled&&bannerDraft.imageUrl?"text-[10px] font-bold uppercase tracking-[.18em] text-white/80":"text-[10px] font-bold uppercase tracking-[.18em] text-primary"}>XoraTV Rewards</p>
            </div>
          </div>
          <button disabled={bannerBusy||uploadingBanner} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">{bannerBusy?<Loader2 className="size-4 animate-spin"/>:<Save className="size-4"/>}{bannerBusy?"Saving banner…":"Save banner"}</button>
        </form>
      </section>
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Live catalogue</p><h1 className="mt-1 font-display text-2xl font-semibold">{draft.id?"Edit special prize":"Add special prize"}</h1><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Add the offer details and either enter a Golden Goose campaign ID or paste the provider JavaScript/HTML snippet. Pasted code runs directly on the Special Prizes page and has access to that page. You can pause an offer at any time without updating the APK.</p></div>
        <form onSubmit={save} className="space-y-3">
          <label className="block text-xs font-semibold">Prize title<input required minLength={2} maxLength={100} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal" placeholder="e.g. NaijaLucky — Glo Nigeria"/></label>
          <div className="space-y-2"><label className="block text-xs font-semibold">Upload offer image (optional)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingImage||busy} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadPrizeImage(file);e.currentTarget.value="";}} className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal"/><span className="mt-1 block text-[10px] font-normal text-muted-foreground">Choose JPG, PNG or WebP · maximum 8 MB. The image is uploaded to Cloudinary.</span></label>
          {uploadingImage?<p className="text-xs text-muted-foreground">Uploading image…</p>:null}
          {draft.imageUrl?<div className="space-y-2 rounded-xl border border-border bg-background p-3"><img src={draft.imageUrl} alt="Offer preview" className="max-h-48 w-full rounded-lg object-contain"/><button type="button" onClick={()=>setDraft({...draft,imageUrl:""})} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Remove image</button><p className="break-all text-[10px] text-muted-foreground">{draft.imageUrl}</p></div>:null}
          <label className="block text-xs font-semibold">Or paste an image URL<input type="url" value={draft.imageUrl} onChange={e=>setDraft({...draft,imageUrl:e.target.value})} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal" placeholder="https://…/offer-image.jpg"/></label></div>
          <label className="block text-xs font-semibold">Short description<textarea maxLength={500} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} className="mt-1 min-h-20 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal" placeholder="Eligibility and what users should expect"/></label>
          <label className="block text-xs font-semibold">Full offer explanation<textarea maxLength={5000} value={draft.details} onChange={e=>setDraft({...draft,details:e.target.value})} rows={6} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal" placeholder="Explain what the user is signing up for, eligibility, requirements, important conditions and what to expect…"/></label>
          <label className="block text-xs font-semibold">Offer steps (one step per line)<textarea maxLength={10000} value={draft.steps.join("\n")} onChange={e=>setDraft({...draft,steps:e.target.value.split("\n").map(step=>step.trim()).filter(Boolean).slice(0,20)})} rows={5} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal" placeholder={"1. Open the provider offer\n2. Enter the required details\n3. Complete the subscription"} /><span className="mt-1 block text-[10px] font-normal text-muted-foreground">Up to 20 steps. These appear as a numbered guide before the user subscribes.</span></label>
          <label className="block text-xs font-semibold">SMS confirmation and follow-up<textarea maxLength={2000} value={draft.smsInstructions} onChange={e=>setDraft({...draft,smsInstructions:e.target.value})} rows={4} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal" placeholder="Explain which SMS or confirmation details the user should expect after a successful subscription, and any action they need to take…"/></label>
          <div className="space-y-2 rounded-xl border border-border bg-background p-3"><div><p className="text-xs font-semibold">Offer-flow screenshots</p><p className="mt-1 text-[10px] text-muted-foreground">Upload screenshots showing what users will see during the offer flow. You can add up to 12 images (8 MB each).</p></div><input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploadingScreenshots||busy} onChange={e=>{if(e.target.files?.length)void uploadFlowScreenshots(e.target.files);e.currentTarget.value="";}} className="block w-full text-xs"/>{uploadingScreenshots?<p className="text-xs text-muted-foreground">Uploading screenshots…</p>:null}{draft.screenshots.length?<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{draft.screenshots.map((url,index)=><div key={url} className="relative overflow-hidden rounded-lg border border-border"><img src={url} alt={"Offer flow screenshot "+(index+1)} className="aspect-[4/3] w-full object-cover"/><button type="button" onClick={()=>setDraft(current=>({...current,screenshots:current.screenshots.filter((_,i)=>i!==index)}))} className="absolute right-1 top-1 rounded-md bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">Remove</button><p className="p-1.5 text-[10px] text-muted-foreground">Step image {index+1}</p></div>)}</div>:<p className="rounded-lg border border-dashed border-border p-3 text-[10px] text-muted-foreground">No flow screenshots uploaded yet. You can add the images when you provide them.</p>}</div>
          <label className="block text-xs font-semibold">Golden Goose campaign ID (optional if you paste code)<input value={draft.campaignId} onChange={e=>setDraft({...draft,campaignId:e.target.value})} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 font-mono text-sm font-normal" placeholder="Campaign ID from the campaign tool"/></label>
          <label className="block text-xs font-semibold">Provider JavaScript / HTML snippet (optional)<textarea value={draft.scriptSnippet} onChange={e=>setDraft({...draft,scriptSnippet:e.target.value})} maxLength={20000} className="mt-1 min-h-36 w-full rounded-xl border border-border bg-background px-3 py-3 font-mono text-xs font-normal" placeholder={'Paste the provider’s <script> snippet or embed code here…'} /><span className="mt-1 block text-[10px] font-normal text-muted-foreground">If supplied, this snippet is used instead of the generated Golden Goose script. Maximum 20,000 characters. This code runs without a sandbox and can access the XoraTV page, so only paste code from a provider you trust.</span></label>
          <label className="block text-xs font-semibold">Offer payout currency<select value={draft.currency} onChange={e=>setDraft({...draft,currency:e.target.value})} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal">{["USD","NGN","EUR","GBP","GHS","KES","ZAR"].map(currency=><option key={currency} value={currency}>{currency}</option>)}</select><span className="mt-1 block text-[10px] font-normal text-muted-foreground">Creator's 35% share is recorded in this currency. It is not automatically converted to naira.</span></label>
          <div className="rounded-xl border border-border/70 bg-background p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Provider setup preview</p>{draft.scriptSnippet.trim()?<p className="mt-1 text-xs text-muted-foreground">Pasted snippet runs directly on the Special Prizes page without a sandbox.</p>:<code className="mt-1 block break-all text-xs">https://ngglznw.com/bc/{draft.campaignId || "{campaign_id}"}.js?force_https=1</code>}</div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-xs font-semibold">Creator commission & postback</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Creators receive 35% of confirmed, attributed Golden Goose revenue. Before enabling real commissions, set the Render environment variable <code>GOLDENGOOSE_POSTBACK_SECRET</code> and configure the provider's postback with this template (replace YOUR_SECRET with the same value):</p><code className="mt-2 block break-all rounded-lg bg-background p-2 text-[10px]">https://xoratv-x.onrender.com/api/webhooks/goldengoose?key=YOUR_SECRET&amp;p1={"{p1}"}&amp;p2={"{p2}"}&amp;event_id={"{event_id}"}&amp;event={"{event}"}&amp;profit={"{profit}"}</code><p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">The provider script is given p1/p2 attribution parameters, but those values must be verified in a real/test postback before treating commissions as production-ready.</p></div>
          <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={draft.status==="active"} onChange={e=>setDraft({...draft,status:e.target.checked?"active":"paused"})}/> Publish this prize immediately</label>
          <div className="flex flex-wrap gap-2"><button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy?<Loader2 className="size-4 animate-spin"/>:<Save className="size-4"/>}{busy?"Saving…":"Save prize"}</button>{draft.id?<button type="button" onClick={()=>setDraft(empty)} className="rounded-xl border border-border px-4 py-3 text-sm font-semibold">Cancel edit</button>:null}</div>
        </form>
      </section>
      {message?<p className="rounded-xl border border-border bg-muted/20 p-3 text-sm">{message}</p>:null}
      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-display text-xl font-semibold">Saved prizes ({prizes.length})</h2><button type="button" onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-semibold"><RefreshCw className={loading?"size-3.5 animate-spin":"size-3.5"}/>Refresh</button></div>
        {loading&&!prizes.length?<p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">Loading catalogue…</p>:null}
        {prizes.map(p=><article key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{p.title}</h3><span className={p.status==="active"?"rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600":"rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold text-muted-foreground"}>{p.status}</span></div><p className="mt-1 break-all text-[11px] text-muted-foreground">Campaign: {p.campaignId||"custom snippet"} · {p.currency||"USD"} · Opens: {p.clicks}</p><p className="mt-1 text-xs text-muted-foreground">{p.description}</p>{p.imageUrl?<p className="mt-1 break-all text-[10px] text-muted-foreground">Image: {p.imageUrl}</p>:null}{p.scriptSnippet?<p className="mt-1 text-[10px] text-primary">Custom provider snippet saved</p>:null}</div><button disabled={busy} type="button" onClick={()=>void toggle(p)} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50">{p.status==="active"?<ToggleRight className="size-4"/>:<ToggleLeft className="size-4"/>}{p.status==="active"?"Pause":"Activate"}</button><button disabled={busy} type="button" onClick={()=>edit(p)} className="rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50">Edit</button><button disabled={busy} type="button" onClick={()=>void remove(p)} className="inline-flex items-center gap-1 rounded-full border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"><Trash2 className="size-3.5"/>Delete</button></article>)}
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Attribution</p><h2 className="mt-1 font-display text-xl font-semibold">Promotion traffic ({traffic.length})</h2><p className="mt-1 text-xs text-muted-foreground">Each tracked visit shows its traffic source, the creator account and the Special Prize that was opened.</p></div>
          <button type="button" onClick={()=>void load()} className="rounded-full border border-border px-3 py-2 text-xs font-semibold">Refresh traffic</button>
        </div>
        {traffic.length===0 ? <div className="rounded-2xl border border-dashed border-border bg-surface p-5 text-sm text-muted-foreground">No attributed Special Prize visits have been recorded yet. Visits through creator promotion links will appear here.</div> : (
          <div className="space-y-2">
            {traffic.map(item=><article key={item.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><p className="text-sm font-semibold">{item.creatorDisplayName || "Xora Creator"} <span className="font-normal text-muted-foreground">{item.creatorUsername ? `@${item.creatorUsername}` : `· ${item.creatorId}`}</span></p><p className="mt-1 text-xs text-muted-foreground">Special Prize: <span className="font-medium text-foreground">{item.prizeTitle}</span></p></div>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold capitalize text-primary">{item.sourceType}</span>
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div className="rounded-xl bg-background p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Traffic source</p><p className="mt-1 break-all font-semibold">{item.source || "Direct / unknown"}</p>{item.referrerHost && item.referrerHost!==item.source?<p className="mt-1 break-all text-[10px] text-muted-foreground">Referrer: {item.referrerHost}</p>:null}</div>
                <div className="rounded-xl bg-background p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Visit details</p><p className="mt-1">{new Date(item.clickedAt).toLocaleString()}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.medium ? `Medium: ${item.medium}` : "No medium tag"}{item.campaign ? ` · Campaign: ${item.campaign}` : ""}</p>{item.postId?<p className="mt-1 text-[10px] text-muted-foreground">Video post: {item.postId}</p>:null}</div>
              </div>
            </article>)}
          </div>
        )}
      </section>
    </div>
  </AdminProtectedLayout>;
}
