import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: () => <ComingSoon title="Transactions" description="Log billable and non-billable activity" />,
});