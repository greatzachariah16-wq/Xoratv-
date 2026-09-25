import { createFileRoute } from "@tanstack/react-router";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { AdminCampaignManager } from "@/components/admin/AdminCampaignManager";

export const Route = createFileRoute("/admin/campaigns")({
  head: () => ({
    meta: [
      { title: "In-House Video Ads & Campaigns — Admin — Xora" },
      {
        name: "description",
        content: "Sponsor campaign videos, targeting, and impressions tracking.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminCampaignsPage,
});

function AdminCampaignsPage() {
  return (
    <AdminProtectedLayout title="In-House Campaigns" currentSectionId="campaigns">
      <AdminCampaignManager />
    </AdminProtectedLayout>
  );
}
