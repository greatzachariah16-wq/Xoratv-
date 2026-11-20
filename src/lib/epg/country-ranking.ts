import type { M3uChannel } from "./m3u-parser";

const AFRICAN_COUNTRIES = new Set([
  "DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CG","CD","CI","DJ","EG","GQ","ER","SZ","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG","MW","ML","MR","MU","MA","MZ","NA","NE","NG","RW","ST","SN","SC","SL","SO","ZA","SS","SD","TZ","TG","TN","UG","ZM","ZW",
]);

export function countryRank(country?: string): number {
  const code = (country || "").trim().toUpperCase();
  if (code === "NG" || code === "NGA" || code === "NIGERIA") return 0;
  if (AFRICAN_COUNTRIES.has(code)) return 1;
  if (code === "US" || code === "USA" || code === "UNITED STATES") return 2;
  if (code === "GB" || code === "UK" || code === "GBR" || code === "UNITED KINGDOM") return 3;
  return 4;
}

export function rankChannelsByCountry<T extends Pick<M3uChannel, "country" | "name"> & { score?: number }>(channels: T[]): T[] {
  return [...channels].sort((a, b) =>
    countryRank(a.country) - countryRank(b.country) ||
    (b.score || 0) - (a.score || 0) ||
    a.name.localeCompare(b.name),
  );
}

export function countryGroupLabel(country?: string): string {
  const rank = countryRank(country);
  if (rank === 0) return "Nigeria";
  if (rank === 1) return "Africa";
  if (rank === 2) return "United States";
  if (rank === 3) return "United Kingdom";
  return "Other countries";
}
