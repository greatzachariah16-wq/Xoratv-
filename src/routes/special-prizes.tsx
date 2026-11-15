import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/xora/AppShell";
import { EmptyState } from "@/components/xora/EmptyState";
import { Gift } from "lucide-react";

export const Route = createFileRoute("/special-prizes")({ component: RetiredSpecialPrizes });

function RetiredSpecialPrizes() {
  return <AppShell><EmptyState icon={Gift} title="This programme has ended" description="XoraTV has retired this promotion programme. Historical creator earnings and account records remain preserved." /></AppShell>;
}
