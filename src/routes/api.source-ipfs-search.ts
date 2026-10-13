import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createFileRoute } from "@tanstack/react-router";
import { queryRtdb } from "../server/xseries-service-account";

const SCRIPT_PATH = resolve(process.cwd(), "scripts/ipfs_index_provider.py");
const TIMEOUT_MS = 40_000;

export const Route = createFileRoute("/api/source-ipfs-search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        let query = "";
        try {
          const body = await request.json() as { query?: unknown; title?: unknown };
          const candidate = typeof body.query === "string" ? body.query : body.title;
          if (typeof candidate === "string") query = candidate.trim().slice(0, 180);
        } catch {}
        if (!query) return Response.json({ ok: false, error: "Enter a video title or keyword." }, { status: 400 });

        // Prefer the durable Firebase-backed index; retain the existing provider/local fallback.
        try {
          const saved = await queryRtdb("sourceLab/ipfsMediaIndex") as Record<string, {
            cid?: string; title?: string; path?: string; streamUrl?: string; source?: string;
          }> | null;
          const terms = query.toLowerCase().split(/[^a-z0-9]+/i).filter((term) => term.length > 1).slice(0, 8);
          const ranked = Object.values(saved || {})
            .filter((row) => row && typeof row.cid === "string" && typeof row.title === "string")
            .map((row) => {
              const title = String(row.title || "");
              const path = String(row.path || "");
              const haystack = (title + " " + path).toLowerCase();
              const score = terms.reduce((sum, term) => sum + (title.toLowerCase().includes(term) ? 3 : haystack.includes(term) ? 1 : 0), 0);
              return { row, score };
            })
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);

          const checks = await Promise.all(ranked.map(async ({ row, score }) => {
            const cid = String(row.cid || "");
            const path = String(row.path || "");
            const url = "https://ipfs.io/ipfs/" + cid + (path ? "/" + path : "");
            try {
              const response = await fetch(url, {
                method: "HEAD",
                headers: { "User-Agent": "XoraTV-SourceLab/2.0" },
                signal: AbortSignal.timeout(4500),
              });
              const mime = (response.headers.get("content-type") || "").toLowerCase();
              if ((response.status === 200 || response.status === 206) && !mime.includes("text/html")) {
                return {
                  cid, title: row.title, path, streamUrl: url, score,
                  contentType: mime, source: row.source || "xoratv-firebase-index",
                };
              }
            } catch { /* try next candidate */ }
            return null;
          }));
          const playable = checks.filter((item) => item !== null);
          if (playable.length) {
            return Response.json({
              ok: true, query, results: playable.slice(0, 10), count: playable.length,
              source: "xoratv-firebase-index",
              message: "Matches came from XoraTV's persistent Firebase index and passed a gateway availability check.",
              elapsedMs: Date.now() - startedAt,
            }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
          }
        } catch (error) {
          console.warn("[IPFS Search] Firebase index read failed; using existing fallback:", error instanceof Error ? error.message : error);
        }
        const child = spawn(process.env.PYTHON_PATH || "python3", [SCRIPT_PATH, query], {
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, PYTHONUNBUFFERED: "1" },
        });
        const result = await new Promise<{ status: number; payload: Record<string, unknown> }>((resolveResult) => {
          let stdout = "";
          let stderr = "";
          let settled = false;
          const finish = (status: number, payload: Record<string, unknown>) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolveResult({ status, payload: { ...payload, elapsedMs: Date.now() - startedAt } });
          };
          const timer = setTimeout(() => {
            child.kill("SIGKILL");
            finish(504, { ok: false, error: "IPFS index search timed out. Try again shortly." });
          }, TIMEOUT_MS);
          child.stdout.setEncoding("utf8");
          child.stderr.setEncoding("utf8");
          child.stdout.on("data", (chunk: string) => { stdout += chunk; });
          child.stderr.setEncoding("utf8");
          child.stderr.on("data", (chunk: string) => { stderr += chunk; });
          child.on("error", (error) => finish(502, { ok: false, error: "Could not start the IPFS index search.", detail: error.message.slice(0, 240) }));
          child.on("close", (code) => {
            if (settled) return;
            try {
              const payload = JSON.parse(stdout.trim()) as Record<string, unknown>;
              finish(payload.ok === true ? 200 : 502, payload);
            } catch {
              finish(502, { ok: false, error: "The IPFS index returned an unreadable response.", detail: (stderr || stdout || `Python exited with code ${code}`).slice(0, 240) });
            }
          });
        });
        return Response.json(result.payload, { status: result.status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      },
    },
  },
});
