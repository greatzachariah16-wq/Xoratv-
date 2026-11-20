import { getChannelCountryCode } from "@/components/xora/XSportsComponents";

const AFRICAN_COUNTRIES = new Set(["NG","ZA","GH","KE","UG","TZ","RW","ET","EG","MA","DZ","TN","SN","CI","CM","ZW","ZM","BW","AO","MZ"]);
const COUNTRY_PRIORITY: Record<string, number> = { NG: 0, ZA: 1, GH: 2, KE: 3, UG: 4, TZ: 5, EG: 6, MA: 7, DZ: 8, TN: 9, US: 20, GB: 21 };
const COUNTRY_ALIASES: Record<string, string> = {
  nigeria: "NG", ghana: "GH", kenya: "KE", uganda: "UG", tanzania: "TZ",
  rwanda: "RW", ethiopia: "ET", egypt: "EG", morocco: "MA", algeria: "DZ",
  tunisia: "TN", senegal: "SN", "ivory coast": "CI", cameroon: "CM",
  zimbabwe: "ZW", zambia: "ZM", botswana: "BW", angola: "AO", mozambique: "MZ",
  "south africa": "ZA",
};

export function getLiveTvCountryRank(country?: string): number {
  const code = getChannelCountryCode(country) || COUNTRY_ALIASES[country?.trim().toLowerCase() || ""];
  if (!code) return 100;
  if (code === "NG") return 0;
  if (AFRICAN_COUNTRIES.has(code)) return COUNTRY_PRIORITY[code] ?? 10;
  return COUNTRY_PRIORITY[code] ?? 30;
}

export function rankLiveTvChannels<T extends {country?:string;name:string;score?:number}>(channels:T[]):T[] {
  return [...channels].sort((a,b) => getLiveTvCountryRank(a.country)-getLiveTvCountryRank(b.country)
    || (b.score || 0)-(a.score || 0) || a.name.localeCompare(b.name));
}
