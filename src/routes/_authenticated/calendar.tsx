import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: () => <ComingSoon title="Calendar" description="Deadlines, payments, renewals, follow-ups" />,
});