import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/rewards")({
  component: RetiredRewardsRoute,
});

function RetiredRewardsRoute() {
  return <Navigate to="/" replace />;
}
