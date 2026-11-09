import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { IptvChannel } from "@/integrations/providers/iptv-org";
import { KidsCarousel } from "@/components/xora/KidsCarousel";

async function loadKidsChannels(): Promise<IptvChannel[]> {
  const res = await fetch("/api/tv/channels?category=kids&limit=12");
  if (!res.ok) return [];
  const data = (await res.json()) as { ok?: boolean; channels?: IptvChannel[] };
  return Array.isArray(data.channels) ? data.channels : [];
}

export function KidsTvShelf() {
  const navigate = useNavigate();
  const openKids = useCallback(() => {
    void navigate({ to: "/kids" });
  }, [navigate]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["iptv-org-kids"],
    queryFn: loadKidsChannels,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  if (isLoading) {
    return (
      <section aria-label="Loading Xora Kids channels" className="card-surface mt-8 overflow-hidden p-4">
        <div className="mb-4 flex items-center gap-3">
          <div className="shimmer size-10 rounded-2xl" />
          <div className="space-y-2">
            <div className="shimmer h-5 w-28 rounded-full" />
            <div className="shimmer h-3 w-44 rounded-full" />
          </div>
        </div>
        <div className="hide-scrollbar flex gap-4 overflow-hidden">
          {["kids-placeholder-1", "kids-placeholder-2", "kids-placeholder-3"].map((key) => (
            <div key={key} className="w-[140px] shrink-0">
              <div className="shimmer aspect-square rounded-[18px]" />
              <div className="shimmer mt-3 h-3 w-4/5 rounded-full" />
              <div className="shimmer mt-2 h-2.5 w-2/5 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (data.length === 0) return null;
  return <KidsCarousel channels={data} onOpenKids={openKids} />;
}
