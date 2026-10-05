import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/rewards")({
  component: RewardsRoute,
});

function RewardsRoute() {
  if (typeof window !== "undefined") {
    window.location.replace("/offers");
  }

  return null;
}
