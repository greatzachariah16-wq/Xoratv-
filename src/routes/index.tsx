import { createFileRoute } from "@tanstack/react-router";
import { AppShell, FeedTabs } from "@/components/xora/AppShell";
import { FeedList } from "@/components/xora/FeedList";
import { TrendingRail } from "@/components/xora/TrendingRail";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Xora — Short video for people who teach" },
      {
        name: "description",
        content:
          "Xora is a warm, editorial home for short video, shorts and lessons. Follow creators, share ideas, learn something today.",
      },
      { property: "og:title", content: "Xora — Short video for people who teach" },
      {
        property: "og:description",
        content: "Follow creators, watch shorts, and learn something new on Xora.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <AppShell rail={<TrendingRail />}>
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">
          Your feed
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Fresh from the creators you follow.</p>
      </header>
      <FeedTabs active="home" />
      <FeedList feed="home" />
    </AppShell>
  );
}
