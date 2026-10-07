import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Baby, Play, Sparkles } from "lucide-react";

type KidsChannel = {
  id: string;
  name: string;
  logo?: string;
  country?: string;
  quality?: string | null;
};

async function loadKidsChannels(): Promise<KidsChannel[]> {
  const res = await fetch("/api/tv/channels?category=kids&limit=12");
  if (!res.ok) return [];
  const data = (await res.json()) as { ok?: boolean; channels?: KidsChannel[] };
  return Array.isArray(data.channels) ? data.channels : [];
}

export function KidsTvShelf() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["iptv-org-kids"],
    queryFn: loadKidsChannels,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  if (isLoading || data.length === 0) return null;

  return (
    <section className="relative mt-8 overflow-hidden rounded-[1.75rem] border border-primary/15 bg-gradient-to-br from-[#fff8ed] via-[#f7f0ff] to-[#eef8f2] p-4 shadow-sm sm:p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-primary/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 size-44 rounded-full bg-pink-200/25 blur-3xl" />
      <div className="relative">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-white/80 text-primary shadow-sm ring-1 ring-black/5">
              <Baby className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-semibold tracking-tight">Xora Kids</h2>
                <Sparkles className="size-3.5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">Cartoons, animation & kids TV</p>
            </div>
          </div>
          <Link
            to="/kids"
            className="rounded-full bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background shadow-sm transition hover:scale-[1.02]"
          >
            Open Kids
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {data.slice(0, 6).map((channel) => (
            <Link
              key={channel.id}
              to="/kids"
              search={{ channel: channel.id }}
              className="group overflow-hidden rounded-2xl border border-white/80 bg-white/75 shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="relative aspect-video bg-white/70 p-3">
                {channel.logo ? (
                  <img src={channel.logo} alt="" loading="lazy" className="h-full w-full object-contain" />
                ) : (
                  <div className="grid h-full place-items-center px-2 text-center text-[10px] font-semibold">
                    {channel.name}
                  </div>
                )}
                <span className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-md transition group-hover:opacity-100">
                  <Play className="size-3 fill-current" />
                </span>
              </div>
              <div className="p-2.5">
                <p className="truncate font-display text-xs font-semibold">{channel.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {channel.country || "International"} · {channel.quality || "Live"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
