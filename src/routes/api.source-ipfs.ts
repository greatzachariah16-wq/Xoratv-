import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createFileRoute } from "@tanstack/react-router";

const SCRIPT_PATH = resolve(process.cwd(), "scripts/ipfs_media_pipeline.py");
const TIMEOUT_MS = 70_000;
const MAX_QUERY_LENGTH = 180;

export const Route = createFileRoute("/api/source-ipfs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        let query = "";
        try {
          const body = await request.json() as { query?: unknown; title?: unknown };
          const candidate = typeof body.query === "string" ? body.query : body.title;
          if (typeof candidate === "string") query = candidate.trim().slice(0, MAX_QUERY_LENGTH);
        } catch {
          // An empty body is allowed; the Python pipeline uses its configured default.
        }

        const python = process.env.PYTHON_PATH || "python3";
        const child = spawn(python, [SCRIPT_PATH, query], {
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
            finish(504, { ok: false, error: "Internet Archive search timed out. Try a shorter title." });
          }, TIMEOUT_MS);

          child.stdout.setEncoding("utf8");
          child.stderr.setEncoding("utf8");
          child.stdout.on("data", (chunk: string) => { stdout += chunk; });
          child.stderr.setEncoding("utf8");
          child.stderr.on("data", (chunk: string) => { stderr += chunk; });
          child.on("error", (error) => {
            finish(502, { ok: false, error: "Could not start the Python media pipeline.", detail: error.message.slice(0, 240) });
          });
          child.on("close", (code) => {
            if (settled) return;
            try {
              const payload = JSON.parse(stdout.trim()) as Record<string, unknown>;
              finish(payload.ok === true ? 200 : 502, payload);
            } catch {
              finish(502, {
                ok: false,
                error: "The media pipeline returned an unreadable response.",
                detail: (stderr || stdout || `Python exited with code ${code}`).slice(0, 240),
              });
            }
          });
        });

        return Response.json(result.payload, {
          status: result.status,
          headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        });
      },
    },
  },
});
