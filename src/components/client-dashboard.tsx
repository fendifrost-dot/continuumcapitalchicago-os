import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, Calendar, Landmark } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { currency, formatDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";

function ClientDashboard() {
  const { data: user } = useCurrentUser();

  const { data } = useQuery({
    queryKey: ["client-dashboard", user?.id],
    queryFn: async () => {
      const { data: companies } = await supabase
        .from("companies")
        .select("id, legal_name, entity_type")
        .order("legal_name");
      const companyIds = (companies ?? []).map((c) => c.id);

      const [invoices, funding, events] = await Promise.all([
        companyIds.length
          ? supabase
              .from("invoices")
              .select(
                "id, invoice_number, total, status, due_date, company_id, companies(legal_name)",
              )
              .in("company_id", companyIds)
              .in("status", ["sent", "overdue"])
              .order("due_date", { ascending: true })
              .limit(5)
          : Promise.resolve({ data: [] }),
        companyIds.length
          ? supabase
              .from("funding_applications")
              .select("id, lender, stage, company_id, companies(legal_name)")
              .in("company_id", companyIds)
              .not("stage", "in", '("closed","denied")')
              .limit(5)
          : Promise.resolve({ data: [] }),
        companyIds.length
          ? supabase
              .from("calendar_events")
              .select("id, title, starts_at, company_id, companies(legal_name)")
              .in("company_id", companyIds)
              .gte("starts_at", new Date().toISOString())
              .order("starts_at", { ascending: true })
              .limit(5)
          : Promise.resolve({ data: [] }),
      ]);

      return {
        companies: companies ?? [],
        invoices: invoices.data ?? [],
        funding: funding.data ?? [],
        events: events.data ?? [],
      };
    },
    enabled: !!user?.isClient,
  });

  return (
    <>
      <PageHeader
        title="Your account"
        description="View your companies, invoices, funding progress, and upcoming dates"
      />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Building2}
            label="Companies"
            value={String(data?.companies.length ?? 0)}
          />
          <StatCard
            icon={FileText}
            label="Open invoices"
            value={String(data?.invoices.length ?? 0)}
          />
          <StatCard
            icon={Landmark}
            label="Active funding"
            value={String(data?.funding.length ?? 0)}
          />
          <StatCard
            icon={Calendar}
            label="Upcoming dates"
            value={String(data?.events.length ?? 0)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-sm font-semibold">Your companies</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data?.companies.length ? (
                <ul className="divide-y">
                  {data.companies.map((c) => (
                    <li key={c.id} className="px-4 py-3 flex items-center justify-between text-sm">
                      <Link
                        to="/companies/$id"
                        params={{ id: c.id }}
                        className="font-medium hover:text-accent"
                      >
                        {c.legal_name}
                      </Link>
                      <Badge variant="secondary" className="uppercase text-[10px]">
                        {c.entity_type}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty message="No companies linked yet" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-sm font-semibold">Outstanding invoices</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data?.invoices.length ? (
                <ul className="divide-y">
                  {data.invoices.map(
                    (inv: {
                      id: string;
                      invoice_number: string;
                      total: number;
                      due_date: string | null;
                      companies?: { legal_name: string } | null;
                    }) => (
                      <li key={inv.id} className="px-4 py-3 text-sm flex justify-between gap-2">
                        <div>
                          <div className="font-mono text-xs">{inv.invoice_number}</div>
                          <div className="text-xs text-muted-foreground">
                            {inv.companies?.legal_name}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{currency(inv.total)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(inv.due_date)}
                          </div>
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              ) : (
                <Empty message="No outstanding invoices" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-sm font-semibold">Funding in progress</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data?.funding.length ? (
                <ul className="divide-y">
                  {data.funding.map(
                    (f: {
                      id: string;
                      lender: string;
                      stage: string;
                      companies?: { legal_name: string } | null;
                    }) => (
                      <li key={f.id} className="px-4 py-3 text-sm flex justify-between">
                        <div>
                          <div className="font-medium">{f.lender}</div>
                          <div className="text-xs text-muted-foreground">
                            {f.companies?.legal_name}
                          </div>
                        </div>
                        <Badge className="capitalize">{f.stage.replace("_", " ")}</Badge>
                      </li>
                    ),
                  )}
                </ul>
              ) : (
                <Empty message="No active funding applications" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-sm font-semibold">Upcoming dates</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data?.events.length ? (
                <ul className="divide-y">
                  {data.events.map(
                    (e: {
                      id: string;
                      title: string;
                      starts_at: string;
                      companies?: { legal_name: string } | null;
                    }) => (
                      <li key={e.id} className="px-4 py-3 text-sm">
                        <div className="font-medium">{e.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {e.companies?.legal_name} · {formatDate(e.starts_at)}
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              ) : (
                <Empty message="Nothing scheduled" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-accent" />
        </div>
        <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function Empty({ message }: { message: string }) {
  return <div className="px-4 py-10 text-center text-sm text-muted-foreground">{message}</div>;
}

export { ClientDashboard };
