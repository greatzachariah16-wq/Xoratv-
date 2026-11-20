import type { M3uChannel } from "./m3u-parser";
import type { EpgChannel } from "./epg-store";

export function normalizeChannelName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(hd|fhd|uhd|4k|sd|tv|live|channel|international)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function matchEpgChannels(
  channels: M3uChannel[],
  epgChannels: EpgChannel[],
  manual: Record<string, string> = {},
): { mappings: Record<string, string>; unmatched: M3uChannel[] } {
  const byId = new Map(epgChannels.map((item) => [item.id, item]));
  const byName = new Map<string, EpgChannel[]>();
  for (const item of epgChannels) {
    const name = normalizeChannelName(item.displayName || "");
    if (name) byName.set(name, [...(byName.get(name) || []), item]);
  }
  const mappings: Record<string, string> = {};
  const unmatched: M3uChannel[] = [];
  for (const channel of channels) {
    const override = manual[channel.id];
    if (override && byId.has(override)) {
      mappings[channel.id] = override;
      continue;
    }
    const exactId = channel.tvgId && byId.has(channel.tvgId) ? channel.tvgId : "";
    if (exactId) {
      mappings[channel.id] = exactId;
      continue;
    }
    const normalized = normalizeChannelName(channel.tvgName || channel.name);
    const candidates = byName.get(normalized) || [];
    if (candidates.length === 1) mappings[channel.id] = candidates[0].id;
    else unmatched.push(channel);
  }
  return { mappings, unmatched };
}
