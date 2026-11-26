import { memo, type CSSProperties } from "react";
import type { NexusTvChannel } from "@/integrations/providers/iptv-nexus";
import { Baby } from "lucide-react";
import { ChannelTile } from "@/components/xora/ChannelTile";

export interface KidsCarouselProps {
  channels: ReadonlyArray<NexusTvChannel>;
  onOpenKids: () => void;
}

function KidsCarouselComponent({ channels, onOpenKids }: KidsCarouselProps) {
  return (
    <section className="xora-shelf min-w-0 overflow-hidden">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-clay-soft text-primary dark:bg-primary/15">
            <Baby className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold leading-tight text-foreground">Xora Kids</h2>
            <p className="truncate text-[11px] text-muted-foreground">Stories, cartoons and curious minds.</p>
          </div>
        </div>
        <button type="button" onClick={onOpenKids} className="press inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-semibold text-primary hover:bg-secondary">
          View all
        </button>
      </div>
      <div className="hide-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2 pr-8">
        {channels.slice(0, 8).map((channel, index) => (
          <div key={channel.id} className="xora-card-compact shrink-0 snap-start" style={{ "--i": Math.min(index, 8) } as CSSProperties}>
            <ChannelTile channel={channel} destination="kids" eager={index === 0} />
          </div>
        ))}
      </div>
    </section>
  );
}

export const KidsCarousel = memo(KidsCarouselComponent);
