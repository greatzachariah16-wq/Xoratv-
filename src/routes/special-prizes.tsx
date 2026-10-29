import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Gift, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { commerceFetch } from "@/lib/commerce";

export const Route = createFileRoute("/special-prizes")({ component: SpecialPrizes });

type Prize = { id: string; title: string; description: string; campaignId: string; imageUrl?: string; scriptSnippet?: string; status: "active" | "paused"; clicks: number };
type Banner = { enabled: boolean; imageUrl: string; title: string; subtitle: string };
const defaultBanner: Banner = { enabled: false, imageUrl: "", title: "Special Prizes", subtitle: "Explore special offers selected for XoraTV." };
function SpecialPrizes() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [banner, setBanner] = useState<Banner>(defaultBanner);
  const [selected, setSelected] = useState<Prize | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const [promotionToken, setPromotionToken] = useState("");
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
    if (!selected) return;
    const mount = document.getElementById("golden-goose-prize-script");
    if (!mount) return;
    mount.replaceChildren();
    if (selected.scriptSnippet?.trim()) {
      const snippet = selected.scriptSnippet.trim()
        .replaceAll("{{p1}}", encodeURIComponent(promotionToken))
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
    if (promotionToken) providerUrl.searchParams.set("p1", promotionToken);
    providerUrl.searchParams.set("p2", selected.id);
    script.src = providerUrl.toString();
    script.async = true;
    script.onload = () => { setScriptReady(true); note.remove(); };
    script.onerror = () => { setError("The offer provider script could not load. Please try again later."); note.textContent = "The provider script could not be loaded."; };
    mount.appendChild(script);
    return () => { mount.replaceChildren(); };
  }, [selected?.id, selected?.campaignId, selected?.scriptSnippet, selected?.title, promotionToken]);

  async function openPrize(prize: Prize) {
    setError("");
    try {
      await commerceFetch("/api/commerce/special-prizes/click", { method: "POST", body: JSON.stringify({ id: prize.id }) });
      setSelected(prize);
      const promoQuery = promotionToken ? `&promo=${encodeURIComponent(promotionToken)}` : "";
      window.history.replaceState({}, "", `/special-prizes?offer=${encodeURIComponent(prize.id)}${promoQuery}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { setError(e instanceof Error ? e.message : "This prize is no longer available."); await load(); }
  }

  return <AppShell wide>
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="relative overflow-hidden rounded-[26px] border border-primary/15 bg-gradient-to-br from-primary/12 via-background to-secondary p-5 sm:p-7" style={!selected && banner.enabled && banner.imageUrl ? { backgroundImage: `linear-gradient(90deg,rgba(20,16,20,.82),rgba(20,16,20,.28)),url("${banner.imageUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        {selected ? <button type="button" onClick={() => { setSelected(null); setRequestedPrizeUnavailable(false); window.history.replaceState({}, "", "/special-prizes"); }} className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground"><ArrowLeft className="size-4"/>All special prizes</button> : null}
        <div className="flex items-center gap-3">
          {selected?.imageUrl ? <img src={selected.imageUrl} alt="" className="size-12 rounded-2xl object-cover shadow-card" /> : !banner.enabled || !banner.imageUrl ? <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-card"><Gift className="size-6"/></span> : null}
          <div><p className={banner.enabled && banner.imageUrl && !selected ? "text-[10px] font-bold uppercase tracking-[.18em] text-white/80" : "text-[10px] font-bold uppercase tracking-[.18em] text-primary"}>XoraTV Rewards</p><h1 className={banner.enabled && banner.imageUrl && !selected ? "font-display text-2xl font-extrabold text-white sm:text-3xl" : "font-display text-2xl font-extrabold sm:text-3xl"}>{selected ? selected.title : banner.title || "Special Prizes"}</h1></div>
        </div>
        <p className={banner.enabled && banner.imageUrl && !selected ? "mt-3 max-w-2xl text-sm leading-relaxed text-white/90" : "mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground"}>{selected ? (selected.description || "Follow the offer provider's instructions to participate.") : banner.subtitle || "Explore special offers selected for XoraTV. Availability is updated online, so offers can be paused or replaced without updating the app."}</p>
      </header>

      {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {requestedPrizeUnavailable && !selected ? <section className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center"><Gift className="mx-auto size-8 text-muted-foreground"/><h2 className="mt-3 font-semibold">This Special Prize is no longer available</h2><p className="mt-1 text-sm text-muted-foreground">The campaign may have ended or been paused by XoraTV. No action is needed on your side.</p><button type="button" onClick={() => { setRequestedPrizeUnavailable(false); window.history.replaceState({}, "", "/special-prizes"); }} className="mt-4 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Browse available prizes</button></section> : null}
      {selected ? <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Offer provider</p><p className="mt-1 text-xs text-muted-foreground">The provider campaign is loaded when you open this prize.</p></div><span className="rounded-full bg-secondary px-3 py-1 text-[10px] font-semibold">{scriptReady ? "Connected" : "Loading"}</span></div>
        <div id="golden-goose-prize-script" className="min-h-24 rounded-xl border border-border/60 bg-background p-3" />
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Only participate if the offer's terms and eligibility suit you. XoraTV cannot guarantee that an advertiser will accept every completion.</p>
      </section> : <section className="space-y-3">
        {loading && !prizes.length ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-border p-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin"/>Loading special prizes…</div> : null}
        {!loading && !prizes.length && !error ? <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center"><Sparkles className="mx-auto size-8 text-primary"/><h2 className="mt-3 font-semibold">No special prizes available right now</h2><p className="mt-1 text-sm text-muted-foreground">Please check back later.</p></div> : null}
        {prizes.map((prize) => <article key={prize.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:gap-4">
          {prize.imageUrl ? <img src={prize.imageUrl} alt="" loading="lazy" className="size-14 shrink-0 rounded-xl object-cover" /> : <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Gift className="size-5"/></span>}
          <div className="min-w-0 flex-1"><h2 className="font-semibold">{prize.title}</h2><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{prize.description || "Open to review the provider's offer."}</p><p className="mt-2 text-[10px] text-muted-foreground">Availability may change according to provider terms.</p></div>
          <button type="button" onClick={() => void openPrize(prize)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"><ArrowUpRight className="size-3.5"/>Open</button>
        </article>)}
        <button type="button" onClick={() => void load()} disabled={loading} className="mx-auto flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold"><RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"}/>Refresh prizes</button>
      </section>}
      <p className="text-center text-[11px] text-muted-foreground">Offers may be changed or paused by XoraTV at any time. Third-party terms apply.</p>
    </div>
  </AppShell>;
}
