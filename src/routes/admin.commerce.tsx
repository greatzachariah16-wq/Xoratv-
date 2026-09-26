import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, BookOpen, Smartphone, Wallet } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { adminCommerceQuery } from "@/lib/commerce";

export const Route = createFileRoute("/admin/commerce")({ component: AdminCommerce });

function AdminCommerce() {
  const { data, isPending, error } = useQuery(adminCommerceQuery());
  const o = data?.overview;
  if (isPending) return <AppShell wide><div className="p-8 text-sm text-muted-foreground">Loading commerce monitor…</div></AppShell>;
  if (error) return <AppShell wide><div className="p-8 text-sm text-destructive">Could not load commerce monitor.</div></AppShell>;
  return <AppShell wide><div className="space-y-5"><header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Admin</p><h1 className="mt-2 font-display text-3xl font-semibold">Commerce monitor</h1><p className="mt-1 text-sm text-muted-foreground">Creators, courses, data orders, commissions and payout records from the live Firebase-backed commerce layer.</p></header><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[[Users,"Creators",o?.creators?.length||0],[BookOpen,"Courses",o?.courses?.length||0],[Smartphone,"Data orders",o?.dataOrders?.length||0],[Wallet,"Commissions",o?.commissions?.length||0]].map(([I,l,v])=><div className="rounded-2xl border border-border bg-surface p-4" key={String(l)}><I className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">{l}</p><p className="text-2xl font-semibold">{v}</p></div>)}</div><section className="rounded-3xl border border-border bg-surface p-5"><h2 className="font-display text-xl font-semibold">Commerce records</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground">Course orders</p><p className="mt-1 text-xl font-semibold">{o?.courseOrders?.length||0}</p></div><div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground">Payout profiles</p><p className="mt-1 text-xl font-semibold">{o?.payoutDetails?.length||0}</p></div></div><h2 className="mt-6 font-display text-xl font-semibold">Creators</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="pb-3">Creator</th><th className="pb-3">Status</th><th className="pb-3">Created</th></tr></thead><tbody>{(o?.creators||[]).map((c:any)=><tr key={c.id} className="border-b border-border/60"><td className="py-3">{c.displayName} <span className="text-muted-foreground">@{c.username}</span></td><td>{c.status}</td><td>{new Date(c.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div></section></div></AppShell>;
}
