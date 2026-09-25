import { createFileRoute } from "@tanstack/react-router";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { AdminLiveUsersTracker } from "@/components/admin/AdminLiveUsersTracker";

export const Route = createFileRoute("/admin/tracker")({
  head: () => ({
    meta: [
      { title: "Live Activity Tracker — Admin — Xora" },
      {
        name: "description",
        content: "Real-time viewer presence and heartbeat monitor.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminTrackerPage,
});

function AdminTrackerPage() {
  return (
    <AdminProtectedLayout title="Live Activity Tracker" currentSectionId="presence">
      <AdminLiveUsersTracker />
    </AdminProtectedLayout>
  );
}
