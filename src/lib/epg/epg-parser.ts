import type { EpgChannel, EpgProgramme } from "./epg-store";

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16))).trim();
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*([\\\"'])(.*?)\\1", "i"));
  return match?.[2] || "";
}

function tagText(block: string, name: string): string {
  const match = block.match(new RegExp("<" + name + "\\b[^>]*>([\\s\\S]*?)</" + name + "\\s*>", "i"));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "")) : "";
}

export function parseXmltvDate(value: string): number | null {
  const match = value.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-])(\d{2}):?(\d{2}))?/);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6] || "0");
  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const offset = match[7] ? (Number(match[8]) * 60 + Number(match[9])) * (match[7] === "+" ? 1 : -1) : 0;
  return utc - offset * 60000;
}

function channelFromBlock(block: string): EpgChannel | null {
  const open = block.slice(0, block.indexOf(">") + 1);
  const id = attr(open, "id");
  if (!id) return null;
  const displayName = tagText(block, "display-name") || id;
  const icon = block.match(/<icon\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
  return { id, displayName, logo: icon };
}

function programmeFromBlock(block: string, windowStart: number, windowEnd: number): EpgProgramme | null {
  const open = block.slice(0, block.indexOf(">") + 1);
  const channelId = attr(open, "channel");
  const start = parseXmltvDate(attr(open, "start"));
  const stop = parseXmltvDate(attr(open, "stop"));
  if (!channelId || start === null || stop === null || stop <= start) return null;
  if (stop <= windowStart || start >= windowEnd) return null;
  const title = tagText(block, "title") || "Untitled programme";
  const description = tagText(block, "desc") || undefined;
  const safeTitle = title.slice(0, 300);
  const id = channelId + "|" + start + "|" + stop + "|" + safeTitle.toLowerCase();
  return { id, channelId, title: safeTitle, description: description?.slice(0, 2000), start, stop };
}

export async function parseXmltv(
  chunks: AsyncIterable<string>,
  handlers: {
    onChannels: (items: EpgChannel[]) => Promise<void>;
    onProgrammes: (items: EpgProgramme[]) => Promise<void>;
    now?: number;
  },
): Promise<{ channelCount: number; programmeCount: number; malformedCount: number }> {
  const now = handlers.now ?? Date.now();
  const windowStart = now - 2 * 3600000;
  const windowEnd = now + 48 * 3600000;
  let buffer = "";
  let channels: EpgChannel[] = [];
  let programmes: EpgProgramme[] = [];
  let channelCount = 0, programmeCount = 0, malformedCount = 0;

  const flushChannels = async () => {
    if (channels.length) { await handlers.onChannels(channels); channels = []; }
  };
  const flushProgrammes = async () => {
    if (programmes.length) { await handlers.onProgrammes(programmes); programmes = []; }
  };

  for await (const chunk of chunks) {
    buffer += chunk;
    while (true) {
      const channelIndex = buffer.search(/<channel\b/i);
      const programmeIndex = buffer.search(/<programme\b/i);
      const candidates = [channelIndex, programmeIndex].filter((value) => value >= 0);
      if (!candidates.length) {
        buffer = buffer.slice(-256);
        break;
      }
      const startIndex = Math.min(...candidates);
      if (startIndex > 0) buffer = buffer.slice(startIndex);
      const isChannel = /^<channel\b/i.test(buffer);
      const tagName = isChannel ? "channel" : "programme";
      const close = "</" + tagName + ">";
      const end = buffer.toLowerCase().indexOf(close);
      if (end < 0) break;
      const blockEnd = end + close.length;
      const block = buffer.slice(0, blockEnd);
      buffer = buffer.slice(blockEnd);
      if (isChannel) {
        const channel = channelFromBlock(block);
        if (channel) { channels.push(channel); channelCount++; }
        if (channels.length >= 250) await flushChannels();
      } else {
        const programme = programmeFromBlock(block, windowStart, windowEnd);
        if (programme) { programmes.push(programme); programmeCount++; }
        else malformedCount++;
        if (programmes.length >= 300) await flushProgrammes();
      }
    }
    if (buffer.length > 2 * 1024 * 1024) throw new Error("XMLTV contains an oversized or malformed element; parsing stopped safely.");
  }
  await flushChannels();
  await flushProgrammes();
  return { channelCount, programmeCount, malformedCount };
}
