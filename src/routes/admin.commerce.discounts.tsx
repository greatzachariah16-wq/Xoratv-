import { createFileRoute } from "@tanstack/react-router";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { AdminDiscountCampaigns } from "@/components/admin/AdminDiscountCampaigns";

export const Route = createFileRoute("/admin/commerce/discounts")({ component: Discounts });
function Discounts(){return <AdminProtectedLayout title="Discount Campaigns" subtitle="CPA-gated discounts for data and courses." currentSectionId="commerce-discounts"><AdminDiscountCampaigns /></AdminProtectedLayout>;}