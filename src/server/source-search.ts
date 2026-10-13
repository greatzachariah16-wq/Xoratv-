import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { load } from "cheerio";

type SourceType = "direct-video" | "hls" | "iptv-playlist" | "video-page" | "social-video" | "general-webpage";
type MediaCandidate = { url: string; kind: "video" | "hls" | "playlist" | "embed"; title?: string; status?: string };
type SourceResult = {
  title: string;
  url: string;
  snippet: string;
  sourceType: SourceType;
  pageKind: string;
  publishedYear: number | null;
  exactTitleMatch: boolean;
  host: string;
  inspected: boolean;
  pageTitle?: string;
  mediaCandidates: MediaCandidate[];
  playbackCheck: "not-checked" | "media-found" | "request-ok" | "request-failed";
  crawlDepth: number;
  browserError?: string;
  discoverySource?: string;
};
type IndexedPage = SourceResult & { indexedAt: number; queryTokens: string[] };

const VIDEO_HOSTS = ["youtube.com", "youtu.be", "vimeo.com", "dailymotion.com", "streamable.com", "archive.org", "drive.google.com"];
const SOCIAL_VIDEO_HOSTS = ["facebook.com", "tiktok.com", "instagram.com", "x.com", "twitter.com"];
const INDEX_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_INDEX_ENTRIES = 400;
const pageIndex = new Map<string, IndexedPage>();
const hostSafety = new Map<string, boolean>();

function isHost(hostname: string, domains: string[]) {
  return domains.some((host) => hostname === host || hostname.endsWith("." + host));
}
function classifySource(rawUrl: string): SourceType {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return "general-webpage"; }
  const path = url.pathname.toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogv|mpd)(?:$)/i.test(path)) return "direct-video";
  if (/\.m3u8(?:$)/i.test(path)) return "hls";
  if (/\.m3u(?:$)/i.test(path)) return "iptv-playlist";
  if (isHost(url.hostname, SOCIAL_VIDEO_HOSTS)) return "social-video";
  if (isHost(url.hostname, VIDEO_HOSTS)) return "video-page";
  return "general-webpage";
}
function pageKindFor(type: SourceType) {
  return type === "direct-video" ? "Direct video/media URL" :
    type === "hls" ? "HLS streaming playlist (.m3u8)" :
    type === "iptv-playlist" ? "M3U playlist file" :
    type === "social-video" ? "Social video page" :
    type === "video-page" ? "Video-hosting or sharing page" :
    "Webpage inspected for embedded media";
}
function unwrapDuckDuckGoUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw, "https://html.duckduckgo.com");
    const candidate = parsed.searchParams.get("uddg") || parsed.href;
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.hostname === "html.duckduckgo.com" || url.hostname === "duckduckgo.com") return null;
    return url.href;
  } catch { return null; }
}
function isPrivateIp(ip: string) {
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) return true;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224;
}
async function isPublicHttpUrl(raw: string): Promise<boolean> {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (isIP(host)) return !isPrivateIp(host);
    const cached = hostSafety.get(host);
    if (cached !== undefined) return cached;
    const records = await lookup(host, { all: true, verbatim: true });
    const safe = records.length > 0 && records.every((record) => !isPrivateIp(record.address));
    hostSafety.set(host, safe);
    return safe;
  } catch { return false; }
}
function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function titleTokens(value: string) {
  return normalize(value).split(/\s+/).filter((token) => token.length > 1);
}
function addToIndex(result: SourceResult, query: string) {
  pageIndex.delete(result.url);
  pageIndex.set(result.url, { ...result, indexedAt: Date.now(), queryTokens: titleTokens(query) });
  while (pageIndex.size > MAX_INDEX_ENTRIES) pageIndex.delete(pageIndex.keys().next().value as string);
}
function pruneIndex() {
  const now = Date.now();
  for (const [key, item] of pageIndex) if (now - item.indexedAt > INDEX_TTL_MS) pageIndex.delete(key);
}
function scoreIndexed(item: IndexedPage, query: string) {
  const q = titleTokens(query);
  const title = normalize(item.title + " " + (item.pageTitle || ""));
  const text = normalize(item.snippet);
  let score = 0;
  for (const token of q) {
    if (title.includes(token)) score += 5;
    else if (text.includes(token)) score += 1;
  }
  if (item.mediaCandidates.length) score += 12;
  if (item.playbackCheck === "request-ok") score += 20;
  return score;
}
async function fetchSearchResults(query: string, limit: number): Promise<SourceResult[]> {
  // Deliberately broad discovery: do not assume the title is a recent theatrical movie,
  // and do not filter out older, silent, black-and-white, foreign-language, or alternate cuts.
  const variants = [
    '"' + query + '"',
    query + " movie film watch stream",
    query + " full title video source",
  ];
  const searches = variants.flatMap((q) => [
    { engine: "DuckDuckGo", url: (() => {
      const u = new URL("https://html.duckduckgo.com/html/");
      u.searchParams.set("q", q);
      u.searchParams.set("kl", "wt-wt");
      return u;
    })() },
    { engine: "Bing", url: (() => {
      const u = new URL("https://www.bing.com/search");
      u.searchParams.set("q", q);
      u.searchParams.set("count", String(Math.min(10, limit)));
      return u;
    })() },
  ]);
  const outputs = await Promise.all(searches.map(async ({ engine, url: searchUrl }) => {
    try {
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 XoraTVSourceLab/0.4",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.8",
        },
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) return [];
      const $ = load(await response.text());
      const found: SourceResult[] = [];
      const selector = engine === "Bing" ? "li.b_algo" : ".result";
      $(selector).each((_, element) => {
        if (found.length >= limit) return false;
        const anchor = engine === "Bing"
          ? $(element).find("h2 a").first()
          : $(element).find(".result__a").first();
        const title = anchor.text().replace(/\s+/g, " ").trim();
        const rawHref = anchor.attr("href");
        const resolvedUrl = rawHref
          ? (engine === "Bing" ? (() => {
              try {
                const u = new URL(rawHref, "https://www.bing.com");
                if (!["http:", "https:"].includes(u.protocol)) return null;
                if (u.hostname === "www.bing.com" && u.pathname === "/ck/a") {
                  const encoded = u.searchParams.get("u") || "";
                  const decoded = encoded.startsWith("a1") ? encoded.slice(2) : encoded;
                  try { return new URL(decoded, "https://www.bing.com").href; } catch { return null; }
                }
                return u.href;
              } catch { return null; }
            })() : unwrapDuckDuckGoUrl(rawHref))
          : null;
        if (!title || !resolvedUrl) return;
        let resultHost = "";
        try { resultHost = new URL(resolvedUrl).hostname.replace(/^www\./, ""); } catch {}
        // Avoid search engine internal links and malformed redirect URLs.
        if (!resultHost || /(^|\.)bing\.com$|(^|\.)duckduckgo\.com$/.test(resultHost)) return;
        const snippet = (engine === "Bing"
          ? $(element).find(".b_caption p, p").first().text()
          : $(element).find(".result__snippet").first().text()).replace(/\s+/g, " ").trim();
        const years = (title + " " + snippet).match(/\b(?:18\d{2}|19\d{2}|20\d{2})\b/g)?.map(Number) || [];
        const publishedYear = years.find((year) => year >= 1800 && year <= new Date().getFullYear()) ?? null;
        const sourceType = classifySource(resolvedUrl);
        found.push({
          title, url: resolvedUrl, snippet, host: resultHost, sourceType, pageKind: pageKindFor(sourceType), publishedYear,
          exactTitleMatch: normalize(title).includes(normalize(query)), inspected: false, mediaCandidates: [],
          playbackCheck: "not-checked", crawlDepth: 0, discoverySource: engine,
        } as SourceResult);
      });
      return found;
    } catch {
      return [];
    }
  }));
  const unique = new Map<string, SourceResult>();
  for (const result of outputs.flat()) {
    const previous = unique.get(result.url);
    if (!previous || (!previous.snippet && result.snippet)) unique.set(result.url, result);
  }
  // Keep diversity across hosts; sorting is applied after media inspection.
  return [...unique.values()].slice(0, Math.max(limit * 3, 12));
}
async function fetchPublicPage(rawUrl: string) {
  let current = new URL(rawUrl);
  for (let hop = 0; hop <= 4; hop++) {
    if (!(await isPublicHttpUrl(current.href))) throw new Error("Target or redirect resolves to a private or blocked address.");
    const response = await fetch(current.href, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; XoraTVSourceLab/HTTP; +https://xoratv-x.onrender.com/source-lab)",
        Accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.8,*/*;q=0.5",
      },
      signal: AbortSignal.timeout(6500),
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => {});
      if (hop === 4) throw new Error("Redirect limit reached.");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error("HTTP " + response.status + " " + response.statusText);
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (size < 500_000) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        const chunk = value.subarray(0, 500_000 - size);
        chunks.push(chunk);
        size += chunk.byteLength;
        if (chunk.byteLength < value.byteLength) break;
      }
      await reader.cancel().catch(() => {});
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { url: current.href, html: new TextDecoder().decode(bytes) };
  }
  throw new Error("Could not follow the source URL.");
}

async function inspectPages(seeds: SourceResult[], query: string, maxPages: number) {
  const queue: Array<{ result: SourceResult; depth: number }> = seeds.slice(0, maxPages).map((result) => ({ result, depth: 0 }));
  const visited = new Set<string>();
  const inspected: SourceResult[] = [];
  while (queue.length && inspected.length < maxPages) {
    const item = queue.shift()!;
    if (visited.has(item.result.url)) continue;
    visited.add(item.result.url);
    try {
      const fetched = await fetchPublicPage(item.result.url);
      const $ = load(fetched.html);
      const pageTitle = $("title").first().text().replace(/\s+/g, " ").trim();
      const description = $('meta[name="description"]').attr("content")?.trim() || "";
      const media: MediaCandidate[] = [];
      const addMedia = (raw: string | undefined, kind: MediaCandidate["kind"], title?: string) => {
        if (!raw) return;
        try {
          const parsed = new URL(raw, fetched.url);
          if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return;
          if (!media.some((candidate) => candidate.url === parsed.href)) media.push({ url: parsed.href, kind, title });
        } catch {}
      };
      $("video").each((_, element) => {
        const video = $(element);
        addMedia(video.attr("src") || video.find("source").first().attr("src"), "video", video.attr("title") || video.attr("aria-label"));
        video.find("source[src]").each((__, source) => {
          const raw = $(source).attr("src");
          addMedia(raw, /\.m3u8(?:[?#]|$)/i.test(raw || "") ? "hls" : "video", $(source).attr("type"));
        });
      });
      $('source[src], a[href], meta[property="og:video"], meta[name="twitter:player"], iframe[src]').each((_, element) => {
        const node = $(element);
        const tag = (element as { tagName?: string }).tagName?.toLowerCase() || "";
        const raw = tag === "meta" ? node.attr("content") : node.attr("href") || node.attr("src");
        if (!raw) return;
        if (/\.m3u8(?:[?#]|$)/i.test(raw)) addMedia(raw, "hls");
        else if (/\.m3u(?:[?#]|$)/i.test(raw)) addMedia(raw, "playlist");
        else if (/\.(mp4|webm|mov|m4v|ogv|mpd)(?:[?#]|$)/i.test(raw)) addMedia(raw, "video");
        else if (tag === "iframe" || tag === "meta") addMedia(raw, "embed", node.attr("title") || node.attr("content"));
      });
      $('script[type="application/ld+json"]').each((_, element) => {
        const value = $(element).text();
        for (const match of value.matchAll(/"(?:contentUrl|embedUrl|url)"\s*:\s*"([^"]+)"/g)) {
          try {
            const raw = match[1].replace(/\\\//g, "/");
            if (/\.m3u8(?:[?#]|$)/i.test(raw)) addMedia(raw, "hls");
            else if (/\.(mp4|webm|mov|m4v|ogv|mpd)(?:[?#]|$)/i.test(raw)) addMedia(raw, "video");
            else if (/embed/i.test(raw)) addMedia(raw, "embed");
          } catch {}
        }
      });
      const links: Array<{ url: string; text: string; title: string }> = [];
      $("a[href]").each((_, element) => {
        const node = $(element);
        const text = node.text().replace(/\s+/g, " ").trim();
        const title = (node.attr("title") || "").trim();
        try {
          const url = new URL(node.attr("href") || "", fetched.url).href;
          if (text.length > 2 && ["http:", "https:"].includes(new URL(url).protocol)) links.push({ url, text, title });
        } catch {}
      });

      item.result.inspected = true;
      item.result.url = fetched.url;
      item.result.pageTitle = pageTitle;
      item.result.snippet = description || item.result.snippet;
      item.result.mediaCandidates = media.slice(0, 12);
      item.result.crawlDepth = item.depth;
      if (item.result.mediaCandidates.length) {
        item.result.playbackCheck = "media-found";
        const direct = item.result.mediaCandidates.find((candidate) => ["video", "hls", "playlist"].includes(candidate.kind));
        if (direct) {
          const ok = await checkMediaUrl(direct.url);
          item.result.playbackCheck = ok ? "request-ok" : "request-failed";
          direct.status = ok ? "HTTP response received" : "Media request did not succeed";
        }
      }
      const allText = normalize([item.result.title, pageTitle, description].join(" "));
      item.result.exactTitleMatch = normalize(query).split(" ").filter(Boolean).every((token) => allText.includes(token));
      item.result.host = (() => { try { return new URL(fetched.url).hostname.replace(/^www\./, ""); } catch { return item.result.host; } })();
      item.result.sourceType = media.some((candidate) => candidate.kind === "hls") ? "hls" :
        media.some((candidate) => candidate.kind === "playlist") ? "iptv-playlist" :
        media.some((candidate) => candidate.kind === "video") ? "direct-video" : item.result.sourceType;
      item.result.pageKind = media.length ? "HTTP-inspected page with " + media.length + " media candidate(s)" : pageKindFor(item.result.sourceType);
      inspected.push(item.result);
      addToIndex(item.result, query);

      if (item.depth < 1 && inspected.length + queue.length < maxPages) {
        const queryWords = titleTokens(query).filter((word) => word.length >= 4);
        const related = links
          .filter((link) => link.url !== item.result.url && queryWords.some((word) => normalize(link.text + " " + link.title + " " + link.url).includes(word)))
          .filter((link) => classifySource(link.url) !== "general-webpage" || /watch|video|player|stream|episode|movie|film/i.test(link.text + " " + link.title + " " + link.url))
          .slice(0, 2);
        for (const link of related) {
          if (queue.length + inspected.length >= maxPages || visited.has(link.url)) break;
          const type = classifySource(link.url);
          queue.push({ depth: item.depth + 1, result: {
            title: link.text || link.title || link.url, url: link.url,
            snippet: "Discovered by XoraTV while inspecting " + item.result.host,
            host: (() => { try { return new URL(link.url).hostname.replace(/^www\./, ""); } catch { return ""; } })(),
            sourceType: type, pageKind: pageKindFor(type), publishedYear: null, exactTitleMatch: false, inspected: false,
            mediaCandidates: [], playbackCheck: "not-checked", crawlDepth: item.depth + 1,
          } });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      item.result.inspected = false;
      item.result.pageKind = "HTTP request failed: " + message.slice(0, 120);
      item.result.playbackCheck = "not-checked";
      inspected.push(item.result);
    }
  }
  return inspected;
}

async function checkMediaUrl(rawUrl: string) {
  if (!(await isPublicHttpUrl(rawUrl))) return false;
  try {
    const response = await fetch(rawUrl, {
      method: "GET",
      headers: { Range: "bytes=0-1023", "User-Agent": "Mozilla/5.0 XoraTVSourceLab/0.3" },
      redirect: "manual",
      signal: AbortSignal.timeout(3500),
    });
    const ok = response.status >= 200 && response.status < 400;
    await response.body?.cancel().catch(() => {});
    return ok;
  } catch { return false; }
}

export async function handleSourceSearchRoute(request: Request, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/source-search") return null;
  if (request.method !== "GET") return Response.json({ ok: false, error: "Use GET for source searches." }, { status: 405 });
  const query = (url.searchParams.get("q") || "").trim().slice(0, 180);
  const limit = Math.min(8, Math.max(1, Number(url.searchParams.get("limit") || "8")));
  if (query.length < 2) return Response.json({ ok: false, error: "Enter at least 2 characters to search." }, { status: 400 });

  const startedAt = Date.now();
  pruneIndex();
  const indexedMatches = [...pageIndex.values()]
    .filter((item) => titleTokens(query).some((token) => normalize(item.title + " " + (item.pageTitle || "") + " " + item.snippet).includes(token)))
    .sort((a, b) => scoreIndexed(b, query) - scoreIndexed(a, query))
    .slice(0, Math.min(4, limit))
    .map(({ indexedAt: _indexedAt, queryTokens: _queryTokens, ...item }) => ({ ...item, indexedFromCache: true }));
  try {
    const fresh = await fetchSearchResults(query, Math.max(limit, 8));
    const combined = new Map<string, SourceResult>();
    for (const result of [...indexedMatches, ...fresh]) if (!combined.has(result.url)) combined.set(result.url, result);
    const seeds = [...combined.values()].slice(0, Math.min(12, Math.max(8, limit * 2)));
    const inspected = await inspectPages(seeds, query, Math.min(16, Math.max(8, limit * 2)));
    for (const result of fresh) if (!result.inspected) addToIndex(result, query);
    const all = new Map<string, SourceResult>();
    for (const result of inspected) {
      const previous = all.get(result.url);
      if (!previous || (!previous.inspected && result.inspected) || (previous.playbackCheck !== "request-ok" && result.playbackCheck === "request-ok")) all.set(result.url, result);
    }
    const results = [...all.values()]
      .sort((a, b) => Number(b.playbackCheck === "request-ok") - Number(a.playbackCheck === "request-ok") ||
        Number(b.mediaCandidates.length > 0) - Number(a.mediaCandidates.length > 0) ||
        Number(b.exactTitleMatch) - Number(a.exactTitleMatch))
      .slice(0, limit);
    return Response.json({
      ok: true,
      query,
      engine: "XoraTV HTTP crawler and discovery index",
      discoveryBackend: "Parallel DuckDuckGo + Bing search variants, Node.js HTTP fetch, Cheerio HTML inspection, bounded related-link crawl, media URL probes, and XoraTV in-memory page index",
      yearFocus: "No release-year restriction; results may include older films, alternate cuts, foreign-language releases, and newer titles",
      elapsedMs: Date.now() - startedAt,
      count: results.length,
      inspectedCount: inspected.length,
      indexedPageCount: pageIndex.size,
      indexPersistence: "In-memory with 24-hour TTL; resets when the server restarts or deploys",
      results,
      note: "Searches multiple public search engines with broad title variants, inspects returned HTML, video/source tags, iframe/meta and JSON-LD media hints, follows relevant links one level deep, and probes candidate media URLs. No release-year or open-license-only filter is applied. No Chromium or headless browser is used. A successful HTTP response does not guarantee playback; access controls, cookies, DRM, referrers, codecs and player compatibility can still prevent playback. Some websites block automated requests or require login.",
    }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown discovery error";
    console.error("[XoraTV Source Lab] discovery failed:", error);
    const runtimeHint = /timed out|abort/i.test(message)
      ? "The HTTP request timed out. Try again with a smaller result limit."
      : "Check the server logs for the recorded HTTP request error.";
    return Response.json({
      ok: false,
      query,
      error: /timed out|abort/i.test(message)
        ? "The web search or HTTP page inspection timed out. Try again."
        : "Could not run the HTTP discovery pass.",
      runtimeHint,
      runtimeError: message.slice(0, 240),
    }, { status: 502 });
  }
}
