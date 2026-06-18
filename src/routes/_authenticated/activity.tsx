import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/activity")({
  component: () => <ComingSoon title="Activity Feed" description="Chronological timeline of every event" />,
});