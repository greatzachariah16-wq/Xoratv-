import type { EpgChannel } from "./epg-store";

export type MatchableChannel = { id: string; name: string; tvgId?: string; tvgName?: string; logo?: string; country?: string };
export type EpgMatchResult = { matches: Record<string, string>; unmatched: MatchableChannel[] };

export function normalizeChannelName(value: string): string {
  return value.normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase().replace(/\\b(hd|fhd|uhd|4k|sd|tv|live)\\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function matchEpgChannels(channels: MatchableChannel[], epgChannels: EpgChannel[], overrides: Record<string, string> = {}): EpgMatchResult {
  const byId = new Map(epgChannels.map((channel) => [channel.id, channel.id]));
  const byName = new Map<string, string>();
  for (const channel of epgChannels) {
    const key = normalizeChannelName(channel.name);
    if (key && !byName.has(key)) byName.set(key, channel.id);
  }
  const matches: Record<string, string> = {};
  const unmatched: MatchableChannel[] = [];
  for (const channel of channels) {
    const manual = overrides[channel.id];
    const exact = channel.tvgId || channel.id;
    const name = normalizeChannelName(channel.tvgName || channel.name);
    const match = (manual && byId.has(manual) ? manual : undefined)
      || (exact && byId.has(exact) ? exact : undefined)
      || (name ? byName.get(name) : undefined);
    if (match) matches[channel.id] = match;
    else unmatched.push(channel);
  }
  return { matches, unmatched };
}
