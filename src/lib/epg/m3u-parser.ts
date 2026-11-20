export type M3uChannel = {
  id: string;
  tvgId: string;
  tvgName: string;
  name: string;
  logo?: string;
  group?: string;
  country?: string;
  streamUrl?: string;
};

export type ParsedM3u = { epgUrl?: string; channels: M3uChannel[] };

function attributes(line: string): Record<string, string> {
  const result: Record<string, string> = {};
  const expression = /([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(line))) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return result;
}

export function parseM3u(input: string): ParsedM3u {
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = lines.find((line) => line.trim().startsWith("#EXTM3U")) || "";
  const headerAttrs = attributes(header);
  const epgUrl = headerAttrs["url-tvg"] || headerAttrs["x-tvg-url"] || headerAttrs["tvg-url"] || undefined;
  const channels: M3uChannel[] = [];
  let pending: Record<string, string> | null = null;
  let displayName = "";
  let group: string | undefined;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF:")) {
      const comma = line.indexOf(",");
      pending = attributes(line);
      displayName = comma >= 0 ? line.slice(comma + 1).trim() : pending["tvg-name"] || "";
      group = pending["group-title"] || undefined;
      continue;
    }
    if (line.startsWith("#EXTGRP:")) {
      group = line.slice(8).trim() || group;
      continue;
    }
    if (line.startsWith("#")) continue;
    if (pending && /^https?:\/\//i.test(line)) {
      const tvgId = pending["tvg-id"]?.trim() || "";
      const name = displayName || pending["tvg-name"] || tvgId || line;
      channels.push({
        id: tvgId || name,
        tvgId,
        tvgName: pending["tvg-name"] || name,
        name,
        logo: pending["tvg-logo"] || undefined,
        group: group || undefined,
        country: pending["tvg-country"] || undefined,
        streamUrl: line,
      });
    }
    pending = null;
    displayName = "";
    group = undefined;
  }
  return { epgUrl, channels };
}
