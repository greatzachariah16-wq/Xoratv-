import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, CheckCircle2, Clock3, ExternalLink, Film, FileVideo, Globe, ListVideo, LoaderCircle, Search, SearchCheck, Video, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SourceResult = {
  title: string;
  url: string;
  snippet: string;
  sourceType: "direct-video" | "hls" | "iptv-playlist" | "video-page" | "social-video" | "general-webpage";
  pageKind: string;
  publishedYear: number | null;
  exactTitleMatch: boolean;
  host: string;
  inspected: boolean;
  pageTitle?: string;
  mediaCandidates: Array<{ url: string; kind: "video" | "hls" | "playlist" | "embed"; title?: string; status?: string }>;
  playbackCheck: "not-checked" | "media-found" | "request-ok" | "request-failed";
  crawlDepth: number;
  indexedFromCache?: boolean;
};
type HttpTestResponse = {
  ok: boolean;
  testedUrl?: string;
  finalUrl?: string;
  status?: number;
  statusText?: string;
  responseOk?: boolean;
  contentType?: string;
  headers?: Record<string, string>;
  bodyPreview?: string;
  bodyBytesRead?: number;
  bodyTruncated?: boolean;
  redirects?: Array<{ status: number; url: string; location: string }>;
  elapsedMs?: number;
  runtime?: { language: string; nodeVersion: string; platform: string; pythonAvailable: boolean; pythonVersion: string | null; note: string };
  note?: string;
  error?: string;
  detail?: string;
};
type SearchResponse = {
  ok: boolean;
  query?: string;
  engine?: string;
  discoveryBackend?: string;
  yearFocus?: string;
  inspectedCount?: number;
  indexedPageCount?: number;
  indexPersistence?: string;
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
  "social-video": { label: "Social video page", icon: Video, description: "A social-platform page; check whether playback or embedding is available." },
  "general-webpage": { label: "General webpage", icon: Globe, description: "Inspect this page for an embedded player or share link." },
};

function SourceLabPage() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [payload, setPayload] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [httpTarget, setHttpTarget] = useState("");
  const [httpPayload, setHttpPayload] = useState<HttpTestResponse | null>(null);
  const [httpLoading, setHttpLoading] = useState(false);
  const [httpError, setHttpError] = useState("");

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

  async function runHttpTest(event?: FormEvent) {
    event?.preventDefault();
    const target = httpTarget.trim();
    if (target.length < 3 || httpLoading) return;
    setHttpLoading(true);
    setHttpError("");
    setHttpPayload(null);
    try {
      const response = await fetch("/api/source-http-test?url=" + encodeURIComponent(target), { headers: { Accept: "application/json" } });
      const data = (await response.json()) as HttpTestResponse;
      if (!response.ok && !data.status) throw new Error(data.error || "HTTP test failed.");
      setHttpPayload(data);
    } catch (cause) {
      setHttpError(cause instanceof Error ? cause.message : "Could not run the HTTP test.");
    } finally {
      setHttpLoading(false);
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
          <div className="border-b border-[#eee8f5] bg-[#fcfbff] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c5cfc]">Independent crawler runtime test</p>
            <h2 className="mt-2 font-display text-xl font-semibold tracking-tight sm:text-2xl">HTTP connection test</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#625b70]">Test a public domain or URL directly from the XoraTV Render server. This uses ordinary Node.js HTTP requests only—no Chromium, Puppeteer, torrent download, or changes to the existing YouTube/provider crawler.</p>
            <form onSubmit={(event) => void runHttpTest(event)} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Input value={httpTarget} onChange={(event) => setHttpTarget(event.target.value)} placeholder="Enter a domain or URL (e.g. https://example.com)" className="h-12 min-w-0 flex-1 rounded-xl border-[#ddd4ed] bg-white text-base" />
              <Button type="submit" disabled={httpLoading || httpTarget.trim().length < 3} className="h-12 rounded-xl bg-[#7c5cfc] px-5 text-white hover:bg-[#6848e8]">
                {httpLoading ? <LoaderCircle className="size-4 animate-spin" /> : <Globe className="size-4" />} Test HTTP
              </Button>
            </form>
            <p className="mt-2 text-xs text-[#827995]">The test follows a limited number of redirects, blocks private/internal addresses, limits response reading, and times out after 8 seconds.</p>
          </div>
          {httpLoading && <div className="flex items-center gap-3 p-5 text-sm text-[#625b70]"><LoaderCircle className="size-4 animate-spin text-[#7c5cfc]" /> Sending request from Render…</div>}
          {httpError && <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{httpError}</div>}
          {httpPayload && (
            <div className="space-y-4 p-4 sm:p-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-[#f8f5ff] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#827995]">HTTP status</p><p className="mt-1 text-lg font-semibold">{httpPayload.status ? httpPayload.status + (httpPayload.statusText ? " " + httpPayload.statusText : "") : httpPayload.error || "No response"}</p></div>
                <div className="rounded-xl bg-[#f8f5ff] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#827995]">Response time</p><p className="mt-1 text-lg font-semibold">{httpPayload.elapsedMs ?? "—"}{httpPayload.elapsedMs !== undefined ? " ms" : ""}</p></div>
                <div className="rounded-xl bg-[#f8f5ff] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#827995]">Content type</p><p className="mt-1 break-words text-sm font-semibold">{httpPayload.contentType || "—"}</p></div>
                <div className="rounded-xl bg-[#f8f5ff] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#827995]">Bytes read</p><p className="mt-1 text-lg font-semibold">{httpPayload.bodyBytesRead ?? "—"}{httpPayload.bodyTruncated ? "+" : ""}</p></div>
              </div>
              {httpPayload.testedUrl && <div className="text-xs leading-5 text-[#625b70]"><p><strong>Requested:</strong> <span className="break-all">{httpPayload.testedUrl}</span></p>{httpPayload.finalUrl && <p className="mt-1"><strong>Final URL:</strong> <span className="break-all">{httpPayload.finalUrl}</span></p>}</div>}
              {httpPayload.runtime && <div className="rounded-xl border border-[#e5deef] p-3"><p className="font-semibold text-sm">Render runtime</p><p className="mt-1 text-sm text-[#625b70]">{httpPayload.runtime.language} {httpPayload.runtime.nodeVersion} · {httpPayload.runtime.platform}</p><p className="mt-1 text-sm text-[#625b70]">Python: {httpPayload.runtime.pythonAvailable ? "Available (" + httpPayload.runtime.pythonVersion + ")" : "Not detected (not required for HTTP requests)"}</p></div>}
              {httpPayload.redirects && httpPayload.redirects.length > 0 && <div><p className="text-sm font-semibold">Redirects ({httpPayload.redirects.length})</p><div className="mt-1 space-y-1">{httpPayload.redirects.map((redirect, index) => <p key={index} className="break-all text-xs text-[#625b70]">{redirect.status}: {redirect.url} → {redirect.location}</p>)}</div></div>}
              {httpPayload.headers && <div><p className="text-sm font-semibold">Response headers</p><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-[#f8f5ff] p-3 text-xs leading-5 text-[#51466a]">{JSON.stringify(httpPayload.headers, null, 2)}</pre></div>}
              {httpPayload.bodyPreview && <div><p className="text-sm font-semibold">Response body preview</p><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-[#211d2c] p-3 text-xs leading-5 text-white">{httpPayload.bodyPreview}</pre></div>}
              {httpPayload.detail && <p className="text-xs text-[#746b83]">Technical detail: {httpPayload.detail}</p>}
              {httpPayload.note && <p className="text-xs leading-5 text-[#746b83]">{httpPayload.note}</p>}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-3xl border border-[#e5deef] bg-white shadow-sm">
          <div className="bg-gradient-to-br from-[#f1eaff] via-[#fffaf1] to-[#eaf7f0] p-5 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c5cfc]">Web discovery test bench</p>
            <h2 className="mt-3 max-w-2xl font-display text-2xl font-semibold tracking-tight sm:text-4xl">Search for a title. Inspect what the web returns.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#625b70]">Search movies released from 2000 onward. The engine biases results away from silent and black-and-white films, then labels each result by its apparent page or link type. Result metadata is a clue, not proof of playback.</p>
            <form onSubmit={(event) => void runSearch(event)} className="mt-6 flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#827995]" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Inception 2010, Black Panther 2018" className="h-12 rounded-xl border-[#ddd4ed] bg-white pl-10 text-base" />
              </div>
              <Button type="submit" disabled={loading || query.trim().length < 2} className="h-12 rounded-xl bg-[#7c5cfc] px-5 text-white hover:bg-[#6848e8]">
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />} Search web
              </Button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Inception 2010", "Black Panther 2018", "Extraction 2020", "Spider-Man: No Way Home 2021"].map((example) => (
                <button key={example} type="button" disabled={loading} onClick={() => { setQuery(example); void runSearch(undefined, example); }} className="rounded-full border border-[#e2d9f0] bg-white/75 px-3 py-1.5 text-xs font-medium text-[#51466a] transition hover:border-[#7c5cfc] hover:bg-white disabled:opacity-50">{example}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px border-t border-[#eee8f5] bg-[#eee8f5] sm:grid-cols-4">
            <Metric icon={Search} label="Results found" value={payload ? String(payload.count ?? 0) : "—"} />
            <Metric icon={Clock3} label="Search time" value={payload ? `${payload.elapsedMs ?? 0} ms` : "—"} />
            <Metric icon={CheckCircle2} label="Pages inspected" value={payload ? String(payload.inspectedCount ?? resultList.filter((item) => item.inspected).length) : "—"} />
            <Metric icon={Film} label="Pages with media hints" value={payload ? String(resultList.filter((item) => item.mediaCandidates?.length).length) : "—"} />
          </div>
        </section>

        {loading && <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#e5deef] bg-white p-8 text-sm text-[#625b70]"><LoaderCircle className="size-5 animate-spin text-[#7c5cfc]" /> Searching the web and inspecting returned HTML over HTTP…</div>}
        {error && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><XCircle className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">Search failed</p><p className="mt-1">{error}</p></div></div>}

        {payload && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7c5cfc]">Search report</p><h2 className="mt-1 font-display text-xl font-semibold">Results for “{submittedQuery}”</h2></div>
              <span className="text-xs text-[#746b83]">{payload.count || 0} results · {payload.discoveryBackend}</span>
            </div>
            {!resultList.length && <div className="rounded-2xl border border-dashed border-[#d9d0e8] bg-white p-8 text-center"><Search className="mx-auto size-7 text-[#a39ab3]" /><p className="mt-3 font-semibold">No results returned</p><p className="mt-1 text-sm text-[#746b83]">Try a shorter title, include the release year, or search a different title from 2000 onward.</p></div>}
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
                        <p className="mt-2 text-xs font-medium text-[#51466a]">Page type: {result.pageKind}{result.publishedYear ? " · Year mentioned: " + result.publishedYear : " · Year not detected"}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]"><span className={"rounded-full px-2 py-1 font-semibold " + (result.inspected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{result.inspected ? "HTTP page inspected" : "Search result only"}</span><span className={"rounded-full px-2 py-1 font-semibold " + (result.playbackCheck === "request-ok" ? "bg-emerald-50 text-emerald-700" : result.playbackCheck === "request-failed" ? "bg-red-50 text-red-700" : "bg-[#f4f1f8] text-[#625b70]")}>{result.playbackCheck === "request-ok" ? "Media request responded" : result.playbackCheck === "request-failed" ? "Media request failed" : result.playbackCheck === "media-found" ? "Media URL found, not confirmed" : "Playback not checked"}</span>{result.crawlDepth > 0 && <span className="rounded-full bg-[#f4f1f8] px-2 py-1 text-[#625b70]">Discovered link · depth {result.crawlDepth}</span>}{result.indexedFromCache && <span className="rounded-full bg-[#f4f1f8] px-2 py-1 text-[#625b70]">Index cache</span>}</div>
                        {result.pageTitle && result.pageTitle !== result.title && <p className="mt-2 text-xs text-[#746b83]">Browser page title: {result.pageTitle}</p>}
                        {result.snippet && <p className="mt-2 text-sm leading-6 text-[#625b70]">{result.snippet}</p>}
                        {result.mediaCandidates?.length > 0 && <div className="mt-3 rounded-xl border border-[#e5deef] bg-[#fcfbff] p-3"><p className="text-xs font-semibold text-[#51466a]">Media candidates found ({result.mediaCandidates.length})</p><div className="mt-2 space-y-2">{result.mediaCandidates.slice(0, 5).map((media) => <div key={media.url} className="min-w-0"><p className="text-[11px] font-semibold uppercase text-[#827995]">{media.kind}{media.status ? " · " + media.status : ""}</p><a href={media.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 block break-all text-xs text-[#7c5cfc] underline">{media.url}</a></div>)}</div></div>}
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
          <div className="flex items-start gap-3"><ArrowUpRight className="mt-0.5 size-5 text-[#7c5cfc]" /><div><h2 className="font-semibold">What this first test proves</h2><p className="mt-1 text-sm leading-6 text-[#625b70]">Searches are now biased toward movies from 2000 onward, and each result identifies its host and apparent page type (direct video, HLS, M3U, video-sharing, social video, or general webpage). The crawler opens a limited number of pages in Puppeteer, inspects rendered page content for video/source tags, embeds, metadata and JSON-LD, follows a few relevant links one level deep, and probes one media URL. A successful HTTP response does not guarantee playback because CORS, cookies, referrers, DRM, codecs and player compatibility can still prevent it.</p></div></div>
        </section>
      </div>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Search; label: string; value: string }) {
  return <div className="bg-white p-4 sm:p-5"><div className="flex items-center gap-2 text-[#827995]"><Icon className="size-4" /><span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span></div><p className="mt-2 font-display text-xl font-semibold text-[#292333]">{value}</p></div>;
}
