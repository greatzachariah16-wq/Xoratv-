import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Film, Play, Sparkles } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { Button } from "@/components/ui/button";

type WatchSearch = {
  id?: string;
  provider?: string;
  title?: string;
  year?: string;
  description?: string;
  ageLabel?: string;
  format?: string;
  episodes?: string;
  posterUrl?: string;
};

export const Route = createFileRoute("/kids/watch")({
  validateSearch: (search: Record<string, unknown>): WatchSearch => ({
    id: typeof search.id === "string" ? search.id : undefined,
    provider: typeof search.provider === "string" ? search.provider : undefined,
    title: typeof search.title === "string" ? search.title : undefined,
    year: typeof search.year === "string" ? search.year : undefined,
    description: typeof search.description === "string" ? search.description : undefined,
    ageLabel: typeof search.ageLabel === "string" ? search.ageLabel : undefined,
    format: typeof search.format === "string" ? search.format : undefined,
    episodes: typeof search.episodes === "string" ? search.episodes : undefined,
    posterUrl: typeof search.posterUrl === "string" ? search.posterUrl : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Watch cartoons — Xora Kids" },
      { name: "description", content: "Watch animated adventures on XoraTV Kids." },
    ],
  }),
  component: KidsCartoonWatchPage,
});

function KidsCartoonWatchPage() {
  const item = Route.useSearch();
  const title = item.title || "Cartoon";
  const provider = item.provider === "anilist" ? "anilist" : "tmdb";
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [loadedSeason, setLoadedSeason] = useState(1);
  const [loadedEpisode, setLoadedEpisode] = useState(1);
  const playerUrl = item.id
    ? provider === "anilist"
      ? `https://embed.vidrift.net/embed/anilist/${encodeURIComponent(item.id)}/${loadedEpisode}?brand=XoraTV&brandColor=%237C5CFC&showTitle=1&exit=1&autoplay=0`
      : `https://embed.vidrift.net/embed/tv/${encodeURIComponent(item.id)}/${loadedSeason}/${loadedEpisode}?brand=XoraTV&brandColor=%237C5CFC&showTitle=1&exit=1&autoplay=0`
    : "";

  return (
    <AppShell wide>
      <main className="mx-auto w-full max-w-[1440px] space-y-5 pb-10">
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" className="-ml-2 rounded-full" onClick={() => { window.location.href = "/kids"; }}>
            <ArrowLeft className="mr-2 size-4" /> Back to cartoons
          </Button>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            <Sparkles className="size-3" /> Xora Kids Cinema
          </span>
        </div>

        <section className="overflow-hidden rounded-2xl border border-border/70 bg-black shadow-xl sm:rounded-3xl">
          {playerUrl ? (
            <div className="relative aspect-video w-full bg-black">
              <iframe
                key={playerUrl}
                src={playerUrl}
                title={`XoraTV Kids — ${title}`}
                className="absolute inset-0 h-full w-full border-0"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 px-6 text-center text-white">
              <Film className="size-10 text-violet-300" />
              <p className="font-semibold">Cartoon not found</p>
              <p className="text-sm text-white/65">Return to the library and choose a cartoon to watch.</p>
              <Button onClick={() => { window.location.href = "/kids"; }} className="mt-2 rounded-xl">
                Browse cartoons
              </Button>
            </div>
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 space-y-4 rounded-2xl border border-border/70 bg-surface p-4 sm:rounded-3xl sm:p-6">
            <div className="flex items-start gap-3">
              <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-violet-200 via-sky-100 to-emerald-100">
                {item.posterUrl ? <img src={item.posterUrl} alt="" className="h-full w-full object-cover" /> : <Film className="size-6 text-primary" />}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.year && item.year !== "0" ? item.year : "Animated adventure"}
                  {item.format ? ` · ${item.format}` : ""}
                  {item.ageLabel ? ` · ${item.ageLabel}` : ""}
                  {item.episodes && item.episodes !== "0" ? ` · ${item.episodes} episodes listed` : ""}
                </p>
              </div>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{item.description || "Settle in and enjoy an animated adventure on XoraTV Kids."}</p>
          </section>

          <aside className="space-y-4 rounded-2xl border border-border/70 bg-surface p-4 sm:rounded-3xl sm:p-5">
            <div>
              <h2 className="font-display text-base font-semibold">Choose an episode</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Choose a season and episode, then load it in the player.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {provider === "tmdb" && (
                <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                  Season
                  <input type="number" min={1} max={30} value={season} onChange={(event) => setSeason(Math.min(30, Math.max(1, Number(event.target.value) || 1)))} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" />
                </label>
              )}
              <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                Episode
                <input type="number" min={1} max={500} value={episode} onChange={(event) => setEpisode(Math.min(500, Math.max(1, Number(event.target.value) || 1)))} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" />
              </label>
            </div>
            <Button className="w-full rounded-xl" onClick={() => { setLoadedSeason(season); setLoadedEpisode(episode); }}>
              <Play className="mr-2 size-4 fill-current" /> Load episode
            </Button>
            <p className="text-[11px] leading-5 text-muted-foreground">Playback availability depends on the external VidRift source. Some titles or episodes may not be available.</p>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
