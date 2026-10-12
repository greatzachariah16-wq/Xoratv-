import { load } from "cheerio";

type SourceResult = {
  title: string;
  url: string;
  snippet: string;
  sourceType: "direct-video" | "hls" | "iptv-playlist" | "video-page" | "webpage";
  exactTitleMatch: boolean;
  host: string;
};

const VIDEO_HOSTS = [
  "youtube.com", "youtu.be", "vimeo.com", "dailymotion.com", "facebook.com",
  "drive.google.com", "streamable.com", "archive.org",
];

function classifySource(rawUrl: string): SourceResult["sourceType"] {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "webpage";
  }
  const path = url.pathname.toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogv)(?:$)/i.test(path)) return "direct-video";
  if (/\.(m3u8)(?:$)/i.test(path)) return "hls";
  if (/\.(m3u)(?:$)/i.test(path)) return "iptv-playlist";
  if (VIDEO_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith("." + host))) {
    return "video-page";
  }
  return "webpage";
}

function unwrapDuckDuckGoUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw, "https://html.duckduckgo.com");
    const redirected = parsed.searchParams.get("uddg");
    const candidate = redirected || parsed.href;
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.hostname === "html.duckduckgo.com" || url.hostname === "duckduckgo.com") return null;
    return url.href;
  } catch {
    return null;
  }
}

export async function handleSourceSearchRoute(request: Request, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/source-search") return null;
  if (request.method !== "GET") {
    return Response.json({ ok: false, error: "Use GET for source searches." }, { status: 405 });
  }

  const query = (url.searchParams.get("q") || "").trim().slice(0, 180);
  const limit = Math.min(15, Math.max(1, Number(url.searchParams.get("limit") || "10")));
  if (query.length < 2) {
    return Response.json({ ok: false, error: "Enter at least 2 characters to search." }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const searchUrl = new URL("https://html.duckduckgo.com/html/");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("kl", "wt-wt");

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; XoraTVSourceLab/0.1; +https://xoratv-x.onrender.com/source-lab)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      return Response.json({
        ok: false,
        error: `Web discovery returned HTTP ${response.status}. Try again shortly.`,
        query,
      }, { status: 502 });
    }

    const html = await response.text();
    const $ = load(html);
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
      results.push({
        title,
        url: resolvedUrl,
        snippet,
        host,
        sourceType: classifySource(resolvedUrl),
        exactTitleMatch: normalizedQuery.length > 0 && normalizedTitle.includes(normalizedQuery),
      });
    });

    return Response.json({
      ok: true,
      query,
      engine: "XoraTV discovery prototype",
      discoveryBackend: "DuckDuckGo public HTML results",
      elapsedMs: Date.now() - startedAt,
      count: results.length,
      results,
      note: "This prototype ranks public web results and classifies links visible in the result URL. A webpage result is not proof that a playable stream exists; source-page inspection and playback verification are separate next steps.",
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown discovery error";
    return Response.json({
      ok: false,
      query,
      error: message.includes("timed out") || message.includes("abort")
        ? "The web search timed out. Try again."
        : "Could not reach the web discovery source. Try again shortly.",
    }, { status: 502 });
  }
}
