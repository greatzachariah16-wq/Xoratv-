import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, RefreshCw, UserRound, CircleCheck, CircleAlert } from "lucide-react";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { adminCommerceQuery } from "@/lib/commerce";

export const Route = createFileRoute("/admin/commerce/creator-reference")({ component: CreatorReference });

function CreatorReference() {
  const query = useQuery(adminCommerceQuery());
  const rows = useMemo(() => {
    const creators = Array.isArray(query.data?.overview?.creators) ? query.data.overview.creators : [];
    const payouts = Array.isArray(query.data?.overview?.payoutDetails) ? query.data.overview.payoutDetails : [];
    const payoutMap = new Map(payouts.map((p: any) => [String(p.userId || p.id || ""), p]));
    return creators.map((c: any) => ({ creator: c, payout: payoutMap.get(String(c.userId || c.id || "")) || null }));
  }, [query.data]);

  return <AdminProtectedLayout title="Creator Reference" subtitle="Creator accounts and the payout information they have supplied." currentSectionId="creator-reference">
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Payouts</p><h1 className="mt-1 font-display text-2xl font-semibold">Creator Reference</h1><p className="mt-1 max-w-2xl text-xs text-muted-foreground">The admin reference page for identifying creators and viewing their saved bank payout details.</p></div>
        <button type="button" onClick={() => void query.refetch()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold"><RefreshCw className={query.isFetching ? "size-3.5 animate-spin" : "size-3.5"} />Refresh</button>
      </header>
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[850px] text-left text-xs">
          <thead className="border-b border-border bg-muted/30"><tr><th className="p-3">Creator</th><th className="p-3">Username</th><th className="p-3">Payout</th><th className="p-3">Account name</th><th className="p-3">Bank</th><th className="p-3">Account number</th><th className="p-3">Updated</th></tr></thead>
          <tbody>{rows.map(({ creator: c, payout: p }: any) => {
            const ready = Boolean(p?.accountName && p?.accountNumber && p?.bankName);
            return <tr key={String(c.userId || c.id)} className="border-b border-border/60 last:border-0">
              <td className="p-3"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary"><UserRound className="size-3.5" /></span><div><p className="font-semibold">{c.displayName || "Unnamed creator"}</p><p className="font-mono text-[10px] text-muted-foreground">{String(c.userId || c.id).slice(0, 18)}…</p></div></div></td>
              <td className="p-3">@{c.username || "—"}</td>
              <td className="p-3">{ready ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-700"><CircleCheck className="size-3" />Ready</span> : <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-700"><CircleAlert className="size-3" />Missing</span>}</td>
              <td className="p-3">{p?.accountName || "—"}</td><td className="p-3">{p?.bankName || "—"}</td><td className="p-3 font-mono">{p?.accountNumber || "—"}</td><td className="p-3">{p?.updatedAt ? new Date(p.updatedAt).toLocaleString() : "—"}</td>
            </tr>;
          })}</tbody>
        </table>
        {!query.isPending && rows.length === 0 ? <div className="p-8 text-center text-xs text-muted-foreground">No creator accounts found yet.</div> : null}
      </div>
      <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground"><Banknote className="mb-1 size-4 text-primary" />Only authenticated administrators can open this page. Account details come from the existing Firebase-backed payout records.</div>
    </div>
  </AdminProtectedLayout>;
}