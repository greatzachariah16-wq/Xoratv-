import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/xseries")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/xseris" });
  },
});
