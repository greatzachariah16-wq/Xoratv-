/**
 * IPTV-org published EPG integration.
 *
 * IPTV-org's guides.json maps channel/feed IDs to public XMLTV guide sources.
 * We fetch only the source(s) listed for the requested channel, cache the
 * metadata and guide documents, and return the same programme shape used by
 * the existing XoraTV guide UI.
 */

export type IptvOrgProgramme = {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  start: string;
  stop: string;
  isLive: boolean;
};

type GuideSource = {
  host?: string;
  url?: string;
  format?: string;
};

type GuideRecord = {
  channel?: string | null;
  feed?: string | null;
  site?: string;
  site_id?: string;
  site_name?: string;
  lang?: string;
  sources?: GuideSource[];
};

const GUIDES_INDEX_URL = "https://iptv-org.github.io/api/guides.json";
const INDEX_TTL_MS = 6 * 60 * 60 * 1000;
const SOURCE_TTL_MS = 20 * 60 * 1000;
const MAX_GUIDE_BYTES = 30 * 1024 * 1024;
const MAX_SOURCES_PER_CHANNEL = 4;

let indexCache: { records: GuideRecord[]; expiresAt: number } | null = null;
let indexLoading: Promise<GuideRecord[]> | null = null;
const sourceCache = new Map<string, { xml: string; expiresAt: number }>();
const sourceLoading = new Map<string, Promise<string>>();

async function loadGuideIndex(): Promise<GuideRecord[]> {
  if (indexCache && indexCache.expiresAt > Date.now()) return indexCache.records;
  if (indexLoading) return indexLoading;

  indexLoading = fetch(GUIDES_INDEX_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  }).then(async (response) => {
    if (!response.ok) throw new Error("IPTV-org guide directory returned " + response.status);
    const records = await response.json() as GuideRecord[];
    if (!Array.isArray(records)) throw new Error("IPTV-org guide directory is invalid");
    indexCache = { records, expiresAt: Date.now() + INDEX_TTL_MS };
    return records;
  }).finally(() => {
    indexLoading = null;
  });

  return indexLoading;
}

async function readLimitedBody(response: Response): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_GUIDE_BYTES) throw new Error("EPG source is larger than the allowed limit");
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > MAX_GUIDE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("EPG source exceeded the allowed size limit");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function loadGuideSource(sourceUrl: string): Promise<string> {
  const cached = sourceCache.get(sourceUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.xml;
  const pending = sourceLoading.get(sourceUrl);
  if (pending) return pending;

  const task = (async () => {
    const parsedUrl = new URL(sourceUrl);
    if (!/^https?:$/.test(parsedUrl.protocol)) throw new Error("Unsupported EPG source protocol");
    const response = await fetch(parsedUrl.toString(), {
      headers: { Accept: "application/xml,text/xml,application/gzip,*/*;q=0.7" },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error("EPG source returned " + response.status);
    const bytes = await readLimitedBody(response);
    const isGzip = parsedUrl.pathname.toLowerCase().endsWith(".gz")
      || response.headers.get("content-type")?.toLowerCase().includes("gzip");
    let xml: string;
    if (isGzip) {
      const { gunzipSync } = await import("node:zlib");
      xml = gunzipSync(bytes, { maxOutputLength: MAX_GUIDE_BYTES * 4 }).toString("utf8");
    } else {
      xml = bytes.toString("utf8");
    }
    if (!xml.includes("<tv") || !xml.includes("<programme")) {
      throw new Error("EPG source did not contain XMLTV programme data");
    }
    sourceCache.set(sourceUrl, { xml, expiresAt: Date.now() + SOURCE_TTL_MS });
    return xml;
  })().finally(() => {
    sourceLoading.delete(sourceUrl);
  });

  sourceLoading.set(sourceUrl, task);
  return task;
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .trim();
}

function readXmlAttribute(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^\x24{}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp("\\b" + escaped + "=[\"']([^\"']*)[\"']", "i"))?.[1] || "";
}

function readXmlTag(block: string, name: string): string {
  const match = block.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i"));
  return match ? decodeXml(match[1]) : "";
}

function parseXmlTvDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(?:\d{2})?(?:\s+([+-]\d{4}))?/);
  if (!match) return null;
  const [, year, month, day, hour, minute, offset] = match;
  const iso = year + "-" + month + "-" + day + "T" + hour + ":" + minute + ":00"
    + (offset ? offset.slice(0, 3) + ":" + offset.slice(3) : "Z");
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseProgrammes(xml: string, channelIds: Set<string>, hours: number): IptvOrgProgramme[] {
  const now = Date.now();
  const end = now + Math.min(Math.max(hours, 1), 24) * 60 * 60 * 1000;
  const programmes: IptvOrgProgramme[] = [];
  const pattern = /<programme\b[^>]*>[\s\S]*?<\/programme>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml))) {
    const block = match[0];
    const channelId = readXmlAttribute(block.slice(0, block.indexOf(">") + 1), "channel");
    if (!channelIds.has(channelId)) continue;
    const start = parseXmlTvDate(readXmlAttribute(block.slice(0, block.indexOf(">") + 1), "start"));
    const stop = parseXmlTvDate(readXmlAttribute(block.slice(0, block.indexOf(">") + 1), "stop"));
    if (!start || !stop || stop.getTime() <= now || start.getTime() > end) continue;

    const title = readXmlTag(block, "title") || "Programme";
    const description = readXmlTag(block, "desc") || undefined;
    programmes.push({
      id: channelId + "-" + start.toISOString(),
      channelId,
      title,
      description,
      start: start.toISOString(),
      stop: stop.toISOString(),
      isLive: start.getTime() <= now && stop.getTime() > now,
    });
    if (programmes.length >= 24) break;
  }

  return programmes.sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Returns [] when the IPTV-org directory has no usable guide data. The caller
 * can then preserve its existing provider fallback without blocking playback.
 */
export async function getIptvOrgGuide(channelId: string, hours = 12): Promise<IptvOrgProgramme[]> {
  const cleanId = channelId.trim();
  if (!cleanId) return [];

  const records = await loadGuideIndex();
  const baseId = cleanId.split("@")[0];
  const requestedFeed = cleanId.includes("@") ? cleanId.slice(cleanId.indexOf("@") + 1) : "";
  const matches = records.filter((record) =>
    Boolean(record.channel) &&
    (record.channel === cleanId || record.channel === baseId) &&
    (!requestedFeed || !record.feed || record.feed === requestedFeed),
  );

  const sources = matches
    .flatMap((record) => (record.sources || []).map((source) => ({ record, source })))
    .filter(({ source }) => {
      if (!source.url || !/^https?:\/\//i.test(source.url)) return false;
      const format = (source.format || "").toUpperCase();
      return !format || format.includes("XML");
    })
    .slice(0, MAX_SOURCES_PER_CHANNEL);

  if (!sources.length) return [];

  const xmltvIds = new Set<string>([cleanId]);
  for (const { record } of sources) {
    if (record.channel && record.feed) xmltvIds.add(record.channel + "@" + record.feed);
    if (record.channel) xmltvIds.add(record.channel);
  }

  for (const { source } of sources) {
    try {
      const xml = await loadGuideSource(source.url!);
      const programmes = parseProgrammes(xml, xmltvIds, hours);
      if (programmes.length) return programmes;
    } catch (error) {
      console.warn("[IPTV-org EPG] Source unavailable:", {
        host: source.host || (() => { try { return new URL(source.url!).hostname; } catch { return "unknown"; } })(),
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return [];
}
