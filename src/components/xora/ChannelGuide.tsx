import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";

type Programme = {
  id: string;
  title: string;
  description?: string;
  start: string;
  stop: string;
  isLive: boolean;
};

export function ChannelGuide({ channelId, variant = "default" }: { channelId: string; variant?: "default" | "cinema" }) {
  const cinema = variant === "cinema";
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
    <section className={cn("overflow-hidden rounded-2xl border shadow-sm", cinema ? "border-white/10 bg-[#201b16]" : "border-primary/10 bg-gradient-to-br from-primary/5 via-card to-card")}>
      <div className={cn("flex items-center gap-2 border-b px-4 py-3", cinema ? "border-white/10" : "border-border/60")}>
        <CalendarClock className={cn("size-4", cinema ? "text-[oklch(0.78_0.11_80)]" : "text-primary")} />
        <div>
          <h2 className="font-display text-sm font-semibold">TV Guide</h2>
          <p className="text-[11px] text-muted-foreground">What’s playing now and what’s coming next</p>
        </div>
      </div>
      {nowProgramme ? (
        <div className="p-4">
          <div className={cn("rounded-2xl border p-4", cinema ? "border-[oklch(0.78_0.11_80)]/20 bg-[oklch(0.78_0.11_80)]/[0.06]" : "border-primary/15 bg-primary/[0.06]")}>
            <div className={cn("flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em]", cinema ? "text-[oklch(0.78_0.11_80)]" : "text-primary")}>
              <span className={cn("size-1.5 animate-pulse rounded-full", cinema ? "bg-[oklch(0.78_0.11_80)]" : "bg-primary")} />
              Now playing
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold">{nowProgramme.title}</h3>
            <p className={cn("mt-1 text-xs", cinema ? "text-[oklch(0.68_0.03_75)]" : "text-muted-foreground")}>{formatTime(nowProgramme.start)} – {formatTime(nowProgramme.stop)}</p>
            {nowProgramme.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{nowProgramme.description}</p>}
          </div>
          {upcoming.length > 0 && (
            <div className="mt-4">
              <div className={cn("mb-2 flex items-center gap-2 text-xs font-semibold", cinema ? "text-[#e7ddce]" : "")}>
                <Clock3 className={cn("size-3.5", cinema ? "text-[oklch(0.68_0.03_75)]" : "text-muted-foreground")} />
                Up next
              </div>
              <div className="space-y-2">
                {upcoming.map((programme) => (
                  <div key={programme.id} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5", cinema ? "border-white/10 bg-[#181410]" : "border-border/50 bg-background/60")}>
                    <span className={cn("w-16 shrink-0 text-xs font-semibold", cinema ? "text-[oklch(0.68_0.03_75)]" : "text-muted-foreground")}>{formatTime(programme.start)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{programme.title}</span>
                    <span className={cn("text-[10px]", cinema ? "text-[oklch(0.68_0.03_75)]" : "text-muted-foreground")}>{formatTime(programme.stop)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={cn("p-5 text-center text-xs", cinema ? "text-[oklch(0.68_0.03_75)]" : "text-muted-foreground")}>
          {guide.isLoading ? "Loading programme schedule..." : "No EPG schedule is available for this channel right now."}
        </div>
      )}
    </section>
  );
}
