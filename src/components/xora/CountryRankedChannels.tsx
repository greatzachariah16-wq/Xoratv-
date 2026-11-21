import { useState } from "react";
import { ChannelCard, type BroadcastChannel } from "@/components/xora/XSportsComponents";
import { getCountryRankedGroups, type CountryRank } from "@/lib/country-ranking";

const COUNTRY_RANKS: { id: CountryRank; title: string; flag: string }[] = [
  { id: "nigeria", title: "Nigeria", flag: "🇳🇬" },
  { id: "africa", title: "Other African countries", flag: "🌍" },
  { id: "usa", title: "United States", flag: "🇺🇸" },
  { id: "uk", title: "United Kingdom", flag: "🇬🇧" },
  { id: "others", title: "Others", flag: "🌐" },
];

export function CountryRankedChannels<T extends BroadcastChannel>({
  channels, onSelect, selectedId, title = "Explore channels by country", favoriteIds = [], onFavorite, metaMode = "category",
}: {
  channels: T[]; onSelect: (channel: T) => void; selectedId?: string | null; title?: string;
  favoriteIds?: string[]; onFavorite?: (channel: T) => void; metaMode?: "category" | "language";
}) {
  const [expandedRegions, setExpandedRegions] = useState<CountryRank[]>([]);
  const groups = getCountryRankedGroups(channels);
  return (
    <section className="space-y-4" aria-label={title}>
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">Explore the world</p>
        <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">Nigeria first, followed by Africa, USA, UK and the rest of the world.</p>
      </div>
      {COUNTRY_RANKS.map((region) => {
        const items = groups[region.id];
        if (!items.length) return null;
        return (
          <div key={region.id} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground"><span>{region.flag}</span>{region.title}</h3>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-muted-foreground">{items.length.toLocaleString()} channels</span>
                {items.length > 4 ? <button type="button" className="text-[11px] font-bold text-primary" onClick={() => setExpandedRegions((current) => current.includes(region.id) ? current.filter((id) => id !== region.id) : [...current, region.id])}>{expandedRegions.includes(region.id) ? "Show less" : "View all"}</button> : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(expandedRegions.includes(region.id) ? items : items.slice(0, 4)).map((channel, index) => (
                <ChannelCard key={channel.id} channel={channel} active={selectedId === channel.id}
                  index={index} onSelect={onSelect} statusMode="live"
                  favorite={favoriteIds.includes(channel.id)} onFavorite={onFavorite} metaMode={metaMode} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
