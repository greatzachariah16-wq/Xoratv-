import { createFileRoute } from "@tanstack/react-router";
import { AppShell, FeedTabs } from "@/components/xora/AppShell";
import { FeedList } from "@/components/xora/FeedList";
import { TrendingRail } from "@/components/xora/TrendingRail";

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Learn — Xora" },
      {
        name: "description",
        content: "Longer lessons and walkthroughs from Xora creators who teach their craft.",
      },
      { property: "og:title", content: "Learn — Xora" },
      {
        property: "og:description",
        content: "Lessons and walkthroughs from creators who teach their craft.",
      },
    ],
  }),
  component: Learn,
});

function Learn() {
  return (
    <AppShell rail={<TrendingRail />}>
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Learn</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deeper lessons, walkthroughs and craft talk.
        </p>
      </header>
      <FeedTabs active="learn" />
      <FeedList feed="learn" />
    </AppShell>
  );
}
