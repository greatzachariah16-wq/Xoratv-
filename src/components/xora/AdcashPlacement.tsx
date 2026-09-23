import { useEffect, useRef } from "react";
import { ADCASH_ZONE_ID, initAdcashAutoTag, triggerAdcashRefresh } from "@/lib/adcash";
import { cn } from "@/lib/utils";

interface AdcashPlacementProps {
  slotId: string;
  className?: string;
  compact?: boolean;
}

/**
 * Dedicated 3rd-Party Ad Placement Container (Pure Adcash)
 *
 * Positioned under movie/video frames and content cards across XoraTV.
 * Renders direct Adcash multi-format banners and auto-tag units.
 */
export function AdcashPlacement({ slotId, className, compact = false }: AdcashPlacementProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperId = `aclib-slot-${slotId}`;

  useEffect(() => {
    // Initialize & trigger adcash scanning for this specific slot wrapper
    initAdcashAutoTag();
    triggerAdcashRefresh(wrapperId);
  }, [slotId, wrapperId]);

  return (
    <div
      ref={containerRef}
      id={`adcash-placement-${slotId}`}
      data-adcash-zone={ADCASH_ZONE_ID}
      data-slot-id={slotId}
      className={cn(
        "adcash-zone-container relative my-3 w-full max-w-full overflow-hidden rounded-2xl transition-all duration-300",
        "landscape:max-w-4xl landscape:mx-auto landscape:my-4",
        compact ? "my-2 landscape:my-2.5" : "my-4",
        className,
      )}
      aria-label="Advertisement placement"
      suppressHydrationWarning
    >
      {/* Target injection anchor for Adcash in-feed / native / display units */}
      <div
        id={wrapperId}
        data-zone={ADCASH_ZONE_ID}
        className="adcash_auto_tag aclib_zone adcash-ad-slot flex w-full max-w-full items-center justify-center min-h-[1px] overflow-hidden"
        suppressHydrationWarning
      />
    </div>
  );
}
