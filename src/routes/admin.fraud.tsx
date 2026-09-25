import { createFileRoute } from "@tanstack/react-router";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { AdminFraudShieldDashboard } from "@/components/admin/AdminFraudShieldDashboard";

export const Route = createFileRoute("/admin/fraud")({
  head: () => ({
    meta: [
      { title: "Fraud Shield & Security — Admin — Xora" },
      {
        name: "description",
        content: "Bot detection, hardware fingerprint collisions, and 4-tier enforcement.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminFraudPage,
});

function AdminFraudPage() {
  return (
    <AdminProtectedLayout title="Fraud Shield" currentSectionId="fraud-guard">
      <AdminFraudShieldDashboard />
    </AdminProtectedLayout>
  );
}
