import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Film, Play } from "lucide-react";

export function MovieChannelsShelf() {
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["xseries-movie-channels"],
    queryFn: async () => {
      const response = await fetch("/api/tv/channels?category=movies&limit=24");
      if (!response.ok) throw new Error("Unable to load movie channels");
      const payload = await response.json() as { channels?: Array<{ id: string; name: string; logo?: string; country?: string; quality?: string | null }> };
      return Array.isArray(payload.channels) ? payload.channels : [];
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  return <section aria-label="Live movie channels" className="space-y-3">
    <div className="flex items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary"><Film className="size-4" /></span><h2 className="font-display text-lg font-semibold tracking-tight">Movie Channels</h2></div>
        <p className="mt-1 text-xs text-muted-foreground">Live movie stations, with programme guides when listings are available.</p>
      </div>
      <Link to="/tv" search={{ category: "movies" }} className="shrink-0 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-semibold hover:border-primary/50 hover:text-primary">View all</Link>
    </div>
    {isLoading ? <div className="rounded-2xl border border-border/60 bg-surface px-4 py-6 text-center text-xs text-muted-foreground">Loading movie channels…</div> : isError ? <div className="rounded-2xl border border-border/60 bg-surface px-4 py-6 text-center text-xs text-muted-foreground">Movie channels could not be loaded right now.</div> : data.length === 0 ? <div className="rounded-2xl border border-border/60 bg-surface px-4 py-6 text-center text-xs text-muted-foreground">No playable movie channels are available right now.</div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{data.map((channel) => <Link key={channel.id} to="/tv" search={{ channel: channel.id, category: "movies" }} className="group overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-xs transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"><div className="relative aspect-video bg-muted/60 p-4">{channel.logo ? <img src={channel.logo} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain" /> : <div className="grid h-full place-items-center text-center text-xs font-semibold text-muted-foreground">{channel.name}</div>}<span className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"><Play className="size-3 fill-current" /></span></div><div className="p-2.5"><p className="truncate font-display text-xs font-semibold">{channel.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{channel.country || "International"} · {channel.quality || "Live"}</p></div></Link>)}</div>}
  </section>;
}
