import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/xora/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, ArrowRight, RefreshCw, ShieldCheck, Clock, Sparkles, WifiOff, Inbox, ExternalLink, LockKeyhole } from "lucide-react";

export const Route = createFileRoute("/surveys")({
  head: () => ({ meta: [
    { title: "Surveys — XoraTV Rewards" },
    { name: "description", content: "Available surveys provided by CPX Research." },
  ] }),
  component: SurveysPage,
});

type CpxSurvey = Record<string, unknown> & { id?: string | number };
type SurveyResponse = { ok: boolean; surveys?: CpxSurvey[]; error?: string; fetchedAt?: string };

async function loadCpxSurveys(): Promise<SurveyResponse> {
  const response = await fetch("/api/cpx/rewards/surveys", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as SurveyResponse;
  if (!response.ok || !payload.ok) throw new Error(payload.error || `Survey service returned HTTP ${response.status}.`);
  return payload;
}

function valueOf(item: CpxSurvey, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}
function numberOf(item: CpxSurvey, keys: string[]): number | null {
  const raw = valueOf(item, keys);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function surveyUrl(item: CpxSurvey): string {
  const raw = valueOf(item, ["survey_url", "surveyUrl", "url", "link", "survey_link", "redirect_url", "redirectUrl"]);
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch { return ""; }
}

function SurveysPage() {
  const { user, loading: authLoading } = useAuth();
  const [filter, setFilter] = useState<"all" | "short">("all");
  const surveysQuery = useQuery({
    queryKey: ["cpx-research-surveys", user?.id],
    queryFn: loadCpxSurveys,
    enabled: !authLoading && Boolean(user),
    retry: 1,
    staleTime: 0,
  });
  const surveys = (surveysQuery.data?.surveys || []).filter((item) => item && typeof item === "object");
  const visible = filter === "short"
    ? surveys.filter((s) => (numberOf(s, ["length_of_interview", "loi", "minutes", "duration"]) ?? 99) <= 5)
    : surveys;

  return <AppShell wide>
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:pt-10">
      <header className="flex items-center gap-3">
        <Link to="/" aria-label="Back to home" className="grid size-11 shrink-0 place-items-center rounded-full border bg-card shadow-sm"><ArrowLeft className="size-5" /></Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">XoraTV Rewards</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Surveys</h1>
        </div>
        <span className="rounded-full border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">CPX Research</span>
      </header>

      <section className="mt-6 rounded-3xl bg-primary p-5 text-primary-foreground shadow-sm sm:p-7">
        <div className="flex items-center gap-2"><ShieldCheck className="size-5" /><p className="text-sm font-semibold">Real provider listings</p></div>
        <h2 className="mt-3 font-display text-2xl font-semibold">Share your opinion. Earn rewards.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 opacity-90">Survey availability and eligibility are determined by CPX Research. Rewards are only considered after the provider confirms a completion.</p>
        <div className="mt-4 flex items-center gap-2 text-xs opacity-90"><LockKeyhole className="size-4" />Your CPX credentials stay on XoraTV's server.</div>
      </section>

      <section className="mt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-display text-xl font-semibold">Available surveys</h2><p className="mt-1 text-sm text-muted-foreground">Loaded from CPX Research for your account.</p></div>
          <button onClick={() => void surveysQuery.refetch()} disabled={surveysQuery.isFetching || !user} className="inline-flex min-h-10 items-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`size-4 ${surveysQuery.isFetching ? "animate-spin" : ""}`} />Refresh</button>
        </div>

        {authLoading || surveysQuery.isLoading ? <div className="mt-5 rounded-3xl border bg-card p-8 text-center"><RefreshCw className="mx-auto size-6 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Requesting available surveys from CPX Research…</p></div>
        : !user ? <State icon={<LockKeyhole className="size-5" />} title="Sign in to view surveys" body="Sign in to your XoraTV account first. Your account is used to request eligible surveys from CPX Research." />
        : surveysQuery.isError ? <State icon={<WifiOff className="size-5" />} title="Surveys couldn't be loaded" body={surveysQuery.error instanceof Error ? surveysQuery.error.message : "CPX Research is temporarily unavailable."}><button onClick={() => void surveysQuery.refetch()} className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><RefreshCw className="size-4" />Try again</button></State>
        : surveys.length === 0 ? <State icon={<Inbox className="size-5" />} title="No surveys returned right now" body="CPX Research did not return any available surveys for this request. Try refreshing later. This is live provider data, not demo listings." />
        : <>
          <div className="mt-4 flex gap-2">
            {([["all", "All surveys"], ["short", "Up to 5 min"]] as const).map(([key, label]) => <button key={key} onClick={() => setFilter(key)} aria-pressed={filter === key} className={`min-h-9 rounded-full px-4 text-sm font-medium ${filter === key ? "bg-primary text-primary-foreground" : "border bg-card"}`}>{label}</button>)}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{visible.length} survey{visible.length === 1 ? "" : "s"} returned by CPX Research{surveysQuery.data?.fetchedAt ? ` · Updated ${new Date(surveysQuery.data.fetchedAt).toLocaleTimeString()}` : ""}</p>
          {visible.length === 0 ? <State icon={<Inbox className="size-5" />} title="No surveys match this filter" body="Choose All surveys to see the other available listings." /> :
            <ul className="mt-4 space-y-3">{visible.map((item, index) => {
              const title = valueOf(item, ["title", "name", "survey_name", "topic"]) || `CPX Research survey ${index + 1}`;
              const minutes = numberOf(item, ["length_of_interview", "loi", "minutes", "duration"]);
              const reward = numberOf(item, ["payout", "reward", "points", "value", "amount"]);
              const link = surveyUrl(item);
              const key = valueOf(item, ["id", "survey_id", "surveyId", "offer_id"]) || `${title}-${index}`;
              return <li key={key} className="rounded-3xl border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{title}</h3><span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">CPX Research</span></div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {minutes !== null && <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5"><Clock className="size-3.5" />~{minutes} min</span>}
                  {reward !== null && <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5"><Sparkles className="size-3.5" />{reward} {valueOf(item, ["currency"]) || "reward units"}</span>}
                </div>
                <div className="mt-4 flex justify-end">{link ? <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Start survey <ExternalLink className="size-4" /></a> : <span className="text-xs text-muted-foreground">Survey link not provided in the API response.</span>}</div>
              </li>;
            })}</ul>}
        </>}
      </section>
      <p className="mt-8 rounded-2xl border bg-muted/40 p-4 text-xs leading-5 text-muted-foreground">Survey availability, completion decisions, and any reward amounts are controlled by CPX Research. XoraTV does not guarantee qualification. Wallet credits remain disabled while this integration is being tested.</p>
    </main>
  </AppShell>;
}

function State({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return <div className="mt-5 rounded-3xl border border-dashed bg-card px-6 py-10 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</div><h3 className="mt-3 font-semibold">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>{children}</div>;
}
