import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Clock3 } from "lucide-react";

type Programme = {
  id: string;
  title: string;
  description?: string;
  start: string;
  stop: string;
  isLive: boolean;
};

export function ChannelGuide({ channelId }: { channelId: string }) {
  const guide = useQuery({
    queryKey: ["iptv-nexus-guide", channelId],
    queryFn: async () => {
      const response = await fetch(`/api/tv/guide?channel=${encodeURIComponent(channelId)}&hours=12`);
      if (!response.ok) return [] as Programme[];
      const data = (await response.json()) as { programmes?: Programme[] };
      return Array.isArray(data.programmes) ? data.programmes : [];
    },
    enabled: Boolean(channelId),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const nowProgramme = guide.data?.find((item) => item.isLive) || guide.data?.[0] || null;
  const upcoming = (guide.data || []).filter((item) => item.id !== nowProgramme?.id).slice(0, 8);
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/5 via-card to-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <CalendarClock className="size-4 text-primary" />
        <div>
          <h2 className="font-display text-sm font-semibold">TV Guide</h2>
          <p className="text-[11px] text-muted-foreground">What’s playing now and what’s coming next</p>
        </div>
      </div>
      {nowProgramme ? (
        <div className="p-4">
          <div className="rounded-2xl border border-primary/15 bg-primary/[0.06] p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              Now playing
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold">{nowProgramme.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{formatTime(nowProgramme.start)} – {formatTime(nowProgramme.stop)}</p>
            {nowProgramme.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{nowProgramme.description}</p>}
          </div>
          {upcoming.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <Clock3 className="size-3.5 text-muted-foreground" />
                Up next
              </div>
              <div className="space-y-2">
                {upcoming.map((programme) => (
                  <div key={programme.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/60 px-3 py-2.5">
                    <span className="w-16 shrink-0 text-xs font-semibold text-muted-foreground">{formatTime(programme.start)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{programme.title}</span>
                    <span className="text-[10px] text-muted-foreground">{formatTime(programme.stop)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 text-center text-xs text-muted-foreground">
          {guide.isLoading ? "Loading programme schedule..." : "No EPG schedule is available for this channel right now."}
        </div>
      )}
    </section>
  );
}
