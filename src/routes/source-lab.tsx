import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, CircleX, Film, LoaderCircle, Play, Radar, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

type PipelineResult = {
  ok: boolean; query?: string; title?: string; cid?: string; pinned?: boolean;
  pinNote?: string; streamUrl?: string; elapsedMs?: number; error?: string; detail?: string;
};

export const Route = createFileRoute("/source-lab")({
  head: () => ({ meta: [
    { title: "XoraTV IPFS Media Lab" },
    { name: "description", content: "Automated IPFS media discovery and on-demand gateway URL diagnostics." },
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
      const response = await fetch("/api/source-ipfs", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      setResult((await response.json()) as PipelineResult);
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Could not contact the IPFS pipeline." });
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
            <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">IPFS Media Lab</h1>
            <p className="mt-1 text-sm text-[#625b70]">Automated IPFS discovery and on-demand gateway playback.</p>
          </div>
        </header>
        <section className="rounded-3xl border border-[#e5deef] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f2edff] text-[#6243d8]"><Radar className="size-5" /></div>
            <div>
              <h2 className="font-display text-xl font-semibold">Search for a video</h2>
              <p className="mt-2 text-sm leading-6 text-[#625b70]">Enter a title or keyword. The lab searches the configured IPFS index and returns a CID and gateway URL when a match is found. It does not impose a hard-coded movie catalogue or license-metadata filter, and it does not recursively pin the result.</p>
            </div>
          </div>
          <input aria-label="Video title or keyword" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={180} placeholder="Enter video title or keyword" className="mt-5 h-11 w-full rounded-xl border border-[#e5deef] bg-white px-3 text-sm outline-none focus:border-[#7c5cfc]" />
          <Button type="button" onClick={() => void runPipeline()} disabled={loading || !query.trim()} className="mt-5 h-11 rounded-xl bg-[#7c5cfc] px-5 text-white hover:bg-[#6848e8]">
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Film className="size-4" />}
            {loading ? "Searching IPFS…" : "Run IPFS pipeline"}
          </Button>
          {loading && <p className="mt-3 text-sm text-[#625b70]">Checking the search index and preparing a gateway URL. Gateway playback still depends on the CID being available from the configured IPFS network.</p>}
          {result && <div className={`mt-5 rounded-2xl border p-4 ${result.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <p className={`flex items-center gap-2 font-semibold ${result.ok ? "text-emerald-900" : "text-amber-950"}`}>
              {result.ok ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
              {result.ok ? "IPFS result found" : "IPFS pipeline could not complete"}
            </p>
            {result.ok ? <>
              <dl className="mt-3 space-y-2 break-words text-sm">
                <div><dt className="text-[#625b70]">Automated query</dt><dd className="font-medium">{result.query}</dd></div>
                <div><dt className="text-[#625b70]">Matched result</dt><dd className="font-medium">{result.title}</dd></div>
                <div><dt className="text-[#625b70]">CID</dt><dd className="font-mono text-xs">{result.cid}</dd></div>
                <div><dt className="text-[#625b70]">Gateway URL</dt><dd><a className="font-medium text-[#6243d8] underline" href={result.streamUrl} target="_blank" rel="noreferrer">{result.streamUrl}</a></dd></div>
              </dl>
              <p className="mt-3 text-xs text-emerald-900">{result.pinNote}</p>
              {result.streamUrl && <a href={result.streamUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#6243d8]"><Play className="size-4" /> Open gateway URL</a>}
            </> : <>
              <p className="mt-2 break-words text-sm leading-6 text-amber-950">{result.error || "No result was returned."}</p>
              {result.detail && <p className="mt-2 break-words font-mono text-xs text-amber-900">{result.detail}</p>}
            </>}
            {result.elapsedMs !== undefined && <p className="mt-3 text-xs text-[#625b70]">Elapsed: {result.elapsedMs} ms</p>}
          </div>}
        </section>
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700" /><div>
            <h2 className="font-semibold text-amber-950">Deployment requirement</h2>
            <p className="mt-1 text-sm leading-6 text-amber-900">The configured IPFS gateway must be reachable from the client that opens the returned URL. Set IPFS_GATEWAY_URL (or KUBO_GATEWAY_URL) to the appropriate gateway. Render cannot automatically reach a gateway running only on your phone or computer. This pipeline does not require or expose the Kubo admin RPC endpoint.</p>
          </div></div>
        </section>
      </div>
    </main>
  );
}
