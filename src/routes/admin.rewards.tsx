import { createFileRoute } from "@tanstack/react-router";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { AdminRewardsManager } from "@/components/admin/AdminRewardsManager";

export const Route = createFileRoute("/admin/rewards")({
  head: () => ({
    meta: [
      { title: "Automated MTN Data Rewards — Admin — Xora" },
      {
        name: "description",
        content: "VTUshare wallet automation, 1GB data plan fulfillment, and vending logs.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminRewardsPage,
});

function AdminRewardsPage() {
  return (
    <AdminProtectedLayout title="Data Rewards" currentSectionId="data-rewards">
      <AdminRewardsManager />
    </AdminProtectedLayout>
  );
}
