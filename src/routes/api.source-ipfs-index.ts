import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createFileRoute } from "@tanstack/react-router";

const SCRIPT_PATH = resolve(process.cwd(), "scripts/ipfs_local_search_index.py");
const CID_RE = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{20,})$/;
const TIMEOUT_MS = 25_000;

export const Route = createFileRoute("/api/source-ipfs-index")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        let cid = "";
        let title = "";
        try {
          const body = await request.json() as { cid?: unknown; title?: unknown };
          if (typeof body.cid === "string") cid = body.cid.trim();
          if (typeof body.title === "string") title = body.title.trim().slice(0, 240);
        } catch {}
        if (!CID_RE.test(cid)) return Response.json({ ok: false, error: "Enter a valid IPFS CID (Qm… or bafy…)." }, { status: 400 });
        const child = spawn(process.env.PYTHON_PATH || "python3", [SCRIPT_PATH, "index", cid, title], {
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
            finish(504, { ok: false, error: "Indexing timed out. Try a smaller IPFS directory CID." });
          }, TIMEOUT_MS);
          child.stdout.setEncoding("utf8");
          child.stderr.setEncoding("utf8");
          child.stdout.on("data", (chunk: string) => { stdout += chunk; });
          child.stderr.on("data", (chunk: string) => { stderr += chunk; });
          child.on("error", (error) => finish(502, { ok: false, error: "Could not start the local IPFS indexer.", detail: error.message.slice(0, 240) }));
          child.on("close", (code) => {
            if (settled) return;
            try {
              const payload = JSON.parse(stdout.trim()) as Record<string, unknown>;
              finish(payload.ok === true ? 200 : 502, payload);
            } catch {
              finish(502, { ok: false, error: "The indexer returned an unreadable response.", detail: (stderr || stdout || `Python exited with code ${code}`).slice(0, 240) });
            }
          });
        });
        return Response.json(result.payload, { status: result.status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      },
    },
  },
});
