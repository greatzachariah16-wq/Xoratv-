import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, CircleX, Film, HardDrive, LoaderCircle, Play, Radar, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

type PipelineResult = {
  ok: boolean; query?: string; title?: string; cid?: string; license?: string;
  licenseReference?: string; pinned?: boolean; pinNote?: string; streamUrl?: string;
  elapsedMs?: number; error?: string; detail?: string;
};

export const Route = createFileRoute("/source-lab")({
  head: () => ({ meta: [
    { title: "XoraTV IPFS Media Lab" },
    { name: "description", content: "Automated open-license IPFS discovery and local Kubo pinning diagnostics." },
    { name: "robots", content: "noindex, nofollow, noarchive" },
  ] }),
  component: SourceLabPage,
});

function SourceLabPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);

  async function runPipeline() {
    if (loading) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/source-ipfs", { method: "POST", headers: { Accept: "application/json" } });
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
            <p className="mt-1 text-sm text-[#625b70]">Automated open-license discovery, Kubo pinning, and local gateway URL generation.</p>
          </div>
        </header>
        <section className="rounded-3xl border border-[#e5deef] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f2edff] text-[#6243d8]"><Radar className="size-5" /></div>
            <div>
              <h2 className="font-display text-xl font-semibold">Run automated discovery</h2>
              <p className="mt-2 text-sm leading-6 text-[#625b70]">The pipeline rotates through a curated catalog of openly licensed Blender Foundation films, queries the configured IPFS index, accepts only results with explicit open-license metadata, asks Kubo to pin the CID, and returns the local gateway URL. No title needs to be typed.</p>
            </div>
          </div>
          <Button type="button" onClick={() => void runPipeline()} disabled={loading} className="mt-5 h-11 rounded-xl bg-[#7c5cfc] px-5 text-white hover:bg-[#6848e8]">
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <HardDrive className="size-4" />}
            {loading ? "Discovering and pinning…" : "Run IPFS pipeline"}
          </Button>
          {loading && <p className="mt-3 text-sm text-[#625b70]">Checking the search index, Kubo RPC, and pin status. Pinning can retrieve the full content and use disk space.</p>}
          {result && <div className={`mt-5 rounded-2xl border p-4 ${result.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <p className={`flex items-center gap-2 font-semibold ${result.ok ? "text-emerald-900" : "text-amber-950"}`}>
              {result.ok ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
              {result.ok ? "IPFS content pinned" : "IPFS pipeline could not complete"}
            </p>
            {result.ok ? <>
              <dl className="mt-3 space-y-2 break-words text-sm">
                <div><dt className="text-[#625b70]">Automated query</dt><dd className="font-medium">{result.query}</dd></div>
                <div><dt className="text-[#625b70]">Matched result</dt><dd className="font-medium">{result.title}</dd></div>
                <div><dt className="text-[#625b70]">CID</dt><dd className="font-mono text-xs">{result.cid}</dd></div>
                <div><dt className="text-[#625b70]">License metadata</dt><dd>{result.license}</dd></div>
                <div><dt className="text-[#625b70]">Local stream URL</dt><dd><a className="font-medium text-[#6243d8] underline" href={result.streamUrl} target="_blank" rel="noreferrer">{result.streamUrl}</a></dd></div>
              </dl>
              {result.licenseReference && <p className="mt-3 text-xs text-[#625b70]">Catalog license reference: <a className="underline" href={result.licenseReference} target="_blank" rel="noreferrer">{result.licenseReference}</a></p>}
              <p className="mt-3 text-xs text-emerald-900">{result.pinNote}</p>
              {result.streamUrl && <a href={result.streamUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#6243d8]"><Play className="size-4" /> Open local gateway</a>}
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
            <p className="mt-1 text-sm leading-6 text-amber-900">Kubo must run on the same host as this Python pipeline, or KUBO_RPC_URL must point to a trusted, private Kubo RPC endpoint and KUBO_GATEWAY_URL to its gateway. Render does not automatically have access to a Kubo node running on your phone or computer. Never expose Kubo RPC port 5001 publicly; it grants administrative control over the node.</p>
          </div></div>
        </section>
      </div>
    </main>
  );
}
