import { useEffect } from "react";
import { ADCASH_ZONE_ID, initAdcashAutoTag } from "@/lib/adcash";
import { cn } from "@/lib/utils";

interface AdcashPlacementProps {
  slotId: string;
  className?: string;
  compact?: boolean;
}

/**
 * Dedicated Adcash In-Feed Placement Container
 * Positioned under movie/video frames and content cards across XoraTV.
 * Optimized for adaptive width & fluid scaling in both portrait and landscape viewports.
 */
export function AdcashPlacement({ slotId, className, compact = false }: AdcashPlacementProps) {
  useEffect(() => {
    initAdcashAutoTag();
  }, []);

  return (
    <div
      id={`adcash-placement-${slotId}`}
      data-adcash-zone={ADCASH_ZONE_ID}
      data-slot-id={slotId}
      className={cn(
        "adcash-zone-container relative my-3 w-full max-w-full overflow-hidden rounded-xl transition-all flex items-center justify-center",
        compact ? "my-2" : "my-3.5",
        className,
      )}
      aria-label="Advertisement placement"
    >
      {/* Target injection anchor for Adcash in-feed / native / display units */}
      <div
        id={`aclib-slot-${slotId}`}
        className="adcash-ad-slot flex w-full max-w-full items-center justify-center min-h-[1px] overflow-hidden"
      />
    </div>
  );
}
