import { useEffect, useState, useRef } from "react";
import { ADCASH_ZONE_ID, initAdcashAutoTag, triggerAdcashRefresh } from "@/lib/adcash";
import { XoraInHouseAd } from "@/components/ads/XoraInHouseAd";
import { cn } from "@/lib/utils";

interface AdcashPlacementProps {
  slotId: string;
  className?: string;
  compact?: boolean;
  fallbackPlacement?:
    "home_feed" | "xseries_feed" | "cinema_popup" | "reward_popup" | "learn_feed" | "chat_banner";
}

/**
 * Dedicated 3rd-Party Ad Placement Container (Adcash + In-House Fallback)
 *
 * Positioned under movie/video frames and content cards across XoraTV.
 * Fully optimized for adaptive width, landscape orientation, and fallback resiliency.
 */
export function AdcashPlacement({
  slotId,
  className,
  compact = false,
  fallbackPlacement = "home_feed",
}: AdcashPlacementProps) {
  const [showFallback, setShowFallback] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperId = `aclib-slot-${slotId}`;

  useEffect(() => {
    // Initialize & trigger adcash scanning for this specific slot wrapper
    initAdcashAutoTag();
    triggerAdcashRefresh(wrapperId);

    // Check if 3rd-party script has populated the slot after 2.5s; if empty, show in-house sponsor fallback
    const timer = setTimeout(() => {
      const slotEl = document.getElementById(wrapperId);
      if (slotEl && slotEl.childElementCount === 0 && slotEl.clientHeight < 10) {
        setShowFallback(true);
      }
    }, 2500);

    return () => clearTimeout(timer);
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
    >
      {/* Target injection anchor for Adcash in-feed / native / display units */}
      <div
        id={wrapperId}
        data-zone={ADCASH_ZONE_ID}
        className="adcash_auto_tag aclib_zone adcash-ad-slot flex w-full max-w-full items-center justify-center min-h-[1px] overflow-hidden"
      />

      {/* Fallback In-House High-Res Sponsored Ad if 3rd-party is loading, unfilled, or blocked */}
      {showFallback && (
        <div className="w-full animate-in fade-in duration-300">
          <XoraInHouseAd
            placement={fallbackPlacement}
            variant={compact ? "compact" : "banner"}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
