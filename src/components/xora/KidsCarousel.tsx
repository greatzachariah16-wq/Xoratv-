import { memo, type CSSProperties } from "react";
import type { NexusTvChannel } from "@/integrations/providers/iptv-nexus";
import { Sparkles } from "lucide-react";
import { Pill } from "@/components/xora/Pill";
import { ChannelTile } from "@/components/xora/ChannelTile";

export interface KidsCarouselProps {
  channels: ReadonlyArray<NexusTvChannel>;
  onOpenKids: () => void;
}

function KidsCarouselComponent({ channels, onOpenKids }: KidsCarouselProps) {
  return (
    <section className="card-surface relative mt-8 overflow-hidden pb-4 pt-4">
      <div className="pointer-events-none absolute -right-14 -top-14 size-40 rounded-full bg-primary/5 blur-2xl" />
      <div className="relative">
        <div className="mb-4 flex items-center justify-between gap-3 px-4">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h2 className="whitespace-nowrap font-editorial text-xl font-semibold tracking-tight text-foreground">Xora Kids</h2>
              <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            </div>
            <p className="mt-1 w-full truncate text-xs text-muted-foreground">Cartoons, animation & kids TV</p>
          </div>
          <Pill variant="solid" onClick={onOpenKids} className="h-11 shrink-0 whitespace-nowrap">
            Open Kids
          </Pill>
        </div>

        <div className="hide-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1">
          {channels.slice(0, 8).map((channel, index) => (
            <div key={channel.id} className="rise snap-start" style={{ "--i": Math.min(index, 8) } as CSSProperties}>
              <ChannelTile channel={channel} destination="kids" eager={index === 0} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export const KidsCarousel = memo(KidsCarouselComponent);
