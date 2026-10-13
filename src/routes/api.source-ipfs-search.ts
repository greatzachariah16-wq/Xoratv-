import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createFileRoute } from "@tanstack/react-router";

const SCRIPT_PATH = resolve(process.cwd(), "scripts/ipfs_local_search_index.py");
const TIMEOUT_MS = 25_000;

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
        const python = process.env.PYTHON_PATH || "python3";
        const child = spawn(python, [SCRIPT_PATH, "search", query], {
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
            finish(504, { ok: false, error: "Local IPFS index search timed out." });
          }, TIMEOUT_MS);
          child.stdout.setEncoding("utf8");
          child.stderr.setEncoding("utf8");
          child.stdout.on("data", (chunk: string) => { stdout += chunk; });
          child.stderr.on("data", (chunk: string) => { stderr += chunk; });
          child.on("error", (error) => finish(502, { ok: false, error: "Could not start the local IPFS search index.", detail: error.message.slice(0, 240) }));
          child.on("close", (code) => {
            if (settled) return;
            try {
              const payload = JSON.parse(stdout.trim()) as Record<string, unknown>;
              finish(payload.ok === true ? 200 : 502, payload);
            } catch {
              finish(502, { ok: false, error: "The local IPFS index returned an unreadable response.", detail: (stderr || stdout || `Python exited with code ${code}`).slice(0, 240) });
            }
          });
        });
        return Response.json(result.payload, { status: result.status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      },
    },
  },
});
