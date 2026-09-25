import { createFileRoute } from "@tanstack/react-router";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { AdminSupportInbox } from "@/components/admin/AdminSupportInbox";

export const Route = createFileRoute("/admin/support")({
  head: () => ({
    meta: [
      { title: "Support Inbox — Admin — Xora" },
      {
        name: "description",
        content: "Customer support center and ticket replies.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminSupportPage,
});

function AdminSupportPage() {
  return (
    <AdminProtectedLayout title="Support Inbox" currentSectionId="support">
      <AdminSupportInbox />
    </AdminProtectedLayout>
  );
}
