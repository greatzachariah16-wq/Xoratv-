import { createFileRoute } from "@tanstack/react-router";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { ProviderDiscoveryPanel } from "@/components/xora/ProviderDiscoveryPanel";

export const Route = createFileRoute("/admin/discovery")({
  head: () => ({
    meta: [
      { title: "Provider Discovery Engine — Admin — Xora" },
      {
        name: "description",
        content: "Automated ingestion pipeline for YouTube, Vimeo, FAOTV, and RSS sources.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDiscoveryPage,
});

function AdminDiscoveryPage() {
  return (
    <AdminProtectedLayout title="Provider Discovery" currentSectionId="discovery">
      <ProviderDiscoveryPanel />
    </AdminProtectedLayout>
  );
}
