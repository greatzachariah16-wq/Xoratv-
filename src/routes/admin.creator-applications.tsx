import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/xora/AppShell";

export const Route = createFileRoute("/admin/creator-applications")({ component: CreatorApplicationsAdmin });

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin", headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.error || "Admin request failed.");
  return body as T;
}

function CreatorApplicationsAdmin() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "creator-applications"], queryFn: () => adminFetch<{ ok: true; applications: any[] }>("/api/admin/creator-applications") });
  const review = useMutation({
    mutationFn: (input: { userId: string; decision: "approved" | "rejected" | "under_review" }) => adminFetch("/api/admin/creator-applications/review", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => { toast.success("Application decision saved."); void client.invalidateQueries({ queryKey: ["admin", "creator-applications"] }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update application."),
  });
  const applications = query.data?.applications || [];
  return <AppShell wide><main className="mx-auto w-full max-w-5xl space-y-5">
    <header className="rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-7">
      <div className="flex items-center gap-3 text-primary"><ShieldCheck className="size-5"/><span className="text-xs font-bold uppercase tracking-[.18em]">Admin · Creator program</span></div>
      <h1 className="mt-3 font-display text-2xl font-semibold sm:text-3xl">X Channel applications</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Review each application yourself. Meeting the listed requirements does not automatically approve a creator.</p>
      <button onClick={() => void query.refetch()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold"><RefreshCw className="size-3.5"/>Refresh applications</button>
    </header>
    {query.isPending ? <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">Loading applications…</div> : query.isError ? <div className="rounded-2xl border border-destructive/30 bg-surface p-5 text-sm text-destructive">{query.error.message}</div> : applications.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center"><Clock3 className="mx-auto size-8 text-muted-foreground"/><h2 className="mt-3 font-semibold">No applications yet</h2><p className="mt-1 text-sm text-muted-foreground">New creator applications will appear here.</p></div> : <div className="space-y-4">
      {applications.map((a: any) => <article key={a.id || a.userId} className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-lg font-semibold">{a.channelName || a.fullName}</h2><p className="mt-1 text-xs text-muted-foreground">{a.fullName} · @{a.username} · {a.email}</p><p className="mt-1 text-xs text-muted-foreground">{a.country} · {a.category} · Submitted {a.createdAt ? new Date(a.createdAt).toLocaleString() : "date unavailable"}</p></div><span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${a.status === "approved" ? "bg-emerald-500/10 text-emerald-700" : a.status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{a.status}</span></div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{a.about}</p>
        {a.sampleUrl ? <p className="mt-2 break-all text-xs"><a className="text-primary underline" href={a.sampleUrl} target="_blank" rel="noreferrer">Sample content link</a></p> : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(a.socials || {}).map(([platform, info]: [string, any]) => <div key={platform} className="rounded-xl border border-border bg-background p-3"><p className="text-xs font-semibold">{platform} · {info.audience || "Audience not provided"}</p><a href={info.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-xs text-primary underline">{info.url}</a></div>)}</div>
        {a.reviewNote ? <p className="mt-3 text-xs text-muted-foreground">Review note: {a.reviewNote}</p> : null}
        {a.status !== "approved" && a.status !== "rejected" ? <div className="mt-4 flex flex-wrap gap-2"><button disabled={review.isPending} onClick={() => review.mutate({ userId: a.userId, decision: "approved" })} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"><CheckCircle2 className="size-4"/>Approve creator</button><button disabled={review.isPending} onClick={() => review.mutate({ userId: a.userId, decision: "rejected" })} className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 px-4 py-2.5 text-xs font-semibold text-destructive disabled:opacity-50"><XCircle className="size-4"/>Reject</button></div> : null}
      </article>)}
    </div>}
  </main></AppShell>;
}
