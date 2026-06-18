import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/documents")({
  component: () => <ComingSoon title="Documents" description="Formation, Funding, Tax, Invoices, Contracts, Leases, Compliance" />,
});