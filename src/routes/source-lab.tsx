import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, CircleX, Film, LoaderCircle, Play, Radar, ShieldAlert, Database } from "lucide-react";
import { Button } from "@/components/ui/button";

type SearchItem = { cid: string; title: string; path?: string; streamUrl: string; score?: number };
type PipelineResult = {
  ok: boolean; query?: string; title?: string; cid?: string; pinned?: boolean;
  pinNote?: string; streamUrl?: string; elapsedMs?: number; error?: string; detail?: string;
  results?: SearchItem[]; count?: number; indexSize?: number; indexedCount?: number;
  visitedDirectories?: number; message?: string; source?: string;
};

export const Route = createFileRoute("/source-lab")({
  head: () => ({ meta: [
    { title: "XoraTV IPFS Media Lab" },
    { name: "description", content: "Automatic IPFS metadata-index search and gateway availability checks." },
    { name: "robots", content: "noindex, nofollow, noarchive" },
  ] }),
  component: SourceLabPage,
});

function SourceLabPage() {
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [query, setQuery] = useState("Big Buck Bunny");
  const [seedCid, setSeedCid] = useState("");
  const [seedTitle, setSeedTitle] = useState("");
  const [result, setResult] = useState<PipelineResult | null>(null);

  async function runSearch() {
    if (loading || !query.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/source-ipfs-search", {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      setResult((await response.json()) as PipelineResult);
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Could not contact the local IPFS index." });
    } finally { setLoading(false); }
  }

  async function addSeed() {
    if (indexing || !seedCid.trim()) return;
    setIndexing(true);
    setResult(null);
    try {
      const response = await fetch("/api/source-ipfs-index", {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ cid: seedCid.trim(), title: seedTitle.trim() }),
      });
      setResult((await response.json()) as PipelineResult);
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Could not contact the local IPFS indexer." });
    } finally { setIndexing(false); }
  }

  async function testCid() {
    if (loading || !query.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/source-ipfs", {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      setResult((await response.json()) as PipelineResult);
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Could not contact the direct-CID test." });
    } finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen bg-[#f8f5ef] px-4 py-6 text-[#211d2c] sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[#7c5cfc] text-white shadow-sm"><Film className="size-5" /></div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#7c5cfc]">XoraTV internal test</p>
            <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">IPFS Media Lab</h1>
            <p className="mt-1 text-sm text-[#625b70]">Search existing IPFS metadata by title, check availability, and stream matches on demand.</p>
          </div>
        </header>

        <section className="rounded-3xl border border-[#e5deef] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f2edff] text-[#6243d8]"><Radar className="size-5" /></div>
            <div>
              <h2 className="font-display text-xl font-semibold">Search an existing IPFS index</h2>
              <p className="mt-2 text-sm leading-6 text-[#625b70]">Searches an existing IPFS metadata index for your title, checks whether matching video CIDs respond through a gateway, then falls back to XoraTV's local search. You do not need to know the CID. Video files are not downloaded or pinned.</p>
            </div>
          </div>
          <input aria-label="Video title or keyword" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={180} placeholder="Enter video title or keyword" className="mt-5 h-11 w-full rounded-xl border border-[#e5deef] bg-white px-3 text-sm outline-none focus:border-[#7c5cfc]" />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" onClick={() => void runSearch()} disabled={loading || indexing || !query.trim()} className="h-11 rounded-xl bg-[#7c5cfc] px-5 text-white hover:bg-[#6848e8]">
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Radar className="size-4" />}
              {loading ? "Searching…" : "Search IPFS index"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void testCid()} disabled={loading || indexing || !query.trim()} className="h-11 rounded-xl px-5">
              <Play className="size-4" /> Test direct CID
            </Button>
          </div>
        </section>

        <section className="rounded-3xl border border-[#e5deef] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f2edff] text-[#6243d8]"><Database className="size-5" /></div>
            <div>
              <h2 className="font-display text-xl font-semibold">Add a CID to the index</h2>
              <p className="mt-2 text-sm leading-6 text-[#625b70]">Paste a known IPFS CID. The indexer checks the gateway's directory listing and records video filenames it can see. It reads listing pages only; it does not fetch video bytes or pin content.</p>
            </div>
          </div>
          <label className="mt-4 block text-xs font-semibold text-[#625b70]">IPFS CID</label>
          <input aria-label="IPFS CID to index" value={seedCid} onChange={(event) => setSeedCid(event.target.value)} maxLength={160} placeholder="Qm… or bafy…" className="mt-2 h-11 w-full rounded-xl border border-[#e5deef] bg-white px-3 font-mono text-sm outline-none focus:border-[#7c5cfc]" />
          <label className="mt-4 block text-xs font-semibold text-[#625b70]">Optional title for this CID</label>
          <input aria-label="Optional title" value={seedTitle} onChange={(event) => setSeedTitle(event.target.value)} maxLength={240} placeholder="e.g. Big Buck Bunny collection" className="mt-2 h-11 w-full rounded-xl border border-[#e5deef] bg-white px-3 text-sm outline-none focus:border-[#7c5cfc]" />
          <Button type="button" onClick={() => void addSeed()} disabled={loading || indexing || !seedCid.trim()} className="mt-4 h-11 rounded-xl bg-[#7c5cfc] px-5 text-white hover:bg-[#6848e8]">
            {indexing ? <LoaderCircle className="size-4 animate-spin" /> : <Database className="size-4" />}
            {indexing ? "Indexing…" : "Add CID and scan directory"}
          </Button>
        </section>

        {result && <section className={`rounded-2xl border p-4 ${result.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <p className={`flex items-center gap-2 font-semibold ${result.ok ? "text-emerald-900" : "text-amber-950"}`}>
            {result.ok ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
            {result.ok ? (result.indexedCount !== undefined ? "CID indexing finished" : result.results ? "Search finished" : "IPFS test finished") : "IPFS task could not complete"}
          </p>
          {result.error && <p className="mt-2 break-words text-sm leading-6 text-amber-950">{result.error}</p>}
          {result.detail && <p className="mt-2 break-words font-mono text-xs text-amber-900">{result.detail}</p>}
          {result.message && <p className="mt-2 break-words text-sm leading-6">{result.message}</p>}
          {result.indexedCount !== undefined && <p className="mt-2 text-sm">Indexed records: <strong>{result.indexedCount}</strong> · Directories visited: <strong>{result.visitedDirectories ?? 0}</strong></p>}
          {result.results && <p className="mt-2 text-sm">Matches: <strong>{result.count ?? result.results.length}</strong> · Indexed records checked: <strong>{result.indexSize ?? 0}</strong></p>}
          {result.results && result.results.length > 0 && <div className="mt-4 space-y-3">
            {result.results.map((item) => <article key={item.cid} className="rounded-xl border border-[#e5deef] bg-white p-3">
              <p className="break-words font-semibold">{item.title}</p>
              <p className="mt-1 break-all font-mono text-xs text-[#625b70]">{item.cid}</p>
              <a className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#6243d8] underline" href={item.streamUrl} target="_blank" rel="noreferrer"><Play className="size-4" /> Open stream gateway</a>
            </article>)}
          </div>}
          {result.ok && result.cid && <dl className="mt-3 space-y-2 break-words text-sm">
            <div><dt className="text-[#625b70]">CID</dt><dd className="font-mono text-xs">{result.cid}</dd></div>
            {result.streamUrl && <div><dt className="text-[#625b70]">Gateway URL</dt><dd><a className="font-medium text-[#6243d8] underline" href={result.streamUrl} target="_blank" rel="noreferrer">{result.streamUrl}</a></dd></div>}
            {result.pinNote && <p className="text-xs">{result.pinNote}</p>}
          </dl>}
          {result.elapsedMs !== undefined && <p className="mt-3 text-xs text-[#625b70]">Elapsed: {result.elapsedMs} ms</p>}
        </section>}

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700" /><div>
            <h2 className="font-semibold text-amber-950">Important</h2>
            <p className="mt-1 text-sm leading-6 text-amber-900">The external IPFS metadata index is a separate public service and may sometimes be unavailable. If it cannot find a playable match, XoraTV uses its existing fallback search. A CID can exist without being online, so results are checked against IPFS gateways before being shown. Playback streams through a gateway; video files are not downloaded or pinned.</p>
          </div></div>
        </section>
      </div>
    </main>
  );
}
