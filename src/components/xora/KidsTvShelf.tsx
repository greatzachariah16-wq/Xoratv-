import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { NexusTvChannel } from "@/integrations/providers/iptv-nexus";
import { getChannelPlatformQuery } from "@/lib/native-vlc";
import { KidsCarousel } from "@/components/xora/KidsCarousel";

async function loadKidsChannels(): Promise<NexusTvChannel[]> {
  const res = await fetch("/api/tv/channels?category=kids&limit=12&" + getChannelPlatformQuery());
  if (!res.ok) return [];
  const data = (await res.json()) as { ok?: boolean; channels?: NexusTvChannel[] };
  return Array.isArray(data.channels) ? data.channels : [];
}

export function KidsTvShelf() {
  const navigate = useNavigate();
  const openKids = useCallback(() => {
    void navigate({ to: "/kids", search: { channel: undefined } });
  }, [navigate]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["iptv-org-kids"],
    queryFn: loadKidsChannels,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  if (isLoading || data.length === 0) return null;
  return <KidsCarousel channels={data} onOpenKids={openKids} />;
}
