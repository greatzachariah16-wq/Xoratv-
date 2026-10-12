import { load } from "cheerio";

type SourceResult = {
  title: string;
  url: string;
  snippet: string;
  sourceType: "direct-video" | "hls" | "iptv-playlist" | "video-page" | "social-video" | "general-webpage";
  pageKind: string;
  publishedYear: number | null;
  exactTitleMatch: boolean;
  host: string;
};

const VIDEO_HOSTS = ["youtube.com", "youtu.be", "vimeo.com", "dailymotion.com", "streamable.com", "archive.org", "drive.google.com"];
const SOCIAL_VIDEO_HOSTS = ["facebook.com", "tiktok.com", "instagram.com", "x.com", "twitter.com"];

function isHost(hostname: string, domains: string[]) {
  return domains.some((host) => hostname === host || hostname.endsWith("." + host));
}

function classifySource(rawUrl: string): SourceResult["sourceType"] {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return "general-webpage"; }
  const path = url.pathname.toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogv)(?:$)/i.test(path)) return "direct-video";
  if (/\.m3u8(?:$)/i.test(path)) return "hls";
  if (/\.m3u(?:$)/i.test(path)) return "iptv-playlist";
  if (isHost(url.hostname, SOCIAL_VIDEO_HOSTS)) return "social-video";
  if (isHost(url.hostname, VIDEO_HOSTS)) return "video-page";
  return "general-webpage";
}

function unwrapDuckDuckGoUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw, "https://html.duckduckgo.com");
    const candidate = parsed.searchParams.get("uddg") || parsed.href;
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.hostname === "html.duckduckgo.com" || url.hostname === "duckduckgo.com") return null;
    return url.href;
  } catch { return null; }
}

export async function handleSourceSearchRoute(request: Request, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/source-search") return null;
  if (request.method !== "GET") return Response.json({ ok: false, error: "Use GET for source searches." }, { status: 405 });

  const query = (url.searchParams.get("q") || "").trim().slice(0, 180);
  const limit = Math.min(15, Math.max(1, Number(url.searchParams.get("limit") || "10")));
  if (query.length < 2) return Response.json({ ok: false, error: "Enter at least 2 characters to search." }, { status: 400 });

  const startedAt = Date.now();
  const discoveryQuery = "(" + query + ") (movie OR film OR full movie) after:1999 -silent -black-and-white";
  try {
    const searchUrl = new URL("https://html.duckduckgo.com/html/");
    searchUrl.searchParams.set("q", discoveryQuery);
    searchUrl.searchParams.set("kl", "wt-wt");

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; XoraTVSourceLab/0.2; +https://xoratv-x.onrender.com/source-lab)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return Response.json({ ok: false, error: "Web discovery returned HTTP " + response.status + ". Try again shortly.", query }, { status: 502 });

    const $ = load(await response.text());
    const seen = new Set<string>();
    const results: SourceResult[] = [];
    $(".result").each((_, element) => {
      if (results.length >= limit) return false;
      const anchor = $(element).find(".result__a").first();
      const title = anchor.text().replace(/\s+/g, " ").trim();
      const rawHref = anchor.attr("href");
      const resolvedUrl = rawHref ? unwrapDuckDuckGoUrl(rawHref) : null;
      if (!title || !resolvedUrl || seen.has(resolvedUrl)) return;
      seen.add(resolvedUrl);
      const snippet = $(element).find(".result__snippet").first().text().replace(/\s+/g, " ").trim();
      let host = "";
      try { host = new URL(resolvedUrl).hostname.replace(/^www\./, ""); } catch { /* ignored */ }
      const normalizedQuery = query.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const normalizedTitle = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
      const years = (title + " " + snippet).match(/\b(?:19\d{2}|20\d{2})\b/g)?.map(Number) || [];
      const publishedYear = years.find((year) => year >= 2000 && year <= new Date().getFullYear()) ?? null;
      const sourceType = classifySource(resolvedUrl);
      const pageKind =
        sourceType === "direct-video" ? "Direct video file URL" :
        sourceType === "hls" ? "HLS streaming playlist (.m3u8)" :
        sourceType === "iptv-playlist" ? "M3U playlist file" :
        sourceType === "social-video" ? "Social video page" :
        sourceType === "video-page" ? "Video-hosting or sharing page" :
        "General webpage — inspect for embedded player";
      results.push({
        title, url: resolvedUrl, snippet, host, sourceType, pageKind, publishedYear,
        exactTitleMatch: normalizedQuery.length > 0 && normalizedTitle.includes(normalizedQuery),
      });
    });

    return Response.json({
      ok: true,
      query,
      engine: "XoraTV discovery prototype",
      discoveryBackend: "DuckDuckGo public HTML search results",
      yearFocus: "2000 to present",
      appliedSearch: discoveryQuery,
      elapsedMs: Date.now() - startedAt,
      count: results.length,
      results,
      note: "Search is biased toward films released from 2000 onward and away from silent/black-and-white results. Search operators and snippets are imperfect: a detected year is only a clue, not verified film metadata. Page kind is inferred from the result URL; a general webpage must be inspected to determine whether it contains a playable video. Playback is not yet verified.",
    }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown discovery error";
    return Response.json({
      ok: false, query,
      error: message.includes("timed out") || message.includes("abort") ? "The web search timed out. Try again." : "Could not reach the web discovery source. Try again shortly.",
    }, { status: 502 });
  }
}
