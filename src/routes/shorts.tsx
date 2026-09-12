import { createFileRoute } from "@tanstack/react-router";
import { AppShell, FeedTabs } from "@/components/xora/AppShell";
import { FeedList } from "@/components/xora/FeedList";
import { TrendingRail } from "@/components/xora/TrendingRail";

export const Route = createFileRoute("/shorts")({
  head: () => ({
    meta: [
      { title: "Shorts — Xora" },
      {
        name: "description",
        content: "Vertical short video on Xora: quick ideas, quick craft, endless scroll.",
      },
      { property: "og:title", content: "Shorts — Xora" },
      { property: "og:description", content: "Vertical short video, quick ideas, endless scroll." },
    ],
  }),
  component: Shorts,
});

function Shorts() {
  return (
    <AppShell rail={<TrendingRail />}>
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Shorts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Vertical, fast, made for the thumb.</p>
      </header>
      <FeedTabs active="shorts" />
      <FeedList feed="shorts" vertical />
    </AppShell>
  );
}
