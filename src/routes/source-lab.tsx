import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, CircleX, Film, LoaderCircle, Play, Radar, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

type PipelineResult = {
  ok: boolean; query?: string; title?: string; source?: string; identifier?: string;
  fileName?: string; fileSize?: string | number; metadataUrl?: string; mediaUrl?: string;
  streamUrl?: string; pinned?: boolean; pinNote?: string; elapsedMs?: number; error?: string; detail?: string;
};

export const Route = createFileRoute("/source-lab")({
  head: () => ({ meta: [
    { title: "XoraTV Media Lab" },
    { name: "description", content: "Keyword search and on-demand video playback diagnostics using Internet Archive metadata." },
    { name: "robots", content: "noindex, nofollow, noarchive" },
  ] }),
  component: SourceLabPage,
});

function SourceLabPage() {
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("Big Buck Bunny");
  const [result, setResult] = useState<PipelineResult | null>(null);

  async function runPipeline() {
    if (loading) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/source-ipfs", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      setResult((await response.json()) as PipelineResult);
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Could not contact the media pipeline." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8f5ef] px-4 py-6 text-[#211d2c] sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[#7c5cfc] text-white shadow-sm"><Film className="size-5" /></div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#7c5cfc]">XoraTV internal test</p>
            <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Media Lab</h1>
            <p className="mt-1 text-sm text-[#625b70]">Search Internet Archive by title and resolve a browser-facing video URL.</p>
          </div>
        </header>
        <section className="rounded-3xl border border-[#e5deef] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f2edff] text-[#6243d8]"><Search className="size-5" /></div>
            <div>
              <h2 className="font-display text-xl font-semibold">Search for a video</h2>
              <p className="mt-2 text-sm leading-6 text-[#625b70]">Enter a title or keyword. The lab searches Internet Archive metadata, inspects candidate item files, and returns a likely playable media URL. It does not download or pin the file, and it does not apply a license/rights filter.</p>
            </div>
          </div>
          <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void runPipeline(); }}>
            <input
              aria-label="Movie title or keyword"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={180}
              placeholder="Enter movie title or keyword"
              className="h-11 min-w-0 flex-1 rounded-xl border border-[#e5deef] bg-white px-3 text-sm outline-none focus:border-[#7c5cfc] focus:ring-2 focus:ring-[#7c5cfc]/20"
            />
            <Button type="submit" disabled={loading || !query.trim()} className="h-11 rounded-xl bg-[#7c5cfc] px-5 text-white hover:bg-[#6848e8]">
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Radar className="size-4" />}
              {loading ? "Searching archive…" : "Search and resolve"}
            </Button>
          </form>
          {loading && <p className="mt-3 text-sm text-[#625b70]">Searching the catalogue and checking for a browser-facing media file. This does not download the video.</p>}
          {result && <div className={`mt-5 rounded-2xl border p-4 ${result.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <p className={`flex items-center gap-2 font-semibold ${result.ok ? "text-emerald-900" : "text-amber-950"}`}>
              {result.ok ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
              {result.ok ? "Media result found" : "Media search could not complete"}
            </p>
            {result.ok ? <>
              <dl className="mt-3 space-y-2 break-words text-sm">
                <div><dt className="text-[#625b70]">Search query</dt><dd className="font-medium">{result.query}</dd></div>
                <div><dt className="text-[#625b70]">Matched result</dt><dd className="font-medium">{result.title}</dd></div>
                <div><dt className="text-[#625b70]">Provider</dt><dd className="font-medium">{result.source}</dd></div>
                <div><dt className="text-[#625b70]">Media file</dt><dd className="font-mono text-xs">{result.fileName}</dd></div>
                <div><dt className="text-[#625b70]">Direct media URL</dt><dd><a className="font-medium text-[#6243d8] underline" href={result.streamUrl} target="_blank" rel="noreferrer">{result.streamUrl}</a></dd></div>
                <div><dt className="text-[#625b70]">Item metadata</dt><dd><a className="font-medium text-[#6243d8] underline" href={result.metadataUrl} target="_blank" rel="noreferrer">{result.metadataUrl}</a></dd></div>
              </dl>
              <p className="mt-3 text-xs text-emerald-900">{result.pinNote}</p>
              {result.streamUrl && <a href={result.streamUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#6243d8]"><Play className="size-4" /> Open media URL</a>}
            </> : <>
              <p className="mt-2 break-words text-sm leading-6 text-amber-950">{result.error || "No result was returned."}</p>
              {result.detail && <p className="mt-2 break-words font-mono text-xs text-amber-900">{result.detail}</p>}
            </>}
            {result.elapsedMs !== undefined && <p className="mt-3 text-xs text-[#625b70]">Elapsed: {result.elapsedMs} ms</p>}
          </div>}
        </section>
      </div>
    </main>
  );
}
