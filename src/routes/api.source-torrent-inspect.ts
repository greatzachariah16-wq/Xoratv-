import { createFileRoute } from "@tanstack/react-router";

const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.torrent.eu.org:451/announce",
];
const METADATA_TIMEOUT_MS = 28_000;
const PEER_SAMPLE_MS = 2_000;

type Inspection = {
  ok: boolean;
  infoHash?: string;
  name?: string;
  files?: Array<{ name: string; path: string; size: number; type: string }>;
  totalSize?: number;
  peerCount?: number;
  elapsedMs: number;
  error?: string;
  code?: string;
};

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
}

export const Route = createFileRoute("/api/source-torrent-inspect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        let body: { magnet?: unknown };
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Request body must be valid JSON." }, { status: 400 });
        }

        const magnet = typeof body.magnet === "string" ? body.magnet.trim() : "";
        if (!magnet || magnet.length > 5000 || !magnet.startsWith("magnet:?")) {
          return Response.json({ ok: false, error: "Provide a valid magnet URI." }, { status: 400 });
        }
        const parsed = new URL(magnet);
        const xt = parsed.searchParams.get("xt") || "";
        if (!/^urn:btih:[a-f\d]{40}$/i.test(xt)) {
          return Response.json({ ok: false, error: "Magnet URI must contain a 40-character BitTorrent info hash." }, { status: 400 });
        }

        let client: { add: (...args: any[]) => any; on: (...args: any[]) => any; destroy: (callback?: (error?: Error | null) => void) => any } | undefined;
        try {
          const imported = await import("webtorrent");
          const WebTorrent = imported.default;
          client = new WebTorrent({ dht: true, tracker: true });
          client.on("error", () => {
            // Individual torrent errors are handled below; avoid an unhandled client event.
          });

          const result: Inspection = await new Promise((resolve) => {
            let settled = false;
            let metadataTimer: ReturnType<typeof setTimeout> | undefined;
            const timeout = setTimeout(() => {
              finish({
                ok: false,
                infoHash,
                elapsedMs: Date.now() - startedAt,
                code: "metadata-timeout",
                error: "Timed out waiting for torrent metadata. The magnet may have no reachable peers or the server may not be able to reach the BitTorrent network.",
              });
            }, METADATA_TIMEOUT_MS);

            const finish = (value: Inspection) => {
              if (settled) return;
              settled = true;
              clearTimeout(timeout);
              if (metadataTimer) clearTimeout(metadataTimer);
              resolve({ ...value, elapsedMs: Date.now() - startedAt });
            };

            let torrent: any;
            try {
              torrent = client!.add(canonicalMagnet);
            } catch (error) {
              finish({ ok: false, elapsedMs: Date.now() - startedAt, error: safeError(error), code: "magnet-rejected" });
              return;
            }

            const captureMetadata = () => {
              if (settled || metadataTimer) return;
              metadataTimer = setTimeout(() => {
                const files = (torrent.files || []).map((file: any) => ({
                  name: String(file.name || file.path || "Unnamed file"),
                  path: String(file.path || file.name || ""),
                  size: Number(file.length ?? file.size ?? 0),
                  type: String(file.type || "application/octet-stream"),
                }));
                finish({
                  ok: true,
                  infoHash: String(torrent.infoHash || xt.slice("urn:btih:".length)).toLowerCase(),
                  name: String(torrent.name || displayName),
                  files,
                  totalSize: files.reduce((sum: number, file: { size: number }) => sum + file.size, 0),
                  peerCount: Number(torrent.numPeers || 0),
                  elapsedMs: Date.now() - startedAt,
                });
              }, PEER_SAMPLE_MS);
            };

            torrent.on("metadata", captureMetadata);
            torrent.on("ready", captureMetadata);
            torrent.on("error", (error: unknown) => {
              finish({ ok: false, infoHash: xt.slice("urn:btih:".length).toLowerCase(), elapsedMs: Date.now() - startedAt, code: "torrent-error", error: safeError(error) });
            });
            if (torrent.metadata || torrent.files?.length) captureMetadata();
          });

          client.destroy(() => {});
          client = undefined;
          return Response.json(result, {
            status: result.ok ? 200 : result.code === "metadata-timeout" ? 504 : 502,
            headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
          });
        } catch (error) {
          if (client) {
            try { client.destroy(() => {}); } catch { /* best-effort cleanup */ }
          }
          return Response.json({
            ok: false,
            error: "The torrent inspection engine could not start or resolve this magnet.",
            detail: safeError(error),
            elapsedMs: Date.now() - startedAt,
          }, { status: 502, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
        }
      },
    },
  },
});
