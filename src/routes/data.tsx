import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/data")({
  component: RetiredBuyDataRoute,
});

function RetiredBuyDataRoute() {
  return <Navigate to="/" replace />;
}
