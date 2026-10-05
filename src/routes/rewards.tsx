import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/rewards")({
  component: RewardsRoute,
});

function RewardsRoute() {
  return <Navigate to="/offers" replace />;
}
