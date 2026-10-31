import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Gift, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { commerceFetch } from "@/lib/commerce";

export const Route = createFileRoute("/special-prizes")({ component: SpecialPrizes });

type Prize = { id: string; title: string; description: string; details?: string; steps?: string[]; smsInstructions?: string; screenshots?: string[]; campaignId: string; imageUrl?: string; scriptSnippet?: string; status: "active" | "paused"; clicks: number };
type Banner = { enabled: boolean; imageUrl: string; title: string; subtitle: string };
const defaultBanner: Banner = { enabled: false, imageUrl: "", title: "Special Prizes", subtitle: "Explore special offers selected for XoraTV." };
function SpecialPrizes() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [banner, setBanner] = useState<Banner>(defaultBanner);
  const [selected, setSelected] = useState<Prize | null>(null);
  const [providerStarted, setProviderStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const [promotionToken, setPromotionToken] = useState("");
  const [promotionClickId, setPromotionClickId] = useState("");
  const [promotionClickPrizeId, setPromotionClickPrizeId] = useState("");
  const [requestedPrizeUnavailable, setRequestedPrizeUnavailable] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const result = await commerceFetch<{ prizes: Prize[]; banner?: Banner }>("/api/commerce/special-prizes");
      setPrizes(Array.isArray(result.prizes) ? result.prizes : []);
      setBanner({ ...defaultBanner, ...(result.banner || {}) });
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get("offer");
      setPromotionToken(params.get("promo") || "");
      setPromotionClickId(params.get("click") || "");
      setPromotionClickPrizeId(wanted || "");
      const matchingPrize = wanted ? (result.prizes || []).find((p) => p.id === wanted) || null : null;
      setSelected(matchingPrize);
      setRequestedPrizeUnavailable(Boolean(wanted && !matchingPrize));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load special prizes.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    setScriptReady(false);
    if (!selected || !providerStarted) return;
    const mount = document.getElementById("golden-goose-prize-script");
    if (!mount) return;
    mount.replaceChildren();
    if (selected.scriptSnippet?.trim()) {
      const snippet = selected.scriptSnippet.trim()
        .replaceAll("{{p1}}", encodeURIComponent(
          promotionClickId && promotionClickPrizeId === selected.id ? promotionClickId : promotionToken,
        ))
        .replaceAll("{{p2}}", encodeURIComponent(selected.id));
      const looksLikeMarkup = /<\s*[a-z!/]/i.test(snippet);
      if (looksLikeMarkup) {
        const template = document.createElement("template");
        template.innerHTML = snippet;
        const nodes = Array.from(template.content.childNodes);
        for (const node of nodes) {
          if (node instanceof HTMLScriptElement) {
            const liveScript = document.createElement("script");
            for (const attribute of Array.from(node.attributes)) liveScript.setAttribute(attribute.name, attribute.value);
            liveScript.onload = () => setScriptReady(true);
            liveScript.onerror = () => setError("The provider script could not load. Check the provider URL and try again.");
            liveScript.textContent = node.textContent;
            mount.appendChild(liveScript);
            if (!liveScript.src) setScriptReady(true);
          } else {
            mount.appendChild(node.cloneNode(true));
          }
        }
      } else {
        const liveScript = document.createElement("script");
        liveScript.textContent = snippet;
        mount.appendChild(liveScript);
        setScriptReady(true);
      }
      return () => { mount.replaceChildren(); };
    }
    if (!selected.campaignId) {
      setError("This offer has no provider script configured.");
      return;
    }
    const note = document.createElement("p");
    note.className = "mb-3 text-xs text-muted-foreground";
    note.textContent = "Connecting to the offer provider…";
    mount.appendChild(note);
    const script = document.createElement("script");
    const providerUrl = new URL(`https://ngglznw.com/bc/${encodeURIComponent(selected.campaignId)}.js`);
    providerUrl.searchParams.set("force_https", "1");
    const attributionP1 = promotionClickId && promotionClickPrizeId === selected.id
      ? promotionClickId
      : promotionToken;
    if (attributionP1) providerUrl.searchParams.set("p1", attributionP1);
    providerUrl.searchParams.set("p2", selected.id);
    script.src = providerUrl.toString();
    script.async = true;
    script.onload = () => { setScriptReady(true); note.remove(); };
    script.onerror = () => { setError("The offer provider script could not load. Please try again later."); note.textContent = "The provider script could not be loaded."; };
    mount.appendChild(script);
    return () => { mount.replaceChildren(); };
  }, [selected?.id, selected?.campaignId, selected?.scriptSnippet, selected?.title, promotionToken, promotionClickId, promotionClickPrizeId, providerStarted]);

  async function openPrize(prize: Prize) {
    setError("");
    try {
      await commerceFetch("/api/commerce/special-prizes/click", { method: "POST", body: JSON.stringify({ id: prize.id }) });
      setSelected(prize);\n      setProviderStarted(false);
      const promoQuery = promotionToken ? `&promo=${encodeURIComponent(promotionToken)}` : "";
      const clickQuery = promotionClickId && promotionClickPrizeId === prize.id
        ? `&click=${encodeURIComponent(promotionClickId)}`
        : "";
      window.history.replaceState({}, "", `/special-prizes?offer=${encodeURIComponent(prize.id)}${promoQuery}${clickQuery}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { setError(e instanceof Error ? e.message : "This prize is no longer available."); await load(); }
  }

  return <AppShell wide>
    <div className="mx-auto max-w-5xl space-y-5">
      { !selected && banner.enabled && banner.imageUrl ? <header className="overflow-hidden rounded-[26px] border border-primary/15 bg-black/5 shadow-card"><img src={banner.imageUrl} alt="Special Prizes banner" className="block h-auto max-h-[75vh] w-full object-contain" /></header> : <header className="relative overflow-hidden rounded-[26px] border border-primary/15 bg-gradient-to-br from-primary/12 via-background to-secondary p-5 sm:p-7">
        {selected ? <button type="button" onClick={() => { setSelected(null); setRequestedPrizeUnavailable(false); window.history.replaceState({}, "", "/special-prizes"); }} className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground"><ArrowLeft className="size-4"/>All special prizes</button> : null}
        <div className="flex items-center gap-3">
          {selected?.imageUrl ? <img src={selected.imageUrl} alt="" className="size-12 rounded-2xl object-cover shadow-card" /> : !banner.enabled || !banner.imageUrl ? <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-card"><Gift className="size-6"/></span> : null}
          <div><p className={banner.enabled && banner.imageUrl && !selected ? "text-[10px] font-bold uppercase tracking-[.18em] text-white/80" : "text-[10px] font-bold uppercase tracking-[.18em] text-primary"}>XoraTV Rewards</p><h1 className={banner.enabled && banner.imageUrl && !selected ? "font-display text-2xl font-extrabold text-white sm:text-3xl" : "font-display text-2xl font-extrabold sm:text-3xl"}>{selected ? selected.title : banner.enabled && banner.imageUrl ? banner.title : "Special Prizes"}</h1></div>
        </div>
        {selected || !banner.enabled || !banner.imageUrl ? <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{selected ? (selected.description || "Follow the offer provider's instructions to participate.") : "Explore special offers selected for XoraTV. Availability is updated online, so offers can be paused or replaced without updating the app."}</p> : null}
      </header> }

      {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {requestedPrizeUnavailable && !selected ? <section className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center"><Gift className="mx-auto size-8 text-muted-foreground"/><h2 className="mt-3 font-semibold">This Special Prize is no longer available</h2><p className="mt-1 text-sm text-muted-foreground">The campaign may have ended or been paused by XoraTV. No action is needed on your side.</p><button type="button" onClick={() => { setRequestedPrizeUnavailable(false); window.history.replaceState({}, "", "/special-prizes"); }} className="mt-4 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Browse available prizes</button></section> : null}
      {selected ? <section className="space-y-4">
        <article className="overflow-hidden rounded-[28px] border border-primary/15 bg-surface shadow-card">
          {selected.imageUrl?<img src={selected.imageUrl} alt={selected.title} className="max-h-72 w-full object-cover"/>:null}
          <div className="space-y-5 p-5 sm:p-7">
            <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Before you subscribe</p><h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">{selected.title}</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-muted-foreground">{selected.description || "Review the offer details and steps below before continuing."}</p></div>
            {selected.details?<div className="rounded-2xl border border-border bg-background p-4 sm:p-5"><h3 className="text-sm font-bold">About this offer</h3><p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">{selected.details}</p></div>:null}
            {selected.steps?.length?<div className="rounded-2xl border border-border bg-background p-4 sm:p-5"><h3 className="text-sm font-bold">How the offer works</h3><ol className="mt-3 space-y-3">{selected.steps.map((step,index)=><li key={index} className="flex items-start gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index+1}</span><p className="pt-1 text-sm leading-6 text-muted-foreground">{step}</p></li>)}</ol></div>:null}
            {selected.screenshots?.length?<div><h3 className="text-sm font-bold">What you'll see during the process</h3><p className="mt-1 text-xs text-muted-foreground">These screenshots help you understand the provider flow before you continue.</p><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{selected.screenshots.map((url,index)=><figure key={url} className="overflow-hidden rounded-xl border border-border bg-background"><img src={url} alt={selected.title+" offer flow, screenshot "+(index+1)} loading="lazy" className="aspect-[4/5] w-full object-cover"/><figcaption className="p-2 text-[10px] font-medium text-muted-foreground">Process view {index+1}</figcaption></figure>)}</div></div>:null}
            {selected.smsInstructions?<div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5"><h3 className="text-sm font-bold">SMS and confirmation details</h3><p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">{selected.smsInstructions}</p></div>:null}
            <div className="rounded-2xl border border-border bg-background p-4"><p className="text-xs font-semibold">Please read before continuing</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The provider controls subscription eligibility, confirmation and any reward. XoraTV cannot guarantee that every attempt will be accepted. Only continue if you understand the offer and agree to the provider's terms.</p></div>
            {!providerStarted?<button type="button" onClick={()=>{setProviderStarted(true);window.setTimeout(()=>document.getElementById("golden-goose-prize-script")?.scrollIntoView({behavior:"smooth",block:"start"}),80);}} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-md transition-transform hover:-translate-y-0.5">Subscribe <ArrowUpRight className="size-4"/></button>:null}
          </div>
        </article>
        {providerStarted?<section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Secure offer provider</p><p className="mt-1 text-xs text-muted-foreground">Continue with the provider's subscription steps below.</p></div><span className="rounded-full bg-secondary px-3 py-1 text-[10px] font-semibold">{scriptReady ? "Connected" : "Connecting"}</span></div>
          <div id="golden-goose-prize-script" className="min-h-24 rounded-xl border border-border/60 bg-background p-3" />
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">If you complete the subscription successfully, check the SMS or confirmation details described above. Keep any confirmation message until the provider has verified your participation.</p>
        </section>:null}
      </section> : <section className="space-y-3">
        {loading && !prizes.length ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-border p-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin"/>Loading special prizes…</div> : null}
        {!loading && !prizes.length && !error ? <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center"><Sparkles className="mx-auto size-8 text-primary"/><h2 className="mt-3 font-semibold">No special prizes available right now</h2><p className="mt-1 text-sm text-muted-foreground">Please check back later.</p></div> : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {prizes.map((prize) => <article key={prize.id} className="group flex h-full flex-col overflow-hidden rounded-[26px] border border-primary/15 bg-surface shadow-card transition-shadow hover:shadow-lg">
          <div className="relative flex min-h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-primary/10 via-background to-secondary sm:min-h-44">
            {prize.imageUrl ? <img src={prize.imageUrl} alt="" loading="lazy" className="h-44 w-full object-cover sm:h-52" /> : <span className="grid size-20 place-items-center rounded-3xl bg-primary/10 text-primary"><Gift className="size-9"/></span>}
          </div>
          <div className="flex flex-1 flex-col p-5 sm:p-6">
            <h2 className="text-lg font-bold leading-snug sm:text-xl">{prize.title}</h2>
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{prize.description || "Tap below to explore the provider's offer."}</p>
            <p className="mt-3 text-[11px] text-muted-foreground">Availability may change according to provider terms.</p>
            <button type="button" onClick={() => void openPrize(prize)} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-md transition-transform hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              Explore offer <ArrowUpRight className="size-4"/>
            </button>
          </div>
        </article>)}
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="mx-auto flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold"><RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"}/>Refresh prizes</button>
      </section>}
      <p className="text-center text-[11px] text-muted-foreground">Offers may be changed or paused by XoraTV at any time. Third-party terms apply.</p>
    </div>
  </AppShell>;
}
