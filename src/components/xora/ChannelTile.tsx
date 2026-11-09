import { memo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { RadioTower } from "lucide-react";
import type { NexusTvChannel } from "@/integrations/providers/iptv-nexus";

interface ChannelTileProps {
  channel: NexusTvChannel;
  destination: "kids" | "tv";
  eager?: boolean;
  layout?: "carousel" | "grid";
}

export function LiveBadge() {
  return (
    <span
      role="status"
      aria-label="Live now"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-xora-mint/10 px-2 py-1 text-[9px] font-bold tracking-[0.08em] text-xora-mint-ink"
    >
      <span className="live-dot" aria-hidden="true" />
      LIVE
    </span>
  );
}

function ChannelTileComponent({
  channel,
  destination,
  eager = false,
  layout = "carousel",
}: ChannelTileProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const qualityMatch = channel.name.match(/\s*\((\d{3,4}p|4k|hd)\)\s*$/i);
  const displayName =
    qualityMatch?.index === undefined
      ? channel.name
      : channel.name.slice(0, qualityMatch.index).trimEnd();
  const qualityLabel = channel.quality || qualityMatch?.[1] || "Live channel";
  const tile = (
    <>
      <div className="grid aspect-square w-full place-items-center rounded-[18px] bg-primary/[0.06] p-4">
        {channel.logo && !imageFailed ? (
          <img
            src={channel.logo}
            alt=""
            width={108}
            height={108}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="grid h-full w-full place-items-center rounded-2xl bg-secondary text-muted-foreground">
            <RadioTower className="size-8" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="min-w-0 px-2 pb-2 pt-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
            {displayName}
          </p>
          <LiveBadge />
        </div>
        <p className="mt-2 truncate text-[10px] font-medium text-muted-foreground">
          {qualityLabel}
        </p>
      </div>
    </>
  );

  const className = [
    "card-surface press block min-w-0 overflow-hidden p-2 text-left transition-colors hover:border-primary/30",
    layout === "carousel" ? "w-[140px] min-w-[140px] shrink-0" : "w-full",
  ].join(" ");

  if (destination === "kids") {
    return (
      <Link
        to="/kids"
        search={{ channel: channel.id }}
        aria-label={displayName + ", " + qualityLabel + ", live"}
        className={className}
      >
        {tile}
      </Link>
    );
  }

  return (
    <Link
      to="/tv"
      search={{ channel: channel.id }}
      aria-label={displayName + ", " + qualityLabel + ", live"}
      className={className}
    >
      {tile}
    </Link>
  );
}

export const ChannelTile = memo(ChannelTileComponent);
