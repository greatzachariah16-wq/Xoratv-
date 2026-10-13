import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Film, LoaderCircle, Search, ShieldAlert, Users, HardDrive, CircleCheck, CircleX, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TorrentResult = { name: string; info_hash: string; seeders: number; leechers: number; size: number; magnet: string };
type TorrentSearchResponse = {
  ok: boolean; query?: string; category?: number; provider?: string; status?: number; method?: string;
  count?: number; results?: TorrentResult[]; error?: string; detail?: string; blockedBy?: string;
  fallback?: { url: string; status: number | null; reachable: boolean; note: string }; elapsedMs?: number;
};
type InspectResponse = {
  ok: boolean; infoHash?: string; name?: string;
  files?: Array<{ name: string; path: string; size: number; type: string }>;
  totalSize?: number; peerCount?: number; downloadedBytes?: number; engine?: string; payloadDownloaded?: boolean; elapsedMs?: number; error?: string; detail?: string; code?: string;
};

export const Route = createFileRoute("/source-lab")({
  head: () => ({ meta: [
    { title: "XoraTV Torrent Source Lab" },
    { name: "description", content: "Internal Pirate Bay torrent discovery and source testing." },
    { name: "robots", content: "noindex, nofollow, noarchive" },
  ] }),
  component: SourceLabPage,
});

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return value.toFixed(2) + " " + units[unit];
}

function SourceLabPage() {
  const [query, setQuery] = useState("Big Buck Bunny");
  const [payload, setPayload] = useState<TorrentSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inspectingHash, setInspectingHash] = useState("");
  const [inspection, setInspection] = useState<{ hash: string; data: InspectResponse } | null>(null);

  async function inspectMagnet(item: TorrentResult) {
    setInspectingHash(item.info_hash);
    setInspection(null);
    try {
      const response = await fetch("/api/source-torrent-inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ magnet: item.magnet }),
      });
      const data = (await response.json()) as InspectResponse;
      setInspection({ hash: item.info_hash, data });
    } catch (cause) {
      setInspection({ hash: item.info_hash, data: { ok: false, error: cause instanceof Error ? cause.message : "Could not contact the magnet inspection endpoint." } });
    } finally {
      setInspectingHash("");
    }
  }

  async function search(event?: FormEvent, nextQuery = query) {
    event?.preventDefault();
    const cleaned = nextQuery.trim();
    if (cleaned.length < 2 || loading) return;
    setQuery(cleaned);
    setLoading(true);
    setError("");
    setPayload(null);
    try {
      const response = await fetch("/api/source-torrent-search?q=" + encodeURIComponent(cleaned) + "&cat=201", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json()) as TorrentSearchResponse;
      setPayload(data);
      if (!response.ok || !data.ok) setError(data.error || "Torrent search failed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not run the torrent search.");
    } finally {
      setLoading(false);
    }
  }

  const results = payload?.results || [];

  return (
    <main className="min-h-screen bg-[#f8f5ef] px-4 py-6 text-[#211d2c] sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[#7c5cfc] text-white shadow-sm"><Film className="size-5" /></div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#7c5cfc]">XoraTV internal test</p>
            <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Torrent Source Lab</h1>
            <p className="mt-1 text-sm text-[#625b70]">Pirate Bay torrent discovery and magnet-link diagnostics.</p>
          </div>
        </header>

        <section className="overflow-hidden rounded-3xl border border-[#e5deef] bg-white shadow-sm">
          <div className="bg-[#fcfbff] p-5 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c5cfc]">Torrent provider · The Pirate Bay API</p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">Find a movie torrent</h2>
            <p className="mt-2 text-sm leading-6 text-[#625b70]">Searches the connected apibay.org torrent index directly. Results include the info hash, seeders, leechers, file size, and magnet URI. No DuckDuckGo, Bing, or general web search is used.</p>
            <form onSubmit={(event) => void search(event)} className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Movie title, optionally include year" className="h-12 min-w-0 flex-1 rounded-xl border-[#ddd4ed] bg-white text-base" />
              <Button type="submit" disabled={loading || query.trim().length < 2} className="h-12 rounded-xl bg-[#7c5cfc] px-5 text-white hover:bg-[#6848e8]">
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />} Search torrents
              </Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Big Buck Bunny", "Sintel 2010", "Tears of Steel", "Elephants Dream"].map((example) => (
                <button key={example} type="button" disabled={loading} onClick={() => { setQuery(example); void search(undefined, example); }} className="rounded-full border border-[#e2d9f0] bg-white px-3 py-1.5 text-xs font-medium text-[#51466a] hover:border-[#7c5cfc] disabled:opacity-50">{example}</button>
              ))}
            </div>
          </div>

          {loading && <div className="flex items-center gap-3 border-t border-[#eee8f5] p-5 text-sm text-[#625b70]"><LoaderCircle className="size-4 animate-spin text-[#7c5cfc]" /> Requesting Pirate Bay API results from Render…</div>}
          {error && <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">{error}</p>
            {payload?.status !== undefined && <p className="mt-1">HTTP status: {payload.status}{payload.blockedBy ? " · " + payload.blockedBy : ""}</p>}
            {payload?.detail && <p className="mt-1 break-words text-xs">{payload.detail}</p>}
            {payload?.fallback && <p className="mt-2 text-xs leading-5">{payload.fallback.note} <a className="break-all font-semibold underline" href={payload.fallback.url} target="_blank" rel="noopener noreferrer">Open Pirate Bay search page</a></p>}
          </div>}

          {payload?.ok && <div className="space-y-3 border-t border-[#eee8f5] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#625b70]">
              <span>{payload.count ?? 0} results · HTTP {payload.status} · {payload.method || "API"}</span>
              <span>{payload.elapsedMs ?? 0} ms</span>
            </div>
            {results.map((item, index) => <article key={item.info_hash} className="rounded-xl border border-[#e5deef] p-3 sm:p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[#827995]">Torrent result {index + 1}</p>
              <h3 className="mt-1 break-words font-semibold text-[#292333]">{item.name}</h3>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#625b70]">
                <span className="inline-flex items-center gap-1"><HardDrive className="size-3.5" /> {formatSize(item.size)}</span>
                <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {item.seeders} seeders · {item.leechers} leechers</span>
              </div>
              <p className="mt-2 break-all text-[11px] text-[#827995]">Info hash: {item.info_hash}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={item.magnet} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#f2edff] px-3 py-2 text-xs font-semibold text-[#6243d8]">Open magnet link <ExternalLink className="size-3.5" /></a>
                <Button type="button" disabled={Boolean(inspectingHash)} onClick={() => void inspectMagnet(item)} className="min-h-10 rounded-lg bg-[#7c5cfc] px-3 py-2 text-xs font-semibold text-white hover:bg-[#6848e8]">
                  {inspectingHash === item.info_hash ? <LoaderCircle className="size-3.5 animate-spin" /> : <Radar className="size-3.5" />}
                  {inspectingHash === item.info_hash ? "Resolving magnet…" : "Resolve magnet"}
                </Button>
              </div>
              {inspection?.hash === item.info_hash && <div className="mt-3 rounded-xl border border-[#e5deef] bg-[#fcfbff] p-3 text-sm">
                {inspection.data.ok ? <>
                  <p className="flex items-center gap-2 font-semibold text-emerald-800"><CircleCheck className="size-4" /> Torrent metadata resolved</p>
                  <p className="mt-1 break-words text-[#625b70]">Torrent: <span className="font-medium text-[#292333]">{inspection.data.name}</span></p>
                  <p className="mt-1 text-[#625b70]">Files: {inspection.data.files?.length ?? 0} · Total size: {formatSize(inspection.data.totalSize ?? 0)} · Peers observed: {inspection.data.peerCount ?? 0} · {inspection.data.elapsedMs ?? 0} ms</p>
                  <p className="mt-1 text-xs font-medium text-emerald-800">Engine: {inspection.data.engine || "libtorrent-python"} · Payload downloaded: {formatSize(inspection.data.downloadedBytes ?? 0)} · Video file download: disabled</p>
                  <ul className="mt-2 space-y-1 border-t border-[#e5deef] pt-2">
                    {(inspection.data.files || []).slice(0, 12).map((file, fileIndex) => <li key={file.path + fileIndex} className="break-words text-xs text-[#51466a]">{file.name} <span className="text-[#827995]">({formatSize(file.size)})</span></li>)}
                    {(inspection.data.files?.length || 0) > 12 && <li className="text-xs text-[#827995]">Showing first 12 files.</li>}
                  </ul>
                </> : <>
                  <p className="flex items-center gap-2 font-semibold text-amber-900"><CircleX className="size-4" /> Could not resolve torrent metadata</p>
                  <p className="mt-1 break-words text-xs leading-5 text-amber-900">{inspection.data.error || inspection.data.detail || "The inspection engine did not return metadata."}</p>
                  {inspection.data.code && <p className="mt-1 text-[11px] text-amber-800">Result: {inspection.data.code}</p>}
                </>}
              </div>}
            </article>)}
            {!results.length && <p className="text-sm text-[#625b70]">The API returned no usable torrent results.</p>}
          </div>}
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700" /><div>
            <h2 className="font-semibold text-amber-950">License verification is separate from torrent discovery</h2>
            <p className="mt-1 text-sm leading-6 text-amber-900">The Pirate Bay API returns torrent names, hashes, sizes, and swarm counts; it does not provide reliable license proof. A torrent result must not be labelled open-license just because its title looks familiar. The next filter needs a trusted open-license/public-domain title catalogue, then it can use Pirate Bay only to find matching torrents.</p>
          </div></div>
        </section>
      </div>
    </main>
  );
}
