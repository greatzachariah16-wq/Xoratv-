import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { spawnSync } from "node:child_process";
import { createFileRoute } from "@tanstack/react-router";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 8000;

function isPrivateAddress(address: string) {
  const value = address.toLowerCase();
  if (value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) return true;
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return false;
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224;
}

async function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (isIP(host)) return !isPrivateAddress(host);
    const records = await lookup(host, { all: true, verbatim: true });
    return records.length > 0 && records.every((record) => !isPrivateAddress(record.address));
  } catch {
    return false;
  }
}

function runtimeInfo() {
  const python3 = spawnSync("python3", ["--version"], { encoding: "utf8", timeout: 1000 });
  const python = python3.status === 0 ? python3 : spawnSync("python", ["--version"], { encoding: "utf8", timeout: 1000 });
  const pythonOutput = (python.stdout || python.stderr || "").trim();
  return {
    language: "Node.js",
    nodeVersion: process.version,
    platform: process.platform,
    pythonAvailable: python.status === 0,
    pythonVersion: python.status === 0 ? pythonOutput : null,
    note: "Python is optional for ordinary HTTP requests; this test runner uses Node.js fetch.",
  };
}

export const Route = createFileRoute("/api/source-http-test")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const startedAt = Date.now();
        const requestUrl = new URL(request.url);
        const raw = (requestUrl.searchParams.get("url") || "").trim().slice(0, 2048);
        if (!raw) return Response.json({ ok: false, error: "Enter a domain or URL to test." }, { status: 400 });

        let target: URL;
        try {
          target = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : "https://" + raw);
        } catch {
          return Response.json({ ok: false, error: "That domain or URL is not valid." }, { status: 400 });
        }
        if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) {
          return Response.json({ ok: false, error: "Only public HTTP and HTTPS URLs are allowed." }, { status: 400 });
        }

        const runtime = runtimeInfo();
        let current = target;
        const redirects: Array<{ status: number; url: string; location: string }> = [];
        try {
          for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            if (!(await isPublicHttpUrl(current.href))) {
              return Response.json({ ok: false, error: "The target or redirect resolves to a private or blocked address.", runtime, elapsedMs: Date.now() - startedAt, redirects }, { status: 400 });
            }
            const response = await fetch(current.href, {
              method: "GET",
              redirect: "manual",
              headers: {
                "User-Agent": "XoraTV-Source-Lab-HTTP-Test/1.0",
                Accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.8",
                Range: "bytes=0-16383",
              },
              signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            const location = response.headers.get("location");
            if (response.status >= 300 && response.status < 400 && location) {
              await response.body?.cancel().catch(() => {});
              if (hop === MAX_REDIRECTS) {
                return Response.json({ ok: false, error: "Redirect limit reached.", status: response.status, redirects, runtime, elapsedMs: Date.now() - startedAt }, { status: 200 });
              }
              const next = new URL(location, current);
              redirects.push({ status: response.status, url: current.href, location: next.href });
              current = next;
              continue;
            }

            const reader = response.body?.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            if (reader) {
              while (size < MAX_BODY_BYTES) {
                const { done, value } = await reader.read();
                if (done || !value) break;
                const chunk = value.subarray(0, MAX_BODY_BYTES - size);
                chunks.push(chunk);
                size += chunk.byteLength;
                if (chunk.byteLength < value.byteLength) break;
              }
              await reader.cancel().catch(() => {});
            }
            const body = new TextDecoder().decode(chunks.reduce((all, chunk) => {
              const joined = new Uint8Array(all.length + chunk.length);
              joined.set(all);
              joined.set(chunk, all.length);
              return joined;
            }, new Uint8Array()));
            const contentType = response.headers.get("content-type") || "not provided";
            const headers: Record<string, string> = {};
            for (const key of ["content-type", "content-length", "server", "location", "accept-ranges", "content-range", "last-modified", "etag"]) {
              const value = response.headers.get(key);
              if (value) headers[key] = value;
            }
            return Response.json({
              ok: true,
              testedUrl: target.href,
              finalUrl: current.href,
              status: response.status,
              statusText: response.statusText,
              responseOk: response.ok,
              contentType,
              headers,
              bodyPreview: body.replace(/\u0000/g, "").slice(0, 6000),
              bodyBytesRead: size,
              bodyTruncated: size >= MAX_BODY_BYTES,
              redirects,
              elapsedMs: Date.now() - startedAt,
              runtime,
              note: "This is an HTTP reachability/response test only. It does not download a torrent or prove that a media item is playable.",
            }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
          }
          return Response.json({ ok: false, error: "No HTTP response received." }, { status: 502 });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Response.json({
            ok: false,
            testedUrl: target.href,
            error: /timeout|abort/i.test(message) ? "Request timed out." : "The HTTP request failed.",
            detail: message.slice(0, 300),
            redirects,
            elapsedMs: Date.now() - startedAt,
            runtime,
          }, { status: 200, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
        }
      },
    },
  },
});
