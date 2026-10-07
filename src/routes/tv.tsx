import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radio, Search, RefreshCw } from "lucide-react";
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

  return (
    <AppShell>
      <header className="mb-5">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Radio className="size-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Live TV</h1>
            <p className="text-sm text-muted-foreground">Live channels from IPTV-org.</p>
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
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-black shadow-lg">
          <NativeVideoPlayer
            streamUrl={`/api/tv/stream?channel=${encodeURIComponent(selected.id)}`}
            externalPoster={selected.logo}
            title={selected.name}
            autoPlay
            className="aspect-video w-full"
          />
          <div className="bg-card px-4 py-3">
            <h2 className="font-display text-sm font-semibold">{selected.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {selected.country || "International"} · {selected.quality || "Live"}
            </p>
          </div>
        </section>
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
