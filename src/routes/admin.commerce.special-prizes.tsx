import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, RefreshCw, Save, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { commerceFetch } from "@/lib/commerce";
import { uploadToCloudinary } from "@/lib/cloudinary";

export const Route = createFileRoute("/admin/commerce/special-prizes")({ component: SpecialPrizesAdmin });
type Prize = { id: string; title: string; description: string; campaignId: string; imageUrl: string; scriptSnippet: string; currency: string; status: "active" | "paused"; clicks: number; createdAt: string; updatedAt: string };
type Banner = { enabled: boolean; imageUrl: string; updatedAt?: string };
const defaultBanner: Banner = { enabled: false, imageUrl: "" };
const empty = { id: "", title: "", description: "", campaignId: "", imageUrl: "", scriptSnippet: "", currency: "USD", status: "active" as "active" | "paused" };
function SpecialPrizesAdmin() {
  const [prizes,setPrizes]=useState<Prize[]>([]);
  const [draft,setDraft]=useState(empty);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const [uploadingImage,setUploadingImage]=useState(false);
  const [bannerDraft,setBannerDraft]=useState<Banner>(defaultBanner);
  const [bannerBusy,setBannerBusy]=useState(false);
  const [uploadingBanner,setUploadingBanner]=useState(false);
  async function load(){setLoading(true);try{const [r,b]=await Promise.all([commerceFetch<{prizes:Prize[]}>("/api/admin/commerce/special-prizes"),commerceFetch<{banner:Banner}>("/api/admin/commerce/special-prizes/banner")]);setPrizes(r.prizes||[]);setBannerDraft({...defaultBanner,...(b.banner||{})});}catch(e){setMessage(e instanceof Error?e.message:"Could not load Special Prizes settings.");}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  function edit(p:Prize){setDraft({id:p.id,title:p.title,description:p.description,campaignId:p.campaignId,imageUrl:p.imageUrl||"",scriptSnippet:p.scriptSnippet||"",currency:p.currency||"USD",status:p.status});setMessage("");window.scrollTo({top:0,behavior:"smooth"});}
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
    </div>
  </AdminProtectedLayout>;
}
