import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/invoices")({
  component: () => <ComingSoon title="Invoices" description="Generate and track invoices" />,
});