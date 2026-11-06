import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/offers")({
  component: RetiredOffersRoute,
});

function RetiredOffersRoute() {
  return <Navigate to="/" replace />;
}
