import { FormEvent, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, CheckCircle2, Clock3, ExternalLink, Film, FileVideo, Globe, ListVideo, LoaderCircle, Search, SearchCheck, Video, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SourceResult = {
  title: string;
  url: string;
  snippet: string;
  sourceType: "direct-video" | "hls" | "iptv-playlist" | "video-page" | "webpage";
  exactTitleMatch: boolean;
  host: string;
};
type SearchResponse = {
  ok: boolean;
  query?: string;
  engine?: string;
  discoveryBackend?: string;
  elapsedMs?: number;
  count?: number;
  results?: SourceResult[];
  note?: string;
  error?: string;
};

export const Route = createFileRoute("/source-lab")({
  head: () => ({
    meta: [
      { title: "XoraTV Source Engine Lab" },
      { name: "description", content: "Private test bench for XoraTV web source discovery." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: SourceLabPage,
});

const typeInfo: Record<SourceResult["sourceType"], { label: string; icon: typeof Video; description: string }> = {
  "direct-video": { label: "Direct video URL", icon: FileVideo, description: "A video file URL is visible in the search result." },
  hls: { label: "HLS playlist (.m3u8)", icon: ListVideo, description: "An HLS playlist URL is visible in the search result." },
  "iptv-playlist": { label: "M3U playlist", icon: ListVideo, description: "An M3U playlist URL is visible in the search result." },
  "video-page": { label: "Video / sharing page", icon: Video, description: "A known video-hosting or sharing page." },
  webpage: { label: "Webpage — inspect needed", icon: Globe, description: "A page result; playable media has not yet been verified." },
};

function SourceLabPage() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [payload, setPayload] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runSearch(event?: FormEvent, nextQuery = query) {
    event?.preventDefault();
    const cleaned = nextQuery.trim();
    if (cleaned.length < 2 || loading) return;
    setQuery(cleaned);
    setSubmittedQuery(cleaned);
    setLoading(true);
    setError("");
    setPayload(null);
    try {
      const response = await fetch("/api/source-search?q=" + encodeURIComponent(cleaned) + "&limit=12", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json()) as SearchResponse;
      if (!response.ok || !data.ok) throw new Error(data.error || "Search failed.");
      setPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not run the search.");
    } finally {
      setLoading(false);
    }
  }

  const resultList = payload?.results || [];

  return (
    <main className="min-h-screen bg-[#f8f5ef] px-4 py-6 text-[#211d2c] sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-[#7c5cfc] text-white shadow-sm"><SearchCheck className="size-5" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#7c5cfc]">XoraTV internal test</p>
              <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Source Engine Lab</h1>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#e5deef] bg-white/80 px-3 py-1.5 text-xs text-[#625b70]"><span className="size-2 rounded-full bg-amber-400" /> Prototype</span>
        </header>

        <section className="overflow-hidden rounded-3xl border border-[#e5deef] bg-white shadow-sm">
          <div className="bg-gradient-to-br from-[#f1eaff] via-[#fffaf1] to-[#eaf7f0] p-5 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c5cfc]">Web discovery test bench</p>
            <h2 className="mt-3 max-w-2xl font-display text-2xl font-semibold tracking-tight sm:text-4xl">Search for a title. Inspect what the web returns.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#625b70]">Try exact movie names, older films, cartoons, episode titles, or a specific format such as an HLS or M3U playlist. Results show what discovery found—not a promise that every page contains playable video.</p>
            <form onSubmit={(event) => void runSearch(event)} className="mt-6 flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#827995]" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. The 1990s movie title" className="h-12 rounded-xl border-[#ddd4ed] bg-white pl-10 text-base" />
              </div>
              <Button type="submit" disabled={loading || query.trim().length < 2} className="h-12 rounded-xl bg-[#7c5cfc] px-5 text-white hover:bg-[#6848e8]">
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />} Search web
              </Button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {["The Mask 1994", "The Mummy 1999", "Tom and Jerry classic cartoon", "public domain feature film"].map((example) => (
                <button key={example} type="button" disabled={loading} onClick={() => { setQuery(example); void runSearch(undefined, example); }} className="rounded-full border border-[#e2d9f0] bg-white/75 px-3 py-1.5 text-xs font-medium text-[#51466a] transition hover:border-[#7c5cfc] hover:bg-white disabled:opacity-50">{example}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px border-t border-[#eee8f5] bg-[#eee8f5] sm:grid-cols-4">
            <Metric icon={Search} label="Results found" value={payload ? String(payload.count ?? 0) : "—"} />
            <Metric icon={Clock3} label="Search time" value={payload ? `${payload.elapsedMs ?? 0} ms` : "—"} />
            <Metric icon={CheckCircle2} label="Title matches" value={payload ? String(resultList.filter((item) => item.exactTitleMatch).length) : "—"} />
            <Metric icon={Film} label="Stream URLs" value={payload ? String(resultList.filter((item) => item.sourceType === "direct-video" || item.sourceType === "hls" || item.sourceType === "iptv-playlist").length) : "—"} />
          </div>
        </section>

        {loading && <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#e5deef] bg-white p-8 text-sm text-[#625b70]"><LoaderCircle className="size-5 animate-spin text-[#7c5cfc]" /> Searching the web and collecting result details…</div>}
        {error && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><XCircle className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">Search failed</p><p className="mt-1">{error}</p></div></div>}

        {payload && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7c5cfc]">Search report</p><h2 className="mt-1 font-display text-xl font-semibold">Results for “{submittedQuery}”</h2></div>
              <span className="text-xs text-[#746b83]">{payload.count || 0} results · {payload.discoveryBackend}</span>
            </div>
            {!resultList.length && <div className="rounded-2xl border border-dashed border-[#d9d0e8] bg-white p-8 text-center"><Search className="mx-auto size-7 text-[#a39ab3]" /><p className="mt-3 font-semibold">No results returned</p><p className="mt-1 text-sm text-[#746b83]">Try a shorter title or add the release year.</p></div>}
            <div className="space-y-3">
              {resultList.map((result, index) => {
                const info = typeInfo[result.sourceType];
                const Icon = info.icon;
                return (
                  <article key={result.url} className="rounded-2xl border border-[#e5deef] bg-white p-4 shadow-sm sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f2edff] text-[#7c5cfc]"><Icon className="size-5" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#887d9d]">Result {index + 1}</span>
                          {result.exactTitleMatch && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Title phrase matched</span>}
                          <span className="rounded-full bg-[#f4f1f8] px-2 py-0.5 text-[10px] font-medium text-[#625b70]">{info.label}</span>
                        </div>
                        <h3 className="mt-2 break-words font-semibold leading-6 text-[#292333]">{result.title}</h3>
                        <p className="mt-1 break-all text-xs text-[#7c5cfc]">{result.host}</p>
                        {result.snippet && <p className="mt-2 text-sm leading-6 text-[#625b70]">{result.snippet}</p>}
                        <p className="mt-2 text-xs leading-5 text-[#8b8299]">{info.description}</p>
                        <a href={result.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#ddd4ed] px-3 py-2 text-xs font-semibold text-[#51466a] transition hover:border-[#7c5cfc] hover:bg-[#f8f5ff]">
                          Open source page <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                      <span className="hidden shrink-0 text-xs tabular-nums text-[#a39ab3] sm:block">#{index + 1}</span>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="rounded-2xl border border-[#e5deef] bg-white p-4 text-xs leading-5 text-[#746b83]">{payload.note}</p>
          </section>
        )}

        <section className="rounded-2xl border border-[#e5deef] bg-white p-4 sm:p-5">
          <div className="flex items-start gap-3"><ArrowUpRight className="mt-0.5 size-5 text-[#7c5cfc]" /><div><h2 className="font-semibold">What this first test proves</h2><p className="mt-1 text-sm leading-6 text-[#625b70]">It measures web discovery, result quality, title matching, and visible stream-link formats. It does not yet crawl each result page or verify playback. That next stage should be added only after these initial searches return useful candidates.</p></div></div>
        </section>
      </div>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Search; label: string; value: string }) {
  return <div className="bg-white p-4 sm:p-5"><div className="flex items-center gap-2 text-[#827995]"><Icon className="size-4" /><span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span></div><p className="mt-2 font-display text-xl font-semibold text-[#292333]">{value}</p></div>;
}
