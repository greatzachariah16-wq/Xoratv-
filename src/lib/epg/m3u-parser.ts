export type M3uChannel = {
  id: string;
  tvgId: string;
  tvgName: string;
  name: string;
  logo?: string;
  country?: string;
  groupTitle?: string;
  streamUrl?: string;
};

export type ParsedM3u = { epgUrl?: string; channels: M3uChannel[] };

function attributes(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([A-Za-z][A-Za-z0-9_-]*)=(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return result;
}

export function parseM3uHeader(line: string): string | undefined {
  const attrs = attributes(line.replace(/^#EXTM3U/i, ""));
  return attrs["url-tvg"] || attrs["x-tvg-url"] || attrs["url-tvg-url"] || undefined;
}

export function parseM3U(text: string): ParsedM3u {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const channels: M3uChannel[] = [];
  let epgUrl: string | undefined;
  let pending: Record<string, string> | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#EXTM3U\b/i.test(line)) {
      epgUrl = parseM3uHeader(line);
    } else if (/^#EXTINF:/i.test(line)) {
      const comma = line.indexOf(",");
      pending = attributes(line.slice(8, comma >= 0 ? comma : undefined));
      if (comma >= 0) pending["display-name"] = line.slice(comma + 1).trim();
    } else if (!line.startsWith("#") && pending) {
      const tvgId = pending["tvg-id"] || "";
      const name = pending["display-name"] || pending["tvg-name"] || tvgId || "Unknown channel";
      channels.push({
        id: tvgId || name,
        tvgId,
        tvgName: pending["tvg-name"] || name,
        name,
        logo: pending["tvg-logo"] || undefined,
        country: pending["tvg-country"] || undefined,
        groupTitle: pending["group-title"] || undefined,
        streamUrl: /^https?:\/\//i.test(line) ? line : undefined,
      });
      pending = null;
    }
  }
  return { epgUrl, channels };
}
