import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Bookmark, Sparkles } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";

export const Route = createFileRoute("/bookstore")({
  head: () => ({
    meta: [
      { title: "Bookstore — XoraTV" },
      {
        name: "description",
        content: "A thoughtful new home for books and stories is coming to XoraTV.",
      },
    ],
  }),
  component: Bookstore,
});

function BookStack() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto flex h-[270px] w-full max-w-[330px] items-center justify-center sm:h-[330px]"
    >
      <div className="absolute left-1/2 top-1/2 size-[230px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-clay-soft/80 sm:size-[280px]" />
      <div className="absolute left-[12%] top-[18%] size-3 rounded-full bg-primary/50" />
      <div className="absolute right-[12%] top-[27%] size-2 rounded-full bg-foreground/30" />
      <div className="absolute bottom-[14%] right-[15%] h-3 w-3 rotate-12 rounded-[3px] bg-primary/40" />

      <div className="absolute bottom-[17%] left-[13%] h-[42px] w-[72%] -rotate-[5deg] rounded-[7px] border border-foreground/10 bg-[#e8d4c2] shadow-[0_14px_22px_-16px_rgba(42,31,26,0.55)]">
        <div className="absolute inset-y-1.5 left-3 w-1 rounded-full bg-primary/35" />
        <div className="absolute inset-y-2 right-4 w-1/2 rounded-sm bg-[#fffaf3]/80" />
      </div>
      <div className="absolute bottom-[30%] left-[18%] h-[48px] w-[66%] rotate-[4deg] rounded-[7px] border border-foreground/10 bg-[#a94d30] shadow-[0_14px_22px_-16px_rgba(42,31,26,0.55)]">
        <div className="absolute inset-y-2 left-3 w-1 rounded-full bg-[#f4c9a9]/70" />
        <div className="absolute inset-y-2 right-4 w-1/2 rounded-sm bg-[#f7e5d5]/85" />
      </div>
      <div className="absolute bottom-[44%] left-[24%] h-[46px] w-[58%] -rotate-[3deg] rounded-[7px] border border-foreground/10 bg-[#f5e9d9] shadow-[0_14px_22px_-16px_rgba(42,31,26,0.55)]">
        <div className="absolute inset-y-2 left-3 w-1 rounded-full bg-primary/40" />
        <div className="absolute inset-y-2 right-4 w-1/2 rounded-sm bg-[#d8bda8]/75" />
      </div>
      <div className="absolute bottom-[57%] left-[31%] h-[42px] w-[48%] rotate-[5deg] rounded-[7px] border border-foreground/10 bg-[#3c3029] shadow-[0_14px_22px_-16px_rgba(42,31,26,0.55)]">
        <div className="absolute inset-y-2 left-3 w-1 rounded-full bg-[#e9c6a8]/70" />
        <div className="absolute inset-y-2 right-4 w-1/2 rounded-sm bg-[#e7d4c3]/80" />
      </div>

      <div className="absolute right-[13%] top-[12%] grid size-12 rotate-6 place-items-center rounded-2xl border border-primary/15 bg-background/90 text-primary shadow-sm">
        <Bookmark className="size-5" strokeWidth={1.6} />
      </div>
      <div className="absolute bottom-[11%] left-[12%] grid size-10 -rotate-6 place-items-center rounded-xl border border-border bg-background/90 text-primary shadow-sm">
        <BookOpen className="size-5" strokeWidth={1.6} />
      </div>
    </div>
  );
}

function Bookstore() {
  return (
    <AppShell wide hideTopBanner>
      <div className="mx-auto max-w-5xl pb-4">
        <section className="relative isolate overflow-hidden rounded-[30px] border border-border bg-surface px-5 py-8 shadow-card sm:px-10 sm:py-12 lg:px-14">
          <div className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-clay-soft/70 blur-3xl" />
          <div className="relative grid items-center gap-5 md:grid-cols-[1.05fr_0.95fr] md:gap-2">
            <div className="order-2 min-w-0 md:order-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-clay-soft/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                <Sparkles className="size-3.5" />
                A new chapter
              </div>
              <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                XoraTV Bookstore
              </p>
              <h1 className="mt-3 max-w-xl font-editorial text-[2.65rem] leading-[0.98] tracking-[-0.045em] text-foreground sm:text-6xl lg:text-[4.4rem]">
                A little more room for <em className="font-normal text-primary">stories.</em>
              </h1>
              <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground sm:text-[15px]">
                We’re preparing a thoughtful collection of books for curious minds,
                big imaginations and quiet moments. The shelves are not quite ready
                yet — but this is just the beginning.
              </p>
              <div className="mt-7 inline-flex items-center gap-2 rounded-full bg-secondary px-3.5 py-2 text-xs font-medium text-foreground/80">
                <span className="size-1.5 rounded-full bg-primary" />
                The bookstore is coming soon
              </div>
            </div>
            <div className="order-1 md:order-2">
              <BookStack />
            </div>
          </div>
          <div className="relative mt-7 border-t border-border pt-5 sm:mt-10 sm:pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-sm font-editorial text-lg italic leading-snug text-foreground/80 sm:text-xl">
                “Every good story gives us somewhere new to go.”
              </p>
              <Link
                to="/learn"
                className="group inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground transition hover:brightness-105 active:scale-[0.98]"
              >
                Explore Xora Learn
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-7 grid gap-4 border-t border-border pt-6 sm:grid-cols-3 sm:gap-6">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-clay-soft text-primary">
              <BookOpen className="size-[18px]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">A place for stories</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">A fresh corner of XoraTV, made for readers.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-clay-soft text-primary">
              <Bookmark className="size-[18px]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Carefully considered</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">We’re taking time to get the collection right.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-clay-soft text-primary">
              <Sparkles className="size-[18px]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Just the beginning</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">More details will arrive as the shelves take shape.</p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
