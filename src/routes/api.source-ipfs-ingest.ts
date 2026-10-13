import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createFileRoute } from "@tanstack/react-router";

const SCRIPT_PATH = resolve(process.cwd(), "scripts/ipfs_live_record_ingest.py");
const MAX_BODY_BYTES = 256 * 1024;

export const Route = createFileRoute("/api/source-ipfs-ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.IPFS_INGEST_TOKEN;
        if (!secret) {
          return Response.json({
            ok: false,
            error: "Live ingest is not enabled yet. Configure IPFS_INGEST_TOKEN and connect a DHT discovery worker.",
          }, { status: 503, headers: { "Cache-Control": "no-store" } });
        }
        const authorization = request.headers.get("authorization") || "";
        if (authorization !== `Bearer ${secret}`) {
          return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
        }
        const declaredLength = Number(request.headers.get("content-length") || 0);
        if (declaredLength > MAX_BODY_BYTES) {
          return Response.json({ ok: false, error: "Request body is too large." }, { status: 413 });
        }
        let raw: string;
        try {
          raw = await request.text();
          if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
            return Response.json({ ok: false, error: "Request body is too large." }, { status: 413 });
          }
        } catch {
          return Response.json({ ok: false, error: "Could not read request body." }, { status: 400 });
        }
        let body: unknown;
        try { body = JSON.parse(raw); } catch {
          return Response.json({ ok: false, error: "Send valid JSON." }, { status: 400 });
        }
        const child = spawn(process.env.PYTHON_PATH || "python3", [SCRIPT_PATH], {
          stdio: ["pipe", "pipe", "pipe"],
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
            resolveResult({ status, payload });
          };
          const timer = setTimeout(() => {
            child.kill("SIGKILL");
            finish(504, { ok: false, error: "Could not save IPFS records before timeout." });
          }, 15_000);
          child.stdout.setEncoding("utf8");
          child.stderr.setEncoding("utf8");
          child.stdout.on("data", (chunk: string) => { stdout += chunk; });
          child.stderr.on("data", (chunk: string) => { stderr += chunk; });
          child.on("error", (error) => finish(502, {
            ok: false, error: "Could not start the record importer.", detail: error.message.slice(0, 180),
          }));
          child.on("close", (code) => {
            if (settled) return;
            try {
              const payload = JSON.parse(stdout.trim()) as Record<string, unknown>;
              finish(payload.ok === true ? 200 : 400, payload);
            } catch {
              finish(502, {
                ok: false, error: "The record importer returned an unreadable response.",
                detail: (stderr || stdout || `Importer exited with code ${code}`).slice(0, 220),
              });
            }
          });
          child.stdin.end(JSON.stringify(body));
        });
        return Response.json(result.payload, {
          status: result.status,
          headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        });
      },
    },
  },
});
