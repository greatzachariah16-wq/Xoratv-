import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createFileRoute } from "@tanstack/react-router";

const SCRIPT_PATH = resolve(process.cwd(), "scripts/ipfs_historical_seed.py");
const TIMEOUT_MS = 85_000;

export const Route = createFileRoute("/api/source-ipfs-seed-history")({
  server: {
    handlers: {
      POST: async () => {
        const startedAt = Date.now();
        const child = spawn(process.env.PYTHON_PATH || "python3", [SCRIPT_PATH], {
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
            finish(504, {
              ok: false,
              error: "Historical index seeding timed out. Any committed batches remain in the local database; retry to continue.",
            });
          }, TIMEOUT_MS);
          child.stdout.setEncoding("utf8");
          child.stderr.setEncoding("utf8");
          child.stdout.on("data", (chunk: string) => { stdout += chunk; });
          child.stderr.on("data", (chunk: string) => { stderr += chunk; });
          child.on("error", (error) => finish(502, {
            ok: false, error: "Could not start the historical index seeder.", detail: error.message.slice(0, 200),
          }));
          child.on("close", (code) => {
            if (settled) return;
            try {
              const payload = JSON.parse(stdout.trim()) as Record<string, unknown>;
              finish(payload.ok === true ? 200 : 502, payload);
            } catch {
              finish(502, {
                ok: false,
                error: "The historical index seeder returned an unreadable response.",
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
