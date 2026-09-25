import { createFileRoute } from "@tanstack/react-router";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { AdminUsersDirectory } from "@/components/admin/AdminUsersDirectory";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "User Directory — Admin — Xora" },
      {
        name: "description",
        content: "Registered users on XoraTV.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  return (
    <AdminProtectedLayout title="Users Directory" currentSectionId="users">
      <AdminUsersDirectory />
    </AdminProtectedLayout>
  );
}
