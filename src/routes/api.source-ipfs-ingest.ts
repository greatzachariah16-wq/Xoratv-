import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { queryRtdb } from "../server/xseries-service-account";

const MAX_BODY_BYTES = 256 * 1024;
const VIDEO_EXT = /\.(mp4|webm|m4v|mov|mkv|avi|ogv|m3u8|mpg|mpeg|3gp)$/i;
const CID_RE = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/i;

function cleanRecord(item: unknown) {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const cid = String(row.cid || "").trim();
  const title = String(row.title || row.filename || "").trim().slice(0, 240);
  const path = String(row.path || "").trim().replace(/^\/+/, "").slice(0, 500);
  const source = String(row.source || "ipfs-metadata-discovery").slice(0, 80);
  if (!CID_RE.test(cid) || !title || (!VIDEO_EXT.test(title) && !VIDEO_EXT.test(path))) return null;
  const key = createHash("sha256").update(cid + "\n" + path).digest("hex");
  const now = Date.now();
  return {
    key,
    value: {
      cid, title, path,
      streamUrl: "https://ipfs.io/ipfs/" + cid + (path ? "/" + path : ""),
      source,
      firstSeenAt: now,
      lastSeenAt: now,
    },
  };
}

export const Route = createFileRoute("/api/source-ipfs-ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.IPFS_INGEST_TOKEN;
        if (!secret) {
          return Response.json({ ok: false, error: "Live ingest is not enabled. Configure IPFS_INGEST_TOKEN." }, { status: 503 });
        }
        if ((request.headers.get("authorization") || "") !== `Bearer ${secret}`) {
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
        const records = (body as { records?: unknown } | null)?.records;
        if (!Array.isArray(records) || records.length === 0 || records.length > 100) {
          return Response.json({ ok: false, error: "Send between 1 and 100 metadata records." }, { status: 400 });
        }

        let accepted = 0;
        let rejected = 0;
        const errors: string[] = [];
        for (const item of records) {
          const parsed = cleanRecord(item);
          if (!parsed) { rejected++; continue; }
          try {
            const dbPath = `sourceLab/ipfsMediaIndex/${parsed.key}`;
            const previous = await queryRtdb(dbPath) as Record<string, unknown> | null;
            const value = {
              ...parsed.value,
              firstSeenAt: Number(previous?.firstSeenAt || parsed.value.firstSeenAt),
            };
            await queryRtdb(dbPath, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(value),
            });
            accepted++;
          } catch (error) {
            errors.push(error instanceof Error ? error.message.slice(0, 120) : "Firebase write failed");
            rejected++;
          }
        }
        if (accepted === 0 && errors.length) {
          return Response.json({
            ok: false,
            accepted, rejected,
            error: "Could not save records to the existing Firebase database. Check the server's Firebase service-account configuration.",
            detail: errors[0],
          }, { status: 502 });
        }
        return Response.json({
          ok: true, accepted, rejected,
          storage: "firebase-realtime-database",
          message: "Metadata saved to XoraTV's existing Firebase database. Video bytes were not downloaded or pinned.",
          ...(errors.length ? { warnings: errors.slice(0, 3) } : {}),
        }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      },
    },
  },
});
