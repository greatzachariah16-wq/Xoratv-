import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/rewards")({
  component: RewardsRoute,
});

function RewardsRoute() {
  return <Navigate to="/offers" replace />;
}
