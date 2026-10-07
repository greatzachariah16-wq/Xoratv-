import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Baby, Heart, Play, RefreshCw, Search, Sparkles, Tv } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { NativeVideoPlayer } from "@/components/xora/VideoPlayer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Channel = { id: string; name: string; logo?: string; country?: string; categories: string[]; streamUrl: string; quality?: string | null; labels: string[] };

export const Route = createFileRoute("/kids")({
  validateSearch: (search: Record<string, unknown>) => ({ channel: typeof search.channel === "string" ? search.channel : undefined }),
  head: () => ({ meta: [
    { title: "Xora Kids — Cartoons & Kids TV" },
    { name: "description", content: "A dedicated XoraTV space for kids entertainment powered by IPTV-org's Kids catalogue." },
  ]}),
  component: KidsPage,
});

async function loadKidsChannels(query: string): Promise<Channel[]> {
  const params = new URLSearchParams({ category: "kids", limit: "100" });
  if (query.trim()) params.set("q", query.trim());
  const res = await fetch("/api/tv/channels?" + params.toString());
  if (!res.ok) throw new Error("Unable to load kids channels");
  const data = (await res.json()) as { channels?: Channel[] };
  return Array.isArray(data.channels) ? data.channels : [];
}

function KidsPage() {
  const { channel: requestedChannel } = Route.useSearch();
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["iptv-org-kids-page", search],
    queryFn: () => loadKidsChannels(search),
    staleTime: 60_000, refetchInterval: 5 * 60_000, refetchOnWindowFocus: true, retry: 3,
  });
  const selected = useMemo(() => query.data?.find((item) => item.id === requestedChannel) || query.data?.[0] || null, [query.data, requestedChannel]);

  return (
    <AppShell wide>
      <div className="space-y-6 pb-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-primary/15 bg-gradient-to-br from-[#fff8ed] via-[#f6efff] to-[#eaf8f1] px-5 py-7 shadow-sm sm:px-7 sm:py-9">
          <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-5rem] left-[38%] size-56 rounded-full bg-pink-200/25 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary backdrop-blur"><Sparkles className="size-3" /> Xora Kids</span>
              <span className="rounded-full bg-white/65 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground backdrop-blur">Live entertainment</span>
            </div>
            <div className="mt-5 max-w-2xl">
              <h1 className="font-display text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">A little corner for <span className="text-primary">big imaginations.</span></h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">Discover live kids channels, cartoons and animation in a calmer XoraTV experience designed especially for younger viewers.</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#fff0d7] px-3 py-1.5 text-[11px] font-semibold">Cartoons</span>
              <span className="rounded-full bg-[#eee5ff] px-3 py-1.5 text-[11px] font-semibold">Animation</span>
              <span className="rounded-full bg-[#e4f6ed] px-3 py-1.5 text-[11px] font-semibold">Kids TV</span>
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-border/70 bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="flex items-center gap-2"><Tv className="size-4 text-primary" /><h2 className="font-display text-xl font-semibold">Kids channels</h2></div><p className="mt-1 text-xs text-muted-foreground">Playable channels from IPTV-org's Kids catalogue.</p></div>
            <div className="flex w-full gap-2 sm:max-w-md">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a kids channel..." className="h-10 rounded-xl border-border/70 bg-background/70 pl-9" /></div>
              <Button variant="outline" className="h-10 rounded-xl" onClick={() => void query.refetch()} aria-label="Refresh kids channels"><RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} /></Button>
            </div>
          </div>

          {selected ? (
            <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-border/60 bg-black shadow-lg">
              <NativeVideoPlayer streamUrl={`/api/tv/stream/${encodeURIComponent(selected.id)}/index.m3u8?channel=${encodeURIComponent(selected.id)}`} externalPoster={selected.logo} title={selected.name} autoPlay className="aspect-video w-full" />
              <div className="flex items-center justify-between gap-3 bg-card px-4 py-3">
                <div className="min-w-0"><h3 className="truncate font-display text-sm font-semibold">{selected.name}</h3><p className="mt-1 text-xs text-muted-foreground">{selected.country || "International"} · {selected.quality || "Live"}</p></div>
                <span className="hidden shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary sm:inline-flex"><Heart className="size-3" /> Kids</span>
              </div>
            </div>
          ) : <div className="mt-5 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{query.isLoading ? "Finding playable kids channels..." : "No playable kids channels found."}</div>}
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Choose a channel</p><h2 className="font-display text-xl font-semibold tracking-tight">More to explore</h2></div><span className="hidden text-xs text-muted-foreground sm:block">{query.data?.length || 0} playable channels</span></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(query.data || []).map((channel) => (
              <button key={channel.id} type="button" onClick={() => { window.history.replaceState({}, "", `/kids?channel=${encodeURIComponent(channel.id)}`); window.dispatchEvent(new PopStateEvent("popstate")); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`group overflow-hidden rounded-2xl border bg-surface text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-md ${selected?.id === channel.id ? "border-primary ring-2 ring-primary/10" : "border-border/60"}`}>
                <div className="relative aspect-video bg-muted/40 p-4">
                  {channel.logo ? <img src={channel.logo} alt="" loading="lazy" className="h-full w-full object-contain transition group-hover:scale-105" /> : <div className="grid h-full place-items-center px-2 text-center text-xs font-semibold">{channel.name}</div>}
                  <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-md transition group-hover:opacity-100"><Play className="size-3.5 fill-current" /></span>
                </div>
                <div className="p-3"><p className="truncate font-display text-xs font-semibold">{channel.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{channel.country || "International"} · {channel.quality || "Live"}</p></div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
