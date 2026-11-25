
const GUIDE_INDEX_URL = "https://iptv-org.github.io/api/guides.json";
let guideIndexCache = null;
let guideIndexExpiry = 0;
const guideSourceCache = new Map();

async function readGuideText(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > 20 * 1024 * 1024) throw new Error("EPG source exceeds size limit");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 20 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("EPG source exceeds size limit");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) return new TextDecoder().decode(bytes);
  const decompressed = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const output = await new Response(decompressed).text();
  if (output.length > 60 * 1024 * 1024) throw new Error("Expanded EPG source exceeds size limit");
  return output;
}

function xmlDecode(value) {
  return value.replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).trim();
}
function xmlAttr(tag, name) {
  const escaped = name.replace(/[.*+?^\x24{}()|[\\]\\\\]/g, "\\\\const PLAYLISTS = [");
  return tag.match(new RegExp("\\b" + escaped + "=[\\\"']([^\\\"']*)[\\\"']", "i"))?.[1] || "";
}
function xmlTag(block, name) {
  const match = block.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i"));
  return match ? xmlDecode(match[1]) : "";
}
function xmlDate(value) {
  const match = value.trim().match(/^(\\d{4})(\\d{2})(\\d{2})(\\d{2})(\\d{2})(?:\\d{2})?(?:\\s+([+-]\\d{4}))?/);
  if (!match) return null;
  const [, y, mo, d, h, mi, zone] = match;
  const date = new Date(y + "-" + mo + "-" + d + "T" + h + ":" + mi + ":00" +
    (zone ? zone.slice(0, 3) + ":" + zone.slice(3) : "Z"));
  return Number.isNaN(date.getTime()) ? null : date;
}
async function getIptvOrgGuide(channelId, hours) {
  if (!guideIndexCache || guideIndexExpiry <= Date.now()) {
    const response = await fetch(GUIDE_INDEX_URL, {headers:{Accept:"application/json"}});
    if (!response.ok) throw new Error("EPG directory unavailable");
    const records = await response.json();
    if (!Array.isArray(records)) throw new Error("Invalid EPG directory");
    guideIndexCache = records;
    guideIndexExpiry = Date.now() + 6 * 60 * 60 * 1000;
  }
  const baseId = channelId.split("@")[0];
  const requestedFeed = channelId.includes("@") ? channelId.slice(channelId.indexOf("@") + 1) : "";
  const matches = guideIndexCache.filter(record => record.channel &&
    (record.channel === channelId || record.channel === baseId) &&
    (!requestedFeed || !record.feed || record.feed === requestedFeed));
  const sources = matches.flatMap(record => (record.sources || []).map(source => ({record, source})))
    .filter(({source}) => source.url && /^https?:\\/\\//i.test(source.url) &&
      (!source.format || source.format.toUpperCase().includes("XML"))).slice(0, 4);
  const ids = new Set([channelId]);
  for (const {record} of sources) {
    if (record.channel && record.feed) ids.add(record.channel + "@" + record.feed);
    if (record.channel) ids.add(record.channel);
  }
  const end = Date.now() + Math.min(Math.max(hours, 1), 24) * 3600000;
  for (const {source} of sources) {
    try {
      let xml = guideSourceCache.get(source.url);
      if (!xml || xml.expiry <= Date.now()) {
        const response = await fetch(source.url, {headers:{Accept:"application/xml,text/xml,application/gzip,*/*;q=0.7"}});
        if (!response.ok) throw new Error("EPG source unavailable");
        xml = {value: await readGuideText(response), expiry: Date.now() + 20 * 60 * 1000};
        guideSourceCache.set(source.url, xml);
        while (guideSourceCache.size > 3) guideSourceCache.delete(guideSourceCache.keys().next().value);
      }
      const programmes = [];
      const pattern = /<programme\\b[^>]*>[\\s\\S]*?<\\/programme>/gi;
      let match;
      while ((match = pattern.exec(xml.value))) {
        const block = match[0];
        const tag = block.slice(0, block.indexOf(">") + 1);
        const id = xmlAttr(tag, "channel");
        if (!ids.has(id)) continue;
        const start = xmlDate(xmlAttr(tag, "start"));
        const stop = xmlDate(xmlAttr(tag, "stop"));
        const now = Date.now();
        if (!start || !stop || stop.getTime() <= now || start.getTime() > end) continue;
        programmes.push({id:id + "-" + start.toISOString(), channelId:id,
          title:xmlTag(block,"title") || "Programme", description:xmlTag(block,"desc") || undefined,
          start:start.toISOString(), stop:stop.toISOString(),
          isLive:start.getTime() <= now && stop.getTime() > now});
        if (programmes.length >= 24) break;
      }
      if (programmes.length) return programmes.sort((a,b) => a.start.localeCompare(b.start));
    } catch (error) {
      console.warn("[EPG] source unavailable", error instanceof Error ? error.message : "unknown");
    }
  }
  return [];
}
\nconst PLAYLISTS = [
  { path: "index.m3u" },
  { path: "categories/kids.m3u", category: "kids" },
  { path: "categories/movies.m3u", category: "movies" },
  { path: "categories/series.m3u", category: "series" },
];
let cached = null;
let expiresAt = 0;
let loading = null;

function parsePlaylist(text, playlistCategory) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const info = (lines[i] || "").trim();
    if (!info.startsWith("#EXTINF:")) continue;
    const streamUrl = (lines[i + 1] || "").trim();
    if (!/^https?:\/\//i.test(streamUrl)) continue;
    const attrs = {};
    const re = /([\w-]+)="([^"]*)"/g;
    let match;
    while ((match = re.exec(info))) attrs[match[1]] = match[2];
    const comma = info.indexOf(",");
    const name = (comma >= 0 ? info.slice(comma + 1).trim() : attrs["tvg-name"] || "").trim();
    const id = (attrs["tvg-id"] || name).trim();
    if (!name || !id) continue;
    const group = attrs["group-title"] || "";
    const countryCode = id.match(/\.([a-z]{2})(?:@|$)/i)?.[1] || group.match(/(?:^|\s)([A-Z]{2})(?:\s|$)/)?.[1];
    rows.push({ id, name, logo: attrs["tvg-logo"] || null, group: group || null,
      country: countryCode?.toUpperCase() || null, streamUrl,
      quality: name.match(/\((\d{3,4}p)\)/i)?.[1] || null, playlistCategory: playlistCategory || null });
  }
  return rows;
}

function categoryOf(channel) {
  const name = String(channel.name || "");
  if (/wwe|wrestling/i.test(name)) return "sports";
  if (channel.playlistCategory) return channel.playlistCategory;
  const group = String(channel.group || "").toLowerCase();
  if (group.includes("news")) return "news";
  if (group.includes("sport")) return "sports";
  if (group.includes("movie") || group.includes("film")) return "movies";
  if (group.includes("music")) return "music";
  if (group.includes("kids") || group.includes("children")) return "kids";
  return "general";
}

async function getCatalogue() {
  if (cached && Date.now() < expiresAt) return cached;
  if (loading) return loading;
  loading = Promise.allSettled(PLAYLISTS.map(async playlist => {
    const response = await fetch("https://iptv-org.github.io/iptv/" + playlist.path);
    if (!response.ok) throw new Error("Playlist unavailable: " + response.status);
    return parsePlaylist(await response.text(), playlist.category);
  })).then(results => {
    const byId = new Map();
    let successful = 0;
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      successful++;
      for (const channel of result.value) {
        const id = String(channel.id);
        const existing = byId.get(id);
        if (!existing || (channel.playlistCategory && !existing.playlistCategory)) byId.set(id, channel);
      }
    }
    if (!successful) throw new Error("No IPTV catalogue source responded");
    cached = [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    expiresAt = Date.now() + 10 * 60 * 1000;
    loading = null;
    return cached;
  }).catch(error => { loading = null; throw error; });
  return loading;
}

function makeHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS || "https://xoratv-x.onrender.com").split(",").map(v => v.trim()).filter(Boolean);
  const permitted = !!origin && allowed.includes(origin);
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=60, s-maxage=300",
    "x-content-type-options": "nosniff",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    "vary": "Origin",
    ...(permitted ? { "access-control-allow-origin": origin } : {}),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const responseHeaders = makeHeaders(request, env);
    const origin = request.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS || "https://xoratv-x.onrender.com").split(",").map(v => v.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return Response.json({ ok: false, error: "Origin not allowed" }, { status: 403, headers: responseHeaders });
    if (request.method === "OPTIONS") {
      if (!origin || !allowed.includes(origin)) return new Response(null, { status: 403, headers: responseHeaders });
      return new Response(null, { status: 204, headers: { ...responseHeaders, "access-control-max-age": "86400" } });
    }
    if (request.method === "GET" && ["/health", "/api/health"].includes(url.pathname)) {
      return Response.json({ ok: true, service: "xoratv-edge-api", runtime: "cloudflare-workers" }, { headers: responseHeaders });
    }
    if (request.method === "GET" && url.pathname === "/api/tv/guide") {
      const channelId = (url.searchParams.get("channel") || "").trim();
      if (!channelId) return Response.json({ok:false,programmes:[],error:"Channel is required."},{status:400,headers:responseHeaders});
      try {
        const hours = Number(url.searchParams.get("hours") || "12");
        const programmes = await getIptvOrgGuide(channelId, Number.isFinite(hours) ? hours : 12);
        return Response.json({ok:true,channelId,programmes},{headers:{...responseHeaders,"cache-control":"public, max-age=300"}});
      } catch {
        return Response.json({ok:false,programmes:[],error:"TV guide is temporarily unavailable."},{status:502,headers:responseHeaders});
      }
    }
    if (request.method === "GET" && url.pathname === "/api/tv/channels") {
      try {
        const all = await getCatalogue();
        const query = (url.searchParams.get("q") || url.searchParams.get("query") || "").trim().toLowerCase();
        const country = (url.searchParams.get("country") || "").trim().toUpperCase();
        const category = (url.searchParams.get("category") || "").trim().toLowerCase();
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 10000);
        const channels = all.filter(channel =>
          (!query || String(channel.name).toLowerCase().includes(query) || String(channel.id).toLowerCase().includes(query)) &&
          (!country || channel.country === country) &&
          (!category || categoryOf(channel) === category)
        ).slice(0, limit).map(channel => ({
          id: channel.id, name: channel.name, country: channel.country,
          categories: [categoryOf(channel)], logo: channel.logo, streamUrl: channel.streamUrl,
          streamTitle: channel.name, quality: channel.quality,
          labels: [channel.group, channel.playlistCategory].filter(Boolean),
        }));
        return Response.json({ ok: true, total: channels.length, channels, source: "iptv-org" }, { headers: responseHeaders });
      } catch {
        return Response.json({ ok: false, total: 0, channels: [], error: "The live TV catalogue is temporarily unavailable." },
          { status: 503, headers: responseHeaders });
      }
    }
    return Response.json({ ok: false, error: "Not found" }, { status: 404, headers: responseHeaders });
  },
};
