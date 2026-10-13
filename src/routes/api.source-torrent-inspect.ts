import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createFileRoute } from "@tanstack/react-router";

const METADATA_TIMEOUT_MS = 28_000;
const SCRIPT_PATH = resolve(process.cwd(), "scripts/torrent_inspect.py");

type Inspection = {
  ok: boolean;
  infoHash?: string;
  name?: string;
  files?: Array<{ name: string; path: string; size: number; type: string }>;
  totalSize?: number;
  peerCount?: number;
  downloadedBytes?: number;
  elapsedMs: number;
  error?: string;
  code?: string;
  detail?: string;
};

function safeError(value: unknown) {
  return value instanceof Error ? value.message.slice(0, 240) : String(value).slice(0, 240);
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

        let parsed: URL;
        try {
          parsed = new URL(magnet);
        } catch {
          return Response.json({ ok: false, error: "The magnet URI is malformed." }, { status: 400 });
        }
        const xt = parsed.searchParams.get("xt") || "";
        if (!/^urn:btih:[a-f\d]{40}$/i.test(xt)) {
          return Response.json({ ok: false, error: "Magnet URI must contain a 40-character BitTorrent info hash." }, { status: 400 });
        }

        const result = await new Promise<Inspection>((resolveResult) => {
          let stdout = "";
          let stderr = "";
          let settled = false;
          const child = spawn("python3", [SCRIPT_PATH], { stdio: ["pipe", "pipe", "pipe"] });
          const timeout = setTimeout(() => {
            child.kill("SIGKILL");
            finish({
              ok: false,
              infoHash: xt.slice("urn:btih:".length).toLowerCase(),
              elapsedMs: Date.now() - startedAt,
              code: "metadata-timeout",
              error: "Timed out waiting for libtorrent metadata. The magnet may have no reachable peers, or outbound BitTorrent traffic may be blocked.",
            });
          }, METADATA_TIMEOUT_MS + 3000);

          const finish = (value: Inspection) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolveResult({ ...value, elapsedMs: Date.now() - startedAt });
          };

          child.stdout.setEncoding("utf8");
          child.stderr.setEncoding("utf8");
          child.stdout.on("data", (chunk: string) => { stdout += chunk; });
          child.stderr.on("data", (chunk: string) => { stderr += chunk; });
          child.on("error", (error) => {
            finish({ ok: false, elapsedMs: Date.now() - startedAt, code: "engine-start-failed", error: "The Python libtorrent engine could not start.", detail: safeError(error) });
          });
          child.on("close", (code) => {
            if (settled) return;
            try {
              const payload = JSON.parse(stdout.trim()) as Inspection;
              finish(payload);
            } catch {
              finish({
                ok: false,
                elapsedMs: Date.now() - startedAt,
                code: "engine-invalid-response",
                error: "The Python libtorrent engine returned an unreadable response.",
                detail: (stderr || stdout || `process exited with code ${code}`).slice(0, 240),
              });
            }
          });
          child.stdin.end(JSON.stringify({ magnet, timeoutMs: METADATA_TIMEOUT_MS }));
        });

        return Response.json(result, {
          status: result.ok ? 200 : result.code === "metadata-timeout" ? 504 : 502,
          headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        });
      },
    },
  },
});
