import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { Radio } from "lucide-react";
import type { NexusTvChannel } from "@/integrations/providers/iptv-nexus";
import { ChannelTile } from "@/components/xora/ChannelTile";
import { Pill } from "@/components/xora/Pill";
import { Link } from "@tanstack/react-router";

async function loadChannels(): Promise<NexusTvChannel[]> {
  const res = await fetch("/api/tv/channels?limit=12");
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
    <section className="mt-8 min-w-0">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Radio className="size-4" aria-hidden="true" />
            </span>
            <h2 className="font-editorial text-xl font-semibold tracking-tight text-foreground">
              Live TV
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Browse live channels and discover what is on now.
          </p>
        </div>
        <Pill asChild variant="outline">
          <Link to="/tv">View all</Link>
        </Pill>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6" aria-label="Loading Live TV channels">
          {["live-placeholder-1", "live-placeholder-2", "live-placeholder-3", "live-placeholder-4"].map((key) => (
            <div key={key} className="card-surface min-w-0 overflow-hidden p-2">
              <div className="shimmer aspect-square rounded-[18px]" />
              <div className="shimmer mt-4 h-3 w-4/5 rounded-full" />
              <div className="shimmer mt-2 h-2.5 w-2/5 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {data.slice(0, 6).map((channel, index) => (
            <div key={channel.id} className="rise min-w-0" style={{ "--i": Math.min(index, 8) } as CSSProperties}>
              <ChannelTile channel={channel} destination="tv" layout="grid" eager={index === 0} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
