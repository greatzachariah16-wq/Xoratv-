import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/xora/AppShell";
import { FeedList } from "@/components/xora/FeedList";
import { TrendingRail } from "@/components/xora/TrendingRail";
import { LiveTvShelf } from "@/components/xora/LiveTvShelf";
import { KidsTvShelf } from "@/components/xora/KidsTvShelf";
import { AdSlot } from "@/components/ads/AdSlot";
import { AdsterraBannerAd } from "@/components/ads/AdsterraBannerAd";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "XoraTV — Videos, series and live moments" },
      {
        name: "description",
        content: "Watch short videos, discover series, catch live moments and learn something new on XoraTV.",
      },
      { property: "og:title", content: "XoraTV — Videos, series and live moments" },
      {
        property: "og:description",
        content: "Discover creators, watch live TV, explore series and learn on XoraTV.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const liveShelf = (
    <>
      <div className="xl:hidden">
        <LiveTvShelf />
      </div>
      <AdSlot height={68}>
        <AdsterraBannerAd
          adKey="075ef17698a6be8914c3d3aaaf74c814"
          width={320}
          height={50}
          className="my-0"
        />
      </AdSlot>
    </>
  );

  return (
    <AppShell
      wide
      hideTopBanner
      rail={
        <div className="space-y-8">
          <LiveTvShelf />
          <KidsTvShelf />
          <TrendingRail />
        </div>
      }
    >
      <header className="mb-2 flex min-h-10 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold tracking-tight text-foreground">
            Good to see you
          </p>
          <p className="text-xs text-muted-foreground">
            Find something worth watching.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-3 py-2 text-[11px] font-medium text-muted-foreground">
          XoraTV
        </span>
      </header>
      <FeedList
        feed="home"
        topContent={liveShelf}
        afterPostContent={
          <div className="xl:hidden">
            <KidsTvShelf />
          </div>
        }
      />
    </AppShell>
  );
}
