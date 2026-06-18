import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/funding")({
  component: () => <ComingSoon title="Funding" description="Kanban pipeline of funding applications" />,
});