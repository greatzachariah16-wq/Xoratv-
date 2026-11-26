import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { RadioTower } from "lucide-react";
import type { NexusTvChannel } from "@/integrations/providers/iptv-nexus";
import { getChannelPlatformQuery } from "@/lib/native-vlc";
import { ChannelTile } from "@/components/xora/ChannelTile";
import { Link } from "@tanstack/react-router";

async function loadChannels(): Promise<NexusTvChannel[]> {
  const res = await fetch("/api/tv/channels?limit=12&" + getChannelPlatformQuery());
  if (!res.ok) return [];
  const data = (await res.json()) as { ok?: boolean; channels?: NexusTvChannel[] };
  return Array.isArray(data.channels) ? data.channels : [];
}

export function LiveTvShelf() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["iptv-nexus-live-tv"],
    queryFn: loadChannels,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 3,
  });

  if (!isLoading && data.length === 0) return null;

  return (
    <section className="xora-shelf min-w-0" aria-label="Live now">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-clay-soft text-primary dark:bg-primary/15">
            <RadioTower className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold leading-tight text-foreground">Live now</h2>
            <p className="truncate text-[11px] text-muted-foreground">Watch what’s happening right now.</p>
          </div>
        </div>
        <Link to="/tv" search={{ channel: undefined }} className="press inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-semibold text-primary hover:bg-secondary">
          View all
        </Link>
      </div>
      {isLoading ? (
        <div className="hide-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2" aria-label="Loading Live TV channels">
          {["live-placeholder-1", "live-placeholder-2", "live-placeholder-3"].map((key) => (
            <div key={key} className="w-[146px] min-w-[146px] shrink-0 rounded-[17px] bg-card p-2 shadow-sm">
              <div className="shimmer aspect-video rounded-xl" />
              <div className="shimmer mt-3 h-3 w-4/5 rounded-full" />
              <div className="shimmer mt-2 h-2.5 w-2/5 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="hide-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2 pr-8">
          {data.slice(0, 8).map((channel, index) => (
            <div key={channel.id} className="relative shrink-0 snap-start" style={{ "--i": Math.min(index, 8) } as CSSProperties}>
              <span className="absolute left-2 top-2 z-10 inline-flex min-h-5 items-center gap-1 rounded-full bg-black/75 px-2 text-[9px] font-semibold tracking-wide text-white">
                <span className="size-1.5 rounded-full bg-[#2FBF8F]" /> LIVE
              </span>
              <ChannelTile channel={channel} destination="tv" layout="carousel" eager={index === 0} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
