import { createFileRoute } from "@tanstack/react-router";
import { AppShell, FeedTabs } from "@/components/xora/AppShell";
import { FeedList } from "@/components/xora/FeedList";
import { TrendingRail } from "@/components/xora/TrendingRail";
import { LiveTvShelf } from "@/components/xora/LiveTvShelf";
import { KidsTvShelf } from "@/components/xora/KidsTvShelf";
import { AdSlot } from "@/components/ads/AdSlot";
import { AdsterraBannerAd } from "@/components/ads/AdsterraBannerAd";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "XoraTV — Social entertainment, creators and cinema" },
      {
        name: "description",
        content:
          "XoraTV brings creators, short videos, movies, live TV, sports, kids and learning together in one social entertainment platform.",
      },
      { property: "og:title", content: "XoraTV — Social entertainment, creators and cinema" },
      {
        property: "og:description",
        content: "Connect with creators, watch entertainment and discover something new on XoraTV.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <AppShell rail={<TrendingRail />} hideTopBanner>
      <header className="mb-5">
        <h1 className="font-editorial text-3xl font-semibold tracking-tight text-balance">
          Your feed
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Fresh from the creators you follow.</p>
      </header>
      <FeedTabs />
      <LiveTvShelf />
      <AdSlot height={96}>
        <AdsterraBannerAd
          adKey="075ef17698a6be8914c3d3aaaf74c814"
          width={320}
          height={50}
          className="my-0"
        />
      </AdSlot>
      <KidsTvShelf />
      <FeedList feed="home" />
    </AppShell>
  );
}
