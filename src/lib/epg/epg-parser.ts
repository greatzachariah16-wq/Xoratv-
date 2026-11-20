import type { EpgChannel, EpgProgramme } from "./epg-store";

const WINDOW_PAST_MS = 2 * 60 * 60 * 1000;
const WINDOW_FUTURE_MS = 48 * 60 * 60 * 1000;

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16))).trim();
}

function attr(tag: string, key: string): string {
  return tag.match(new RegExp("\\b" + key + "=[\\\"']([^\\\"']*)[\\\"']", "i"))?.[1] || "";
}

function xmltvTimestamp(raw: string): number | null {
  const match = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-])(\d{2})(\d{2}))?/);
  if (!match) return null;
  const [, y, mo, d, h, mi, sec = "00", sign, offH = "00", offM = "00"] = match;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec));
  const offset = (Number(offH) * 60 + Number(offM)) * 60_000 * (sign === "-" ? -1 : 1);
  return utc - offset;
}

function tagText(block: string, tag: string): string {
  const match = block.match(new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "i"));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "")) : "";
}

async function* chunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* parseXmltvStream(
  input: ReadableStream<Uint8Array>,
  options: { gzip?: boolean; batchSize?: number; now?: number; onChannels?: (channels: EpgChannel[]) => Promise<void> | void } = {},
): AsyncGenerator<EpgProgramme[]> {
  let stream: ReadableStream<Uint8Array> = input;
  if (options.gzip) {
    if (typeof DecompressionStream === "undefined") throw new Error("This Android WebView cannot decompress gzip streams. Supply an uncompressed XMLTV URL or enable a gzip-capable proxy.");
    stream = stream.pipeThrough(new DecompressionStream("gzip"));
  }
  const decoder = new TextDecoder("utf-8");
  const now = options.now ?? Date.now();
  const minStart = now - WINDOW_PAST_MS;
  const maxStart = now + WINDOW_FUTURE_MS;
  const batchSize = Math.max(50, Math.min(options.batchSize || 400, 1000));
  let buffer = "";
  let batch: EpgProgramme[] = [];
  let channelBatch: EpgChannel[] = [];
  const seen = new Set<string>();
  const overlapByChannel = new Map<string, number>();

  for await (const bytes of chunks(stream)) {
    buffer += decoder.decode(bytes, { stream: true });
    let channelEnd: number;
    while ((channelEnd = buffer.indexOf("</channel>")) >= 0) {
      const closeEnd = channelEnd + "</channel>".length;
      const block = buffer.slice(0, closeEnd);
      buffer = buffer.slice(closeEnd);
      const open = block.lastIndexOf("<channel");
      if (open < 0) continue;
      const xml = block.slice(open);
      const opening = xml.slice(0, xml.indexOf(">") + 1);
      const id = attr(opening, "id");
      const name = tagText(xml, "display-name") || id;
      const icon = xml.match(/<icon[^>]*src="([^"]+)"/i)?.[1];
      if (id && name) {
        channelBatch.push({ id, name, logo: icon });
        if (channelBatch.length >= 100) {
          await options.onChannels?.(channelBatch);
          channelBatch = [];
        }
      }
    }
    let end: number;
    while ((end = buffer.indexOf("</programme>")) >= 0) {
      const closeEnd = end + "</programme>".length;
      const block = buffer.slice(0, closeEnd);
      buffer = buffer.slice(closeEnd);
      const open = block.lastIndexOf("<programme");
      if (open < 0) continue;
      const xml = block.slice(open);
      const opening = xml.slice(0, xml.indexOf(">") + 1);
      const channelId = attr(opening, "channel");
      const start = xmltvTimestamp(attr(opening, "start"));
      const stop = xmltvTimestamp(attr(opening, "stop"));
      if (!channelId || start === null || stop === null || stop <= start || stop <= minStart || start > maxStart) continue;
      const title = tagText(xml, "title");
      if (!title) continue;
      const id = channelId + ":" + start;
      if (seen.has(id)) continue;
      seen.add(id);
      const previousStop = overlapByChannel.get(channelId) || 0;
      // Discard exact duplicates and heavily overlapping stale entries. Small
      // overlaps are retained because some broadcasters intentionally overlap.
      if (start < previousStop - 5 * 60_000) continue;
      overlapByChannel.set(channelId, Math.max(previousStop, stop));
      batch.push({ id, channelId, title, description: tagText(xml, "desc") || undefined, start, stop });
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    // Retain only an incomplete programme element, not the already parsed XML.
    if (buffer.length > 2_000_000) {
      const keepFrom = buffer.lastIndexOf("<programme");
      buffer = keepFrom >= 0 ? buffer.slice(keepFrom) : "";
    }
  }
  buffer += decoder.decode();
  const finalEnd = buffer.indexOf("</programme>");
  if (finalEnd >= 0) {
    const block = buffer.slice(0, finalEnd + "</programme>".length);
    const open = block.lastIndexOf("<programme");
    if (open >= 0) {
      const xml = block.slice(open);
      const opening = xml.slice(0, xml.indexOf(">") + 1);
      const channelId = attr(opening, "channel");
      const start = xmltvTimestamp(attr(opening, "start"));
      const stop = xmltvTimestamp(attr(opening, "stop"));
      const title = tagText(xml, "title");
      if (channelId && start !== null && stop !== null && stop > start && stop > minStart && start <= maxStart && title) {
        const id = channelId + ":" + start;
        if (!seen.has(id)) batch.push({ id, channelId, title, description: tagText(xml, "desc") || undefined, start, stop });
      }
    }
  }
  if (channelBatch.length) await options.onChannels?.(channelBatch);
  if (batch.length) yield batch;
}
