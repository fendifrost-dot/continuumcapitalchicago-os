import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/loans")({
  component: () => <ComingSoon title="Loans" description="All loan accounts in one organizer" />,
});