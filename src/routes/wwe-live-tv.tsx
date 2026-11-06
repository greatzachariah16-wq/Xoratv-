import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Radio, Tv } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";

const CW_WWE_NXT_CHANNEL = "https://www.cwtv.com/channels/?channel=cw-presents-wwe-nxt";

export const Route = createFileRoute("/wwe-live-tv")({
  head: () => ({ meta: [
    { title: "WWE NXT Live Channel | XoraTV XSports" },
    { name: "description", content: "Watch CW Presents WWE NXT on XoraTV." },
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
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Tv className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">XSports · Test channel</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight">WWE NXT</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">CW Presents WWE NXT</p>
          </div>
        </header>

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="size-4 text-primary" /> Official CW channel
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-ink shadow-card">
            <iframe
              src={CW_WWE_NXT_CHANNEL}
              title="CW Presents WWE NXT"
              className="aspect-video w-full bg-black"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <a
            href={CW_WWE_NXT_CHANNEL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            Open CW player <ExternalLink className="size-4" />
          </a>
          <p className="text-xs leading-relaxed text-muted-foreground">
            This test uses The CW's official player rather than an unverified third-party stream. If the player does not load inside XoraTV, use Open CW player to test it directly. Playback availability is controlled by The CW.
          </p>
        </section>
      </main>
    </AppShell>
  );
}
