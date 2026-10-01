import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, BookOpen, Smartphone, Wallet, Banknote, RefreshCw } from "lucide-react";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { adminCommerceQuery } from "@/lib/commerce";

export const Route = createFileRoute("/admin/commerce")({ component: AdminCommerceOverview });

function AdminCommerceOverview() {
  const query = useQuery(adminCommerceQuery());
  const o = query.data?.overview;
  const creators = Array.isArray(o?.creators) ? o.creators : [];
  const courses = Array.isArray(o?.courses) ? o.courses : [];
  const dataOrders = Array.isArray(o?.dataOrders) ? o.dataOrders : [];
  const courseOrders = Array.isArray(o?.courseOrders) ? o.courseOrders : [];
  const commissions = Array.isArray(o?.commissions) ? o.commissions : [];
  const payoutDetails = Array.isArray(o?.payoutDetails) ? o.payoutDetails : [];
  const successful = (x: any) => ["success","paid","delivered","successful"].includes(String(x?.status || "").toLowerCase());
  const revenue = dataOrders.concat(courseOrders).filter(successful).reduce((n: number, x: any) => n + Number(x.customerPrice || 0), 0);
  const pendingCommission = commissions.filter((x: any) => x.status === "pending").reduce((n: number, x: any) => n + Number(x.amount || 0), 0);
  return <AdminProtectedLayout title="Commerce Overview" subtitle="A clean live summary of Xora commerce activity." currentSectionId="commerce">
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Commerce</p><h1 className="mt-1 font-display text-2xl font-semibold">Commerce overview</h1><p className="mt-1 text-xs text-muted-foreground">Use the admin menu for Pricing, Test Data, Creator Reference, CPA and discount tools.</p></div><button type="button" onClick={() => void query.refetch()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold"><RefreshCw className={query.isFetching ? "size-3.5 animate-spin" : "size-3.5"} />Refresh</button></header>
      {query.error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">Could not load commerce overview.</div> : null}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6"><Metric icon={Users} label="Creators" value={creators.length} /><Metric icon={BookOpen} label="Courses" value={courses.length} /><Metric icon={Smartphone} label="Data orders" value={dataOrders.length} /><Metric icon={BookOpen} label="Course orders" value={courseOrders.length} /><Metric icon={Wallet} label="Sales" value={`₦${revenue.toLocaleString()}`} /><Metric icon={Banknote} label="Payout profiles" value={payoutDetails.length} /></section>
      <section className="grid gap-3 md:grid-cols-2"><div className="rounded-2xl border border-border bg-surface p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Creator commissions</p><p className="mt-1 text-2xl font-semibold">₦{pendingCommission.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Pending commission across creator sales.</p></div><div className="rounded-2xl border border-border bg-surface p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Payout readiness</p><p className="mt-1 text-2xl font-semibold">{payoutDetails.length} / {creators.length}</p><p className="mt-1 text-xs text-muted-foreground">Creators with saved payout details.</p></div></section>
      <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-sm font-semibold">Commerce tools are separated</p><p className="mt-1 text-xs text-muted-foreground">Open the floating admin menu to manage provider pricing, controlled test purchases, creator payout references, CPA tools and discount campaigns.</p></div>
    </div>
  </AdminProtectedLayout>;
}
function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: any }) { return <div className="rounded-xl border border-border bg-surface p-3"><Icon className="size-4 text-primary" /><p className="mt-2 text-[10px] text-muted-foreground">{label}</p><p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p></div>; }