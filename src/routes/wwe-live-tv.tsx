import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Radio, Tv } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { NativeVideoPlayer } from "@/components/xora/VideoPlayer";

const WWE_TEST_STREAM = "/api/tv/stream?provider=iptv-org&channel=wwe-24hr-test";

export const Route = createFileRoute("/wwe-live-tv")({
  head: () => ({ meta: [
    { title: "WWE Live TV | XoraTV XSports" },
    { name: "description", content: "Watch WWE Live TV on XoraTV." },
  ] }),
  component: WWELivePage,
});

function WWELivePage() {
  return (
    <AppShell wide>
      <main className="mx-auto w-full max-w-6xl space-y-5">
          <Link to="/xsports" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to XSports
          </Link>
          <header className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Tv className="size-6" /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">XSports</p>
              <h1 className="font-display text-2xl font-semibold tracking-tight">WWE Live TV</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Watch WWE live on XoraTV.</p>
            </div>
          </header>
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><Radio className="size-4 text-primary" /> WWE Live TV</div>
            <div className="overflow-hidden rounded-2xl border border-border bg-ink shadow-card">
              <NativeVideoPlayer key="wwe-24hr-test" streamUrl={WWE_TEST_STREAM} nativeStreamUrl={WWE_TEST_STREAM} title="WWE Live TV" liveTv autoPlay className="aspect-video w-full rounded-none" />
            </div>
          </section>
      </main>
    </AppShell>
  );
}
