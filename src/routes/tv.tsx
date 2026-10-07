import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Radio, Search, RefreshCw, Clock3 } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { NativeVideoPlayer } from "@/components/xora/VideoPlayer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Channel = {
  id: string;
  name: string;
  logo?: string;
  country?: string;
  categories: string[];
  streamUrl: string;
  quality?: string | null;
  labels: string[];
  score?: number;
};

type Programme = {
  id: string;
  title: string;
  description?: string;
  start: string;
  stop: string;
  isLive: boolean;
};

export const Route = createFileRoute("/tv")({
  validateSearch: (search: Record<string, unknown>) => ({
    channel: typeof search.channel === "string" ? search.channel : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Live TV | Xora" },
      { name: "description", content: "Live television channels powered by IPTV-org." },
    ],
  }),
  component: LiveTvPage,
});

async function loadChannels(query: string): Promise<Channel[]> {
  const params = new URLSearchParams({ limit: "100" });
  if (query.trim()) params.set("q", query.trim());
  const res = await fetch("/api/tv/channels?" + params.toString());
  if (!res.ok) throw new Error("Unable to load live channels");
  const data = (await res.json()) as { ok?: boolean; channels?: Channel[] };
  return Array.isArray(data.channels) ? data.channels : [];
}

function LiveTvPage() {
  const { channel: requestedChannel } = Route.useSearch();
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["iptv-org-live-tv-page", search],
    queryFn: () => loadChannels(search),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 3,
  });

  const selected = useMemo(
    () => query.data?.find((item) => item.id === requestedChannel) || query.data?.[0] || null,
    [query.data, requestedChannel],
  );

  const guide = useQuery({
    queryKey: ["iptv-nexus-guide", selected?.id],
    queryFn: async () => {
      if (!selected) return [] as Programme[];
      const res = await fetch(`/api/tv/guide?channel=${encodeURIComponent(selected.id)}&hours=12`);
      if (!res.ok) return [] as Programme[];
      const data = (await res.json()) as { programmes?: Programme[] };
      return Array.isArray(data.programmes) ? data.programmes : [];
    },
    enabled: Boolean(selected),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const nowProgramme = guide.data?.find((item) => item.isLive) || guide.data?.[0] || null;
  const upcomingProgrammes = (guide.data || []).filter((item) => item.id !== nowProgramme?.id).slice(0, 8);

  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));

  return (
    <AppShell>
      <header className="mb-5">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Radio className="size-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Live TV</h1>
            <p className="text-sm text-muted-foreground">Live television with a real TV Guide, powered by IPTV Nexus.</p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search channels..."
              className="h-10 rounded-xl pl-9"
            />
          </div>
          <Button variant="outline" className="h-10 rounded-xl" onClick={() => void query.refetch()}>
            <RefreshCw className="mr-2 size-4" /> Refresh
          </Button>
        </div>
      </header>

      {selected ? (
        <>
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-black shadow-lg">
          <NativeVideoPlayer
            streamUrl={`/api/tv/stream/${encodeURIComponent(selected.id)}/index.m3u8?provider=nexus&channel=${encodeURIComponent(selected.id)}`}
            externalPoster={selected.logo}
            title={selected.name}
            autoPlay
            className="aspect-video w-full"
          />
          <div className="bg-card px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold">{selected.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selected.country || "International"} · {selected.quality || "Live"}
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">IPTV Nexus</span>
            </div>
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/5 via-card to-card shadow-sm">
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

              {upcomingProgrammes.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                    <Clock3 className="size-3.5 text-muted-foreground" />
                    Up next
                  </div>
                  <div className="space-y-2">
                    {upcomingProgrammes.map((programme) => (
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
            <div className="p-5 text-center text-xs text-muted-foreground">{guide.isLoading ? "Loading programme schedule..." : "No EPG schedule is available for this channel right now."}</div>
          )}
        </section>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {query.isLoading ? "Loading live channels..." : "No playable channels found."}
        </div>
      )}

      <section className="mt-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(query.data || []).map((channel) => (
            <button
              key={channel.id}
              type="button"
              onClick={() => {
                window.history.replaceState({}, "", `/tv?channel=${encodeURIComponent(channel.id)}`);
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
              className={`overflow-hidden rounded-2xl border bg-card text-left transition hover:-translate-y-0.5 hover:border-primary/50 ${selected?.id === channel.id ? "border-primary shadow-md" : "border-border/60"}`}
            >
              <div className="aspect-video bg-muted/50 p-4">
                {channel.logo ? (
                  <img src={channel.logo} alt="" loading="lazy" className="h-full w-full object-contain" />
                ) : (
                  <div className="grid h-full place-items-center text-xs font-semibold">{channel.name}</div>
                )}
              </div>
              <div className="p-2.5">
                <p className="truncate text-xs font-semibold">{channel.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{channel.country || "International"}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
