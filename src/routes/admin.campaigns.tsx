import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3, Eye, MousePointerClick, Layers, RefreshCw } from "lucide-react";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { getAdminAuthHeaders } from "@/hooks/useAdminAuth";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/campaigns")({
  head: () => ({ meta: [{ title: "In-House Ads Overview — Admin — Xora" }, { name: "robots", content: "noindex" }] }),
  component: AdminCampaignsPage,
});
function AdminCampaignsPage() {
  const [analytics,setAnalytics]=useState<any>(null); const [loading,setLoading]=useState(true);
  async function load(){setLoading(true);try{const r=await fetch("/api/admin/campaigns",{headers:getAdminAuthHeaders({"Content-Type":"application/json"}),credentials:"include"});const j=await r.json();if(j.ok)setAnalytics(j.analytics||null);}finally{setLoading(false);}}
  useEffect(()=>{void load()},[]);
  const cards=[["Campaigns",analytics?.totalCampaigns??0,Layers],["Active",analytics?.activeCampaigns??0,BarChart3],["Impressions",Number(analytics?.totalImpressions||0).toLocaleString(),Eye],["Clicks",Number(analytics?.totalClicks||0).toLocaleString(),MousePointerClick]];
  return <AdminProtectedLayout title="Ads Overview" subtitle="A clean summary of in-house advertising activity." currentSectionId="campaigns">
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Advertising</p><h1 className="mt-1 font-display text-2xl font-semibold">Ads overview</h1><p className="mt-1 text-xs text-muted-foreground">Use the admin menu to open Campaign Manager without crowding this overview.</p></div><button type="button" onClick={()=>void load()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold"><RefreshCw className={loading?"size-3.5 animate-spin":"size-3.5"}/>Refresh</button></header>
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">{cards.map(([label,value,Icon]:any)=><div key={String(label)} className="rounded-xl border border-border bg-surface p-3"><Icon className="size-4 text-primary"/><p className="mt-2 text-[10px] text-muted-foreground">{label}</p><p className="mt-0.5 text-lg font-semibold">{value}</p></div>)}</section>
      <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-sm font-semibold">Ad tools are separated</p><p className="mt-1 text-xs text-muted-foreground">Campaign creation, editing, targeting and deletion are available from Campaign Manager in the admin menu.</p><Link to="/admin/campaigns/manage" className="mt-3 inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">Open Campaign Manager</Link></div>
    </div>
  </AdminProtectedLayout>;
}