import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/xora/AppShell";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft, Clock, Sparkles, Hourglass, ShieldCheck, Info, Inbox, X, ArrowRight,
  Banknote, RefreshCw, WifiOff, Lock, CornerDownLeft, CheckCircle2, ServerCog, BadgeCheck,
} from "lucide-react";

export const Route = createFileRoute("/surveys")({
  head: () => ({
    meta: [
      { title: "Surveys — XoraTV Rewards" },
      { name: "description", content: "Surveys on XoraTV. Survey availability and rewards are confirmed by the provider." },
      { property: "og:title", content: "XoraTV Surveys" },
      { property: "og:description", content: "Answer surveys and earn Xora Points on XoraTV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SurveysPage,
});

type Survey = { id: string; topic: string; minutes: number; points: number; cash?: number; note: string; tag?: string };

const SURVEYS: Survey[] = [
  { id: "s1", topic: "Streaming & TV habits", minutes: 4, points: 120, note: "Usually open to most adults in Nigeria", tag: "Quick pick" },
  { id: "s2", topic: "Mobile data & phone plans", minutes: 7, points: 260, cash: 90, note: "A few screening questions first" },
  { id: "s3", topic: "Grocery shopping preferences", minutes: 12, points: 480, cash: 160, note: "For people who shop for their household" },
  { id: "s4", topic: "Music & podcasts", minutes: 3, points: 90, note: "Short screener — may end early if not a match" },
];

type Filter = "all" | "short" | "high";
type View = "ready" | "loading" | "error";

function SurveysPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("ready");
  const [launch, setLaunch] = useState<Survey | null>(null);
  const [returned, setReturned] = useState<Survey | null>(null);

  const list = SURVEYS.filter((s) => filter === "all" || (filter === "short" ? s.minutes <= 5 : s.points >= 250));

  const reload = () => {
    setView("loading");
    setTimeout(() => setView("ready"), 1200);
  };

  return (
    <AppShell wide>
    <div className="min-h-screen pb-16">
      <div className="bg-primary px-4 py-2 text-center text-xs font-medium text-primary-foreground">
        Design prototype · demo data only · rewards are not live
      </div>

      <main className="mx-auto w-full max-w-5xl px-4 pt-5 sm:px-6 lg:pt-10">
        <header className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="Back to Rewards Wallet"
            className="grid size-11 shrink-0 place-items-center rounded-full border bg-card text-foreground shadow-card transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <ChevronLeft className="size-5" strokeWidth={1.75} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">XoraTV Rewards</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Surveys</h1>
          </div>
          <span className="shrink-0 rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            via CPX Research
          </span>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.35fr]">
          <div className="min-w-0 space-y-5">
            {/* Summary */}
            <section aria-labelledby="sum" className=" overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground shadow-lift">
              <div className="flex items-center justify-between">
                <h2 id="sum" className="text-sm font-medium opacity-90">Your survey rewards</h2>
                <span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 text-[10px] font-bold tracking-wider">DEMO</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs opacity-80"><Sparkles className="size-3.5" strokeWidth={1.75} aria-hidden />Xora Points</p>
                  <p className="mt-1 font-display text-3xl font-semibold">1,240</p>
                </div>
                <div className="border-l border-primary-foreground/20 pl-3">
                  <p className="flex items-center gap-1.5 text-xs opacity-80"><Hourglass className="size-3.5" strokeWidth={1.75} aria-hidden />Pending cash</p>
                  <p className="mt-1 font-display text-3xl font-semibold">₦30</p>
                </div>
              </div>
              <p className="mt-4 rounded-xl bg-primary-foreground/10 px-3 py-2 text-xs leading-relaxed">
                Sample values. Rewards aren't live in this prototype — nothing is credited.
              </p>
            </section>

            {/* Intro */}
            <section className="rounded-3xl border bg-card p-5 shadow-card">
              <h2 className="font-display text-xl font-semibold text-foreground">Answer surveys. Earn Xora Points.</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Share your opinion in a few minutes. Which surveys you see, and what they pay, depend on your eligibility and on confirmation from the survey provider.
              </p>
            </section>

            {/* How it works */}
            <section aria-labelledby="how" className="rounded-3xl bg-accent/70 p-5">
              <h2 id="how" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck className="size-4" strokeWidth={1.75} aria-hidden /> How it works
              </h2>
              <ol className="mt-3 space-y-3 text-sm text-foreground">
                <Step n={1} icon={<ServerCog className="size-4" strokeWidth={1.75} />}>XoraTV requests surveys from CPX Research through its own secure server.</Step>
                <Step n={2} icon={<Lock className="size-4" strokeWidth={1.75} />}>You answer in a secure in-app browser, then return here.</Step>
                <Step n={3} icon={<BadgeCheck className="size-4" strokeWidth={1.75} />}>Our server verifies completion with the provider before any reward is credited.</Step>
              </ol>
            </section>
          </div>

          {/* List */}
          <section aria-labelledby="list-h" className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <h2 id="list-h" className="font-semibold text-foreground">Available surveys</h2>
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Demo data</span>
            </div>

            <div role="group" aria-label="Filter surveys" className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {([["all", "All"], ["short", "Short (≤5 min)"], ["high", "Higher points"]] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  aria-pressed={filter === k}
                  className={`min-h-9 shrink-0 rounded-full px-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    filter === k ? "bg-primary text-primary-foreground" : "border bg-card text-foreground hover:bg-accent"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Demo state switcher */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>Preview state:</span>
              {([["ready", "Surveys"], ["loading", "Loading"], ["error", "Error"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setView(k)} aria-pressed={view === k}
                  className={`rounded-md px-2 py-1 underline-offset-2 hover:underline ${view === k ? "bg-muted font-semibold text-foreground" : ""}`}>
                  {l}
                </button>
              ))}
            </div>

            {returned && view === "ready" && (
              <div role="status" className="mt-4 flex gap-3 rounded-2xl border border-success/30 bg-success/10 p-4 text-sm">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">Welcome back to XoraTV</p>
                  <p className="mt-0.5 text-muted-foreground">
                    If you finished “{returned.topic}”, we'll check with the provider. Any reward appears as pending once confirmed. (Demo — nothing is credited.)
                  </p>
                </div>
                <button onClick={() => setReturned(null)} aria-label="Dismiss" className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-card">
                  <X className="size-4" strokeWidth={1.75} />
                </button>
              </div>
            )}

            <div className="mt-4" aria-live="polite" aria-busy={view === "loading"}>
              {view === "loading" && (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="animate-pulse rounded-3xl border bg-card p-5">
                      <div className="h-4 w-2/3 rounded bg-muted" />
                      <div className="mt-3 flex gap-2"><div className="h-6 w-20 rounded-full bg-muted" /><div className="h-6 w-24 rounded-full bg-muted" /></div>
                      <div className="mt-4 h-9 w-32 rounded-full bg-muted" />
                    </div>
                  ))}
                  <span className="sr-only">Loading surveys…</span>
                </div>
              )}

              {view === "error" && (
                <StateCard icon={<WifiOff className="size-5" strokeWidth={1.75} />} title="Couldn't load surveys"
                  body="Check your connection and try again. Your points are safe.">
                  <button onClick={reload} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary">
                    <RefreshCw className="size-4" strokeWidth={2} aria-hidden /> Try again
                  </button>
                </StateCard>
              )}

              {view === "ready" && list.length === 0 && (
                <StateCard icon={<Inbox className="size-5" strokeWidth={1.75} />} title="No surveys right now"
                  body="New surveys appear throughout the day. Check back soon." />
              )}

              {view === "ready" && list.length > 0 && (
                <ul className="space-y-3">
                  {list.map((s) => (
                    <li key={s.id} className="rounded-3xl border bg-card p-5 shadow-card transition hover:shadow-lift">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-foreground">{s.topic}</h3>
                        {s.tag && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary">{s.tag}</span>}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                        <Chip><Clock className="size-3.5" strokeWidth={1.75} aria-hidden />~{s.minutes} min</Chip>
                        <Chip><Sparkles className="size-3.5" strokeWidth={1.75} aria-hidden />Up to {s.points} pts</Chip>
                        {s.cash && <Chip tone="success"><Banknote className="size-3.5" strokeWidth={1.75} aria-hidden />+ up to ₦{s.cash}</Chip>}
                      </div>
                      <p className="mt-3 flex gap-1.5 text-xs text-muted-foreground">
                        <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />{s.note}. Rewards are estimates, not guaranteed.
                      </p>
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => setLaunch(s)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lift transition hover:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          Start survey <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </main>

      {launch && (
        <LaunchSheet
          survey={launch}
          onClose={() => setLaunch(null)}
          onReturn={() => { setReturned(launch); setLaunch(null); }}
        />
      )}
    </div>
    </AppShell>
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-card text-primary" aria-hidden>{icon}</span>
      <span className="leading-relaxed"><span className="sr-only">Step {n}: </span>{children}</span>
    </li>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "success" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${tone === "success" ? "bg-success/10 text-success" : "bg-muted text-foreground"}`}>
      {children}
    </span>
  );
}

function StateCard({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/70 px-6 py-10 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary">{icon}</div>
      <p className="mt-3 font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}

function LaunchSheet({ survey, onClose, onReturn }: { survey: Survey; onClose: () => void; onReturn: () => void }) {
  const [stage, setStage] = useState<"confirm" | "open">("confirm");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-h"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-lift outline-none sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Survey by CPX Research</p>
            <h2 id="launch-h" className="mt-0.5 font-display text-xl font-semibold text-foreground">
              {stage === "confirm" ? survey.topic : "Survey in progress"}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-muted">
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        {stage === "confirm" ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
              <Chip><Clock className="size-3.5" strokeWidth={1.75} aria-hidden />~{survey.minutes} min</Chip>
              <Chip><Sparkles className="size-3.5" strokeWidth={1.75} aria-hidden />Up to {survey.points} pts</Chip>
            </div>
            <ul className="mt-4 space-y-3 text-sm text-foreground">
              <li className="flex gap-2.5"><Lock className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />The survey opens in a secure in-app browser where your device supports it. On some devices it may open in a separate browser instead.</li>
              <li className="flex gap-2.5"><CornerDownLeft className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />When you're done, tap “Return to XoraTV” or close the survey window to come back.</li>
              <li className="flex gap-2.5"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />Rewards are credited only after the provider confirms completion. You may be screened out early.</li>
            </ul>
            <p className="mt-4 rounded-xl bg-accent px-3 py-2 text-xs text-muted-foreground">Demo only — no real survey opens.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-full px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted">Not now</button>
              <button onClick={() => setStage("open")} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lift hover:bg-primary">
                Open survey <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 overflow-hidden rounded-2xl border">
              <div className="flex items-center gap-2 border-b bg-muted px-3 py-2 text-xs text-muted-foreground">
                <Lock className="size-3.5" strokeWidth={1.75} aria-hidden /> Secure survey window (simulated)
              </div>
              <div className="space-y-2 p-4">
                <div className="h-3 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
                <div className="mt-3 h-8 rounded-lg bg-accent" />
                <div className="h-8 rounded-lg bg-accent" />
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">You'd be answering questions here. When finished, come back to XoraTV.</p>
            <div className="mt-5 flex justify-end">
              <button onClick={onReturn} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lift hover:bg-primary">
                <CornerDownLeft className="size-4" strokeWidth={2} aria-hidden /> Return to XoraTV
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}