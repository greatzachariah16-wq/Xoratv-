import { createFileRoute } from "@tanstack/react-router";

const API_URL = "https://apibay.org/q.php";
const SITE_URL = "https://thepiratebay.org/search.php";
const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.torrent.eu.org:451/announce",
];
const TIMEOUT_MS = 10000;

function magnetFor(infoHash: string, name: string) {
  const hash = infoHash.trim();
  if (!/^[a-f\d]{40}$/i.test(hash)) return null;
  const params = new URLSearchParams();
  params.set("xt", "urn:btih:" + hash);
  params.set("dn", name || "Torrent");
  for (const tracker of TRACKERS) params.append("tr", tracker);
  return "magnet:?" + params.toString();
}

function challengePage(text: string, status: number) {
  return status === 403 && /cloudflare|just a moment|cf_chl_|challenge-platform/i.test(text);
}

async function readText(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  return { response, text };
}

export const Route = createFileRoute("/api/source-torrent-search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const startedAt = Date.now();
        const url = new URL(request.url);
        const query = (url.searchParams.get("q") || "").trim().slice(0, 160);
        const category = Number(url.searchParams.get("cat") || "201");
        if (query.length < 2) return Response.json({ ok: false, error: "Enter at least 2 characters." }, { status: 400 });
        if (!Number.isInteger(category) || category < 0 || category > 999) {
          return Response.json({ ok: false, error: "Category must be a valid numeric category ID (201 for movies or 0 for all)." }, { status: 400 });
        }

        try {
          const apiUrl = new URL(API_URL);
          apiUrl.search = new URLSearchParams({ q: query, cat: String(category) }).toString();
          const { response, text } = await readText(apiUrl.href);
          const contentType = response.headers.get("content-type") || "";
          if (challengePage(text, response.status)) {
            // The API response is reported faithfully; do not mistake a Cloudflare
            // challenge document for JSON or claim that results were fetched.
            let siteStatus: number | null = null;
            let siteReachable = false;
            let siteNote = "Fallback page was not tested.";
            try {
              const siteUrl = new URL(SITE_URL);
              siteUrl.searchParams.set("q", query);
              const site = await readText(siteUrl.href);
              siteStatus = site.response.status;
              siteReachable = site.response.ok;
              siteNote = site.response.ok
                ? "The public search page responded, but its HTML may rely on client-side JavaScript for results."
                : "The public search page did not return a successful response.";
            } catch (error) {
              siteNote = error instanceof Error ? error.message.slice(0, 180) : "Fallback page request failed.";
            }
            return Response.json({
              ok: false,
              query,
              category,
              provider: "The Pirate Bay API (apibay.org)",
              status: response.status,
              contentType,
              blockedBy: "cloudflare-challenge",
              error: "apibay.org returned a Cloudflare verification page instead of JSON. This Render request cannot retrieve API results with ordinary HTTP.",
              fallback: { url: SITE_URL + "?q=" + encodeURIComponent(query), status: siteStatus, reachable: siteReachable, note: siteNote },
              elapsedMs: Date.now() - startedAt,
            }, { status: 502, headers: { "Cache-Control": "no-store" } });
          }

          if (!response.ok) {
            return Response.json({
              ok: false, query, category, status: response.status,
              error: "Torrent API returned HTTP " + response.status + ".",
              bodyPreview: text.slice(0, 300), elapsedMs: Date.now() - startedAt,
            }, { status: 502, headers: { "Cache-Control": "no-store" } });
          }

          let payload: unknown;
          try {
            payload = JSON.parse(text);
          } catch {
            return Response.json({
              ok: false, query, category, status: response.status,
              error: "The API response was not valid JSON.",
              contentType, bodyPreview: text.slice(0, 300), elapsedMs: Date.now() - startedAt,
            }, { status: 502, headers: { "Cache-Control": "no-store" } });
          }
          if (!Array.isArray(payload)) {
            return Response.json({ ok: false, query, category, error: "Unexpected API format: expected a JSON array.", elapsedMs: Date.now() - startedAt }, { status: 502 });
          }

          const results = payload.flatMap((value: unknown) => {
            if (!value || typeof value !== "object") return [];
            const item = value as Record<string, unknown>;
            const name = typeof item.name === "string" ? item.name : "Unknown";
            const infoHash = typeof item.info_hash === "string" ? item.info_hash : "";
            const magnet = magnetFor(infoHash, name);
            if (!magnet) return [];
            const integer = (value: unknown) => {
              const parsed = Number(value);
              return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
            };
            return [{
              name,
              info_hash: infoHash,
              seeders: integer(item.seeders),
              leechers: integer(item.leechers),
              size: integer(item.size),
              magnet,
            }];
          }).sort((a, b) => b.seeders - a.seeders).slice(0, 50);

          return Response.json({
            ok: true, query, category, provider: "The Pirate Bay API (apibay.org)",
            status: response.status, count: results.length, results,
            elapsedMs: Date.now() - startedAt,
          }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const timeout = /timeout|abort/i.test(message);
          return Response.json({
            ok: false, query, category,
            error: timeout ? "The torrent API request timed out." : "Could not reach the torrent API.",
            detail: message.slice(0, 240), elapsedMs: Date.now() - startedAt,
          }, { status: 502, headers: { "Cache-Control": "no-store" } });
        }
      },
    },
  },
});
