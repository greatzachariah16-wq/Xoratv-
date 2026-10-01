import { createFileRoute } from "@tanstack/react-router";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { AdminCampaignManager } from "@/components/admin/AdminCampaignManager";

export const Route = createFileRoute("/admin/campaigns/manage")({ component: ManageCampaigns });
function ManageCampaigns(){return <AdminProtectedLayout title="Campaign Manager" subtitle="Create, edit, pause and remove in-house campaigns." currentSectionId="campaign-manager"><AdminCampaignManager /></AdminProtectedLayout>;}