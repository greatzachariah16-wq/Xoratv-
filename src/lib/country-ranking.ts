import type { BroadcastChannel } from "@/components/xora/XSportsComponents";
import { getChannelCountryCode, getChannelDisplayName } from "@/components/xora/XSportsComponents";

export type CountryRank = "nigeria" | "africa" | "usa" | "uk" | "others";

const AFRICAN_COUNTRY_CODES = new Set(["DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CG","CD","CI","DJ","EG","GQ","ER","SZ","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG","MW","ML","MR","MU","MA","MZ","NA","NE","NG","RW","ST","SN","SC","SL","SO","ZA","SS","SD","TZ","TG","TN","UG","ZM","ZW"]);

export function getCountryRankedGroups<T extends BroadcastChannel>(channels: T[]): Record<CountryRank, T[]> {
  const groups: Record<CountryRank, T[]> = { nigeria: [], africa: [], usa: [], uk: [], others: [] };
  const sorted = [...channels].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)
    || getChannelDisplayName(a).localeCompare(getChannelDisplayName(b)));
  sorted.forEach((channel) => {
    const code = getChannelCountryCode(channel.country);
    const rank: CountryRank = code === "NG" ? "nigeria"
      : code && AFRICAN_COUNTRY_CODES.has(code) ? "africa"
      : code === "US" ? "usa" : code === "GB" ? "uk" : "others";
    groups[rank].push(channel);
  });
  return groups;
}
