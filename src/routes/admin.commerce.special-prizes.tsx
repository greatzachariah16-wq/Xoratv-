import { createFileRoute } from "@tanstack/react-router";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";

export const Route = createFileRoute("/admin/commerce/special-prizes")({ component: RetiredSpecialPrizesAdmin });

function RetiredSpecialPrizesAdmin() {
  return <AdminProtectedLayout title="Retired promotions" subtitle="Historical records are retained; this programme is no longer active." currentSectionId="commerce-special-prizes"><div className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted-foreground">This promotion programme has been retired. Historical conversion and payout records have not been deleted.</div></AdminProtectedLayout>;
}
