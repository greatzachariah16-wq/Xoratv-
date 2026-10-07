import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Radio, Play } from "lucide-react";

type Channel = {
  id: string;
  name: string;
  logo?: string;
  country?: string;
  categories: string[];
  quality?: string | null;
  labels: string[];
};

async function loadChannels(): Promise<Channel[]> {
  const res = await fetch("/api/tv/channels?limit=12");
  if (!res.ok) return [];
  const data = (await res.json()) as { ok?: boolean; channels?: Channel[] };
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

  if (isLoading || data.length === 0) return null;

  return (
    <section className="mt-7">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <Radio className="size-4" />
            </span>
            <h2 className="font-display text-lg font-semibold tracking-tight">Live TV</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Live channels powered by IPTV Nexus.</p>
        </div>
        <Link
          to="/tv"
          className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/50 hover:text-primary"
        >
          View all
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {data.slice(0, 6).map((channel) => (
          <Link
            key={channel.id}
            to="/tv"
            search={{ channel: channel.id }}
            className="group overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-xs transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          >
            <div className="relative aspect-video bg-muted/60 p-4">
              {channel.logo ? (
                <img src={channel.logo} alt="" loading="lazy" className="h-full w-full object-contain" />
              ) : (
                <div className="grid h-full place-items-center text-xs font-semibold text-muted-foreground">
                  {channel.name}
                </div>
              )}
              <span className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100">
                <Play className="size-3 fill-current" />
              </span>
            </div>
            <div className="p-2.5">
              <p className="truncate font-display text-xs font-semibold">{channel.name}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{channel.country || "International"} · {channel.quality || "Live"}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
