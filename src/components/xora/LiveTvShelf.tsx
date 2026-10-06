import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Play, Radio, Tv } from "lucide-react";
import { cn } from "@/lib/utils";

type LiveChannel = {
  id: string;
  name: string;
  group?: string;
  logo?: string;
};

async function fetchLiveChannels(): Promise<LiveChannel[]> {
  const res = await fetch("/api/tv/channels?limit=12");
  if (!res.ok) throw new Error("Unable to load live channels");
  const data = (await res.json()) as { channels?: LiveChannel[] };
  return Array.isArray(data.channels) ? data.channels : [];
}

export function LiveTvShelf({ className }: { className?: string }) {
  const { data: channels = [], isFetching } = useQuery({
    queryKey: ["live-tv-shelf"],
    queryFn: fetchLiveChannels,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    retry: 5,
  });

  return (
    <section className={cn("space-y-3", className)} aria-label="Live TV">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Radio className={cn("size-4", isFetching && "animate-pulse")} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">Live now</span>
          </div>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Live TV</h2>
        </div>
        <Link
          to="/tv"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          View all <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {channels.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {channels.slice(0, 6).map((channel) => (
            <Link
              key={channel.id}
              to="/tv"
              className="group overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-xs transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="relative grid aspect-video place-items-center bg-secondary/60 p-4">
                {channel.logo ? (
                  <img src={channel.logo} alt="" loading="lazy" className="max-h-12 max-w-[75%] object-contain" />
                ) : (
                  <Tv className="size-7 text-muted-foreground" />
                )}
                <span className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-md transition group-hover:opacity-100">
                  <Play className="size-3 fill-current" />
                </span>
              </div>
              <div className="p-3">
                <p className="line-clamp-1 text-xs font-semibold">{channel.name}</p>
                <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">{channel.group || "Live channel"}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Link to="/tv" className="block rounded-2xl border border-border/60 bg-surface p-5 text-center hover:border-primary/40">
          <Tv className="mx-auto size-7 text-primary" />
          <p className="mt-2 text-sm font-semibold">Open Live TV</p>
          <p className="mt-1 text-xs text-muted-foreground">Discover available live channels.</p>
        </Link>
      )}
    </section>
  );
}
