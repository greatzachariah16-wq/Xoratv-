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
  const variants = [
    "(" + query + ") (movie OR film OR full movie) after:1999 -silent -black-and-white",
    '"' + query + '" video OR stream OR watch',
  ];
  const outputs = await Promise.all(variants.map(async (q) => {
    try {
      const searchUrl = new URL("https://html.duckduckgo.com/html/");
      searchUrl.searchParams.set("q", q);
      searchUrl.searchParams.set("kl", "wt-wt");
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; XoraTVSourceLab/0.3; +https://xoratv-x.onrender.com/source-lab)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) return [];
      const $ = load(await response.text());
      const found: SourceResult[] = [];
      $(".result").each((_, element) => {
        if (found.length >= limit) return false;
        const anchor = $(element).find(".result__a").first();
        const title = anchor.text().replace(/\s+/g, " ").trim();
        const rawHref = anchor.attr("href");
        const resolvedUrl = rawHref ? unwrapDuckDuckGoUrl(rawHref) : null;
        if (!title || !resolvedUrl) return;
        const snippet = $(element).find(".result__snippet").first().text().replace(/\s+/g, " ").trim();
        let host = "";
        try { host = new URL(resolvedUrl).hostname.replace(/^www\./, ""); } catch {}
        const years = (title + " " + snippet).match(/\b(?:19\d{2}|20\d{2})\b/g)?.map(Number) || [];
        const publishedYear = years.find((year) => year >= 2000 && year <= new Date().getFullYear()) ?? null;
        const sourceType = classifySource(resolvedUrl);
        found.push({
          title, url: resolvedUrl, snippet, host, sourceType, pageKind: pageKindFor(sourceType), publishedYear,
          exactTitleMatch: normalize(title).includes(normalize(query)), inspected: false, mediaCandidates: [],
          playbackCheck: "not-checked", crawlDepth: 0,
        });
      });
      return found;
    } catch { return []; }
  }));
  const unique = new Map<string, SourceResult>();
  for (const result of outputs.flat()) if (!unique.has(result.url)) unique.set(result.url, result);
  return [...unique.values()].slice(0, limit);
}
async function inspectPages(seeds: SourceResult[], query: string, maxPages: number) {
  const queue: Array<{ result: SourceResult; depth: number }> = seeds.slice(0, maxPages).map((result) => ({ result, depth: 0 }));
  const visited = new Set<string>();
  const inspected: SourceResult[] = [];
  let browser: Awaited<ReturnType<(typeof import("puppeteer"))["default"]["launch"]>> | null = null;
  try {
    const puppeteer = await import("puppeteer");
    browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    while (queue.length && inspected.length < maxPages) {
      const item = queue.shift()!;
      if (visited.has(item.result.url)) continue;
      visited.add(item.result.url);
      if (!(await isPublicHttpUrl(item.result.url))) continue;
      const page = await browser.newPage();
      try {
        page.setDefaultNavigationTimeout(6500);
        page.setDefaultTimeout(2500);
        await page.setRequestInterception(true);
        page.on("request", (request) => {
          const resourceType = request.resourceType();
          if (["image", "font", "media", "other"].includes(resourceType)) {
            void request.abort().catch(() => {});
            return;
          }
          void isPublicHttpUrl(request.url()).then((safe) => {
            if (safe) return request.continue().catch(() => {});
            return request.abort().catch(() => {});
          }).catch(() => request.abort().catch(() => {}));
        });
        await page.goto(item.result.url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(450).catch(() => {});
        const details = await page.evaluate(() => {
          const clean = (value: string | null | undefined) => (value || "").trim();
          const absolute = (value: string) => {
            try { return new URL(value, location.href).href; } catch { return ""; }
          };
          const media: Array<{ url: string; kind: "video" | "hls" | "playlist" | "embed"; title?: string }> = [];
          const add = (raw: string, kind: "video" | "hls" | "playlist" | "embed", title?: string) => {
            const url = absolute(raw);
            if (!url || media.some((item) => item.url === url)) return;
            media.push({ url, kind, title });
          };
          document.querySelectorAll("video").forEach((video) => {
            add(video.currentSrc || video.src || video.querySelector("source")?.src || "", "video", clean(video.getAttribute("aria-label") || video.getAttribute("title")));
            video.querySelectorAll("source").forEach((source) => add(source.src || source.getAttribute("src") || "", /\.m3u8/i.test(source.src) ? "hls" : "video", clean(source.type)));
          });
          document.querySelectorAll('source[src], a[href], meta[property="og:video"], meta[name="twitter:player"], iframe[src]').forEach((node) => {
            const el = node as HTMLAnchorElement;
            const raw = el instanceof HTMLMetaElement ? el.content : el instanceof HTMLIFrameElement ? el.src : el.getAttribute("href") || el.getAttribute("src") || "";
            if (!raw) return;
            if (/\.m3u8(?:[?#]|$)/i.test(raw)) add(raw, "hls");
            else if (/\.m3u(?:[?#]|$)/i.test(raw)) add(raw, "playlist");
            else if (/\.(mp4|webm|mov|m4v|ogv|mpd)(?:[?#]|$)/i.test(raw)) add(raw, "video");
            else if (el instanceof HTMLIFrameElement || el instanceof HTMLMetaElement) add(raw, "embed", clean(el.getAttribute("title") || el.getAttribute("content") || ""));
          });
          const links = Array.from(document.querySelectorAll("a[href]")).map((a) => ({
            url: absolute((a as HTMLAnchorElement).href),
            text: clean(a.textContent),
            title: clean((a as HTMLAnchorElement).title),
          })).filter((a) => a.url && a.text.length > 2);
          const structured: string[] = [];
          document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
            const value = script.textContent || "";
            for (const match of value.matchAll(/"(?:contentUrl|embedUrl|url)"\s*:\s*"([^"]+)"/g)) {
              try { structured.push(new URL(match[1].replace(/\\\//g, "/"), location.href).href); } catch {}
            }
          });
          structured.forEach((url) => {
            if (/\.m3u8(?:[?#]|$)/i.test(url)) add(url, "hls");
            else if (/\.(mp4|webm|mov|m4v|ogv|mpd)(?:[?#]|$)/i.test(url)) add(url, "video");
            else if (/embed/i.test(url)) add(url, "embed");
          });
          return {
            pageTitle: document.title || "",
            description: clean(document.querySelector('meta[name="description"]')?.getAttribute("content")),
            media: media.slice(0, 30),
            links: links.slice(0, 500),
            finalUrl: location.href,
          };
        });
        item.result.inspected = true;
        item.result.pageTitle = details.pageTitle;
        item.result.snippet = details.description || item.result.snippet;
        item.result.mediaCandidates = details.media.filter((candidate) => {
          try {
            const u = new URL(candidate.url);
            return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password;
          } catch { return false; }
        }).slice(0, 12);
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
        const allText = normalize([item.result.title, details.pageTitle, details.description].join(" "));
        item.result.exactTitleMatch = normalize(query).split(" ").filter(Boolean).every((token) => allText.includes(token));
        item.result.host = (() => { try { return new URL(details.finalUrl).hostname.replace(/^www\./, ""); } catch { return item.result.host; } })();
        item.result.sourceType = item.result.mediaCandidates.some((candidate) => candidate.kind === "hls") ? "hls" :
          item.result.mediaCandidates.some((candidate) => candidate.kind === "playlist") ? "iptv-playlist" :
          item.result.mediaCandidates.some((candidate) => candidate.kind === "video") ? "direct-video" : item.result.sourceType;
        item.result.pageKind = item.result.mediaCandidates.length ? "Inspected page with " + item.result.mediaCandidates.length + " media candidate(s)" : pageKindFor(item.result.sourceType);
        inspected.push(item.result);
        addToIndex(item.result, query);

        // Follow a small number of relevant links, one level deep, to discover linked watch/share pages.
        if (item.depth < 1 && inspected.length + queue.length < maxPages) {
          const queryWords = titleTokens(query).filter((word) => word.length >= 4);
          const related = details.links
            .filter((link) => link.url !== item.result.url && queryWords.some((word) => normalize(link.text + " " + link.title + " " + link.url).includes(word)))
            .filter((link) => classifySource(link.url) !== "general-webpage" || /watch|video|player|stream|episode|movie|film/i.test(link.text + " " + link.title + " " + link.url))
            .slice(0, 2);
          for (const link of related) {
            if (queue.length + inspected.length >= maxPages || visited.has(link.url)) break;
            const type = classifySource(link.url);
            queue.push({ depth: item.depth + 1, result: {
              title: link.text || link.title || link.url, url: link.url, snippet: "Discovered by XoraTV while inspecting " + item.result.host,
              host: (() => { try { return new URL(link.url).hostname.replace(/^www\./, ""); } catch { return ""; } })(),
              sourceType: type, pageKind: pageKindFor(type), publishedYear: null, exactTitleMatch: false, inspected: false,
              mediaCandidates: [], playbackCheck: "not-checked", crawlDepth: item.depth + 1,
            } });
          }
        }
      } catch {
        item.result.inspected = true;
        item.result.pageKind = "Page could not be fully inspected (timeout, block, or browser error)";
        addToIndex(item.result, query);
        inspected.push(item.result);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser?.close().catch(() => {});
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
  const limit = Math.min(12, Math.max(1, Number(url.searchParams.get("limit") || "8")));
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
    const seeds = [...combined.values()].slice(0, Math.min(6, limit));
    const inspected = await inspectPages(seeds, query, Math.min(6, Math.max(3, limit)));
    for (const result of fresh) if (!result.inspected) addToIndex(result, query);
    const all = new Map<string, SourceResult>();
    for (const result of [...inspected, ...fresh, ...indexedMatches]) {
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
      engine: "XoraTV headless crawler and discovery index",
      discoveryBackend: "DuckDuckGo seed discovery + Puppeteer headless browser + XoraTV in-memory page index",
      yearFocus: "2000 to present (search bias, not authoritative verification)",
      elapsedMs: Date.now() - startedAt,
      count: results.length,
      inspectedCount: inspected.length,
      indexedPageCount: pageIndex.size,
      indexPersistence: "In-memory with 24-hour TTL; resets when the server restarts or deploys",
      results,
      note: "XoraTV now opens a limited number of discovered pages in a headless browser, inspects rendered DOM, video/source tags, iframe/meta and JSON-LD media hints, follows a small number of relevant links one level deep, and probes one candidate media URL. A successful HTTP response is not a guarantee of playback; CORS, cookies, DRM, referrers, codecs and player compatibility can still prevent playback. Some websites block automation or require login.",
    }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown discovery error";
    return Response.json({
      ok: false, query,
      error: message.includes("timed out") || message.includes("abort") ? "The web search or page inspection timed out. Try again." : "Could not run the headless discovery pass. Check the browser runtime and try again.",
      detail: process.env.NODE_ENV === "development" ? message : undefined,
    }, { status: 502 });
  }
}
