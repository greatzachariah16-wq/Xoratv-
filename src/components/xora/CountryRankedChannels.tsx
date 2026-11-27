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
  initialVisibleCount, loadMoreStep = 30,
}: {
  channels: T[]; onSelect: (channel: T) => void; selectedId?: string | null; title?: string;
  favoriteIds?: string[]; onFavorite?: (channel: T) => void; metaMode?: "category" | "language";
  initialVisibleCount?: number; loadMoreStep?: number;
}) {
  const [expandedRegions, setExpandedRegions] = useState<CountryRank[]>([]);
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount ?? 0);
  const groups = getCountryRankedGroups(channels);
  let renderedCount = 0;
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
        const visibleItems = initialVisibleCount !== undefined
          ? items.slice(0, Math.max(0, visibleCount - renderedCount))
          : expandedRegions.includes(region.id) ? items : items.slice(0, 4);
        renderedCount += visibleItems.length;
        return (
          <div key={region.id} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground"><span>{region.flag}</span>{region.title}</h3>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-muted-foreground">{items.length.toLocaleString()} channels</span>
                {initialVisibleCount === undefined && items.length > 4 ? <button type="button" className="text-[11px] font-bold text-primary" onClick={() => setExpandedRegions((current) => current.includes(region.id) ? current.filter((id) => id !== region.id) : [...current, region.id])}>{expandedRegions.includes(region.id) ? "Show less" : "View all"}</button> : null}
              </div>
            </div>
            {visibleItems.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleItems.map((channel, index) => (
                <ChannelCard key={channel.id} channel={channel} active={selectedId === channel.id}
                  index={index} onSelect={onSelect} statusMode="live"
                  favorite={favoriteIds.includes(channel.id)} onFavorite={onFavorite} metaMode={metaMode} />
              ))}
            </div> : null}
          </div>
        );
      })}
      {initialVisibleCount !== undefined && renderedCount < channels.length ? (
        <div className="flex justify-center border-t border-border/60 pt-4">
          <button type="button" className="min-h-11 rounded-full border border-border bg-card px-6 text-sm font-semibold text-foreground shadow-sm transition active:scale-[0.98]"
            onClick={() => setVisibleCount((count) => Math.min(channels.length, count + loadMoreStep))}>
            Load more channels ({Math.min(loadMoreStep, channels.length - renderedCount)} more)
          </button>
        </div>
      ) : null}
    </section>
  );
}
