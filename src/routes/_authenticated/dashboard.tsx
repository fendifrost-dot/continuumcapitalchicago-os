import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, TrendingUp, AlertCircle, Clock, CheckCircle2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function currency(n: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n ?? 0);
}

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [invoices, loans, funding, activity] = await Promise.all([
        supabase.from("invoices").select("id, invoice_number, total, status, due_date, company_id, companies(legal_name)").in("status", ["sent", "overdue"]).order("due_date", { ascending: true }).limit(8),
        supabase.from("loans").select("id, lender, next_due_date, monthly_payment, company_id, companies(legal_name)").not("next_due_date", "is", null).order("next_due_date", { ascending: true }).limit(6),
        supabase.from("funding_applications").select("stage"),
        supabase.from("activity_logs").select("id, summary, created_at, actor_name").order("created_at", { ascending: false }).limit(8),
      ]);
      const stages: Record<string, number> = { researching: 0, applied: 0, under_review: 0, approved: 0, funded: 0, denied: 0, closed: 0 };
      (funding.data ?? []).forEach((f: any) => { stages[f.stage] = (stages[f.stage] ?? 0) + 1; });
      return { invoices: invoices.data ?? [], loans: loans.data ?? [], stages, activity: activity.data ?? [] };
    },
  });

  const outstandingTotal = stats?.invoices.reduce((s: number, i: any) => s + Number(i.total ?? 0), 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your operations at a glance"
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" /> Quick action
          </Button>
        }
      />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={TrendingUp} label="Outstanding" value={currency(outstandingTotal)} accent="text-accent" />
          <KpiCard icon={Clock} label="Upcoming payments" value={String(stats?.loans.length ?? 0)} />
          <KpiCard icon={AlertCircle} label="Open invoices" value={String(stats?.invoices.length ?? 0)} />
          <KpiCard icon={CheckCircle2} label="Funded YTD" value={String(stats?.stages.funded ?? 0)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between border-b">
              <CardTitle className="text-sm font-semibold">Outstanding Invoices</CardTitle>
              <Badge variant="secondary">{stats?.invoices.length ?? 0}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              {stats?.invoices.length ? (
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b">
                      <th className="text-left px-4 py-2 font-medium">Invoice</th>
                      <th className="text-left px-4 py-2 font-medium">Company</th>
                      <th className="text-left px-4 py-2 font-medium">Due</th>
                      <th className="text-right px-4 py-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.invoices.map((inv: any) => (
                      <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-mono text-xs">{inv.invoice_number}</td>
                        <td className="px-4 py-2.5">{inv.companies?.legal_name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{inv.due_date ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{currency(inv.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState message="No outstanding invoices" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-sm font-semibold">Funding Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2.5">
              {stats && Object.entries(stats.stages).map(([stage, count]) => (
                <div key={stage} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-muted-foreground">{stage.replace("_", " ")}</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="border-b">
              <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {stats?.activity.length ? (
                <ul className="divide-y">
                  {stats.activity.map((a: any) => (
                    <li key={a.id} className="px-4 py-3 text-sm">
                      <div className="text-foreground">{a.summary}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {a.actor_name ?? "System"} · {new Date(a.created_at).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState message="No recent activity" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-sm font-semibold">Upcoming Payments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {stats?.loans.length ? (
                <ul className="divide-y">
                  {stats.loans.map((l: any) => (
                    <li key={l.id} className="px-4 py-3 text-sm flex items-center justify-between">
                      <div>
                        <div className="font-medium">{l.companies?.legal_name ?? l.lender}</div>
                        <div className="text-xs text-muted-foreground">{l.lender} · {l.next_due_date}</div>
                      </div>
                      <div className="font-medium">{currency(l.monthly_payment)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState message="No upcoming payments" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function KpiCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${accent ?? "text-muted-foreground"}`} />
        </div>
        <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="px-4 py-10 text-center text-sm text-muted-foreground">{message}</div>;
}