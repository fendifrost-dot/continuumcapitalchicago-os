import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, FileText } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { ClientDashboard } from "@/components/client-dashboard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { currency } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const PIPELINE_ORDER: Array<{ key: string; label: string }> = [
  { key: "researching", label: "Researching" },
  { key: "applied", label: "Applied" },
  { key: "under_review", label: "Under Review" },
  { key: "approved", label: "Approved" },
  { key: "funded", label: "Funded" },
  { key: "denied", label: "Denied" },
  { key: "closed", label: "Closed" },
];

function Dashboard() {
  const { data: user } = useCurrentUser();
  if (user?.isClient) return <ClientDashboard />;

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [invoices, loans, funding, activity] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, invoice_number, total, status, due_date, company_id, companies(legal_name)")
          .in("status", ["sent", "overdue"])
          .order("due_date", { ascending: true })
          .limit(8),
        supabase
          .from("loans")
          .select("id, lender, next_due_date, monthly_payment, company_id, companies(legal_name)")
          .not("next_due_date", "is", null)
          .order("next_due_date", { ascending: true })
          .limit(6),
        supabase.from("funding_applications").select("stage"),
        supabase
          .from("activity_logs")
          .select("id, summary, created_at, actor_name")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      const stages: Record<string, number> = {
        researching: 0,
        applied: 0,
        under_review: 0,
        approved: 0,
        funded: 0,
        denied: 0,
        closed: 0,
      };
      (funding.data ?? []).forEach((f: any) => {
        stages[f.stage] = (stages[f.stage] ?? 0) + 1;
      });
      return {
        invoices: invoices.data ?? [],
        loans: loans.data ?? [],
        stages,
        activity: activity.data ?? [],
      };
    },
  });

  const outstandingTotal =
    stats?.invoices.reduce((s: number, i: any) => s + Number(i.total ?? 0), 0) ?? 0;
  const fundedCount = stats?.stages.funded ?? 0;

  return (
    <>
      <PageHeader
        title="Operations"
        description="Firm-wide visibility across clients, companies, and activity"
        actions={
          user?.isInternal ? (
            <Button
              size="sm"
              className="rounded-xl font-bold text-[#2a1e00] border-0 hover:brightness-110"
              style={{
                backgroundImage: "linear-gradient(90deg, #D4AF37 0%, #8E6E37 100%)",
                boxShadow: "0 4px 20px rgba(212,175,55,0.25)",
              }}
            >
              <Plus className="h-4 w-4" /> Quick action
            </Button>
          ) : undefined
        }
      />
      <div className="p-8 space-y-8 bg-[#050505] min-h-[calc(100vh-3.5rem)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <KpiCard label="Outstanding" value={currency(outstandingTotal)} highlight />
          <KpiCard label="Upcoming Payments" value={String(stats?.loans.length ?? 0)} />
          <KpiCard label="Open Invoices" value={String(stats?.invoices.length ?? 0)} />
          <KpiCard label="Funded YTD" value={String(fundedCount)} highlight />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <Panel className="lg:col-span-8">
            <PanelHeader
              title="Outstanding Invoices"
              right={
                <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20">
                  {stats?.invoices.length ?? 0} Active
                </span>
              }
            />
            {stats?.invoices.length ? (
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-white/40">
                  <tr className="border-b border-white/5">
                    <th className="text-left px-6 py-3 font-bold">Invoice</th>
                    <th className="text-left px-6 py-3 font-bold">Company</th>
                    <th className="text-left px-6 py-3 font-bold">Due</th>
                    <th className="text-right px-6 py-3 font-bold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.invoices.map((inv: any) => (
                    <tr
                      key={inv.id}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-6 py-3 font-mono text-xs text-[#D4AF37]">
                        {inv.invoice_number}
                      </td>
                      <td className="px-6 py-3 text-white/80">{inv.companies?.legal_name ?? "—"}</td>
                      <td className="px-6 py-3 text-white/40">{inv.due_date ?? "—"}</td>
                      <td className="px-6 py-3 text-right font-semibold text-white">
                        {currency(inv.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState icon={<FileText className="w-8 h-8" />} message="All accounts current" />
            )}
          </Panel>

          <Panel className="lg:col-span-4">
            <PanelHeader title="Funding Pipeline" />
            <div className="p-4 space-y-1">
              {PIPELINE_ORDER.map(({ key, label }) => {
                const count = stats?.stages[key] ?? 0;
                const dim = count === 0;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
                  >
                    <span className="text-xs text-white/60 group-hover:text-white transition-colors">
                      {label}
                    </span>
                    <span
                      className={`text-xs font-bold ${dim ? "text-white/30" : "text-[#D4AF37]"}`}
                    >
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Panel>
            <PanelHeader title="Recent Activity" />
            {stats?.activity.length ? (
              <ul className="divide-y divide-white/5">
                {stats.activity.map((a: any) => (
                  <li key={a.id} className="px-6 py-3 text-sm">
                    <div className="text-white/90">{a.summary}</div>
                    <div className="mt-0.5 text-xs text-white/40">
                      {a.actor_name ?? "System"} · {new Date(a.created_at).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message="System monitoring active. No recent changes." />
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Upcoming Payments" />
            {stats?.loans.length ? (
              <ul className="divide-y divide-white/5">
                {stats.loans.map((l: any) => (
                  <li key={l.id} className="px-6 py-3 text-sm flex items-center justify-between">
                    <div>
                      <div className="font-medium text-white">
                        {l.companies?.legal_name ?? l.lender}
                      </div>
                      <div className="text-xs text-white/40">
                        {l.lender} · {l.next_due_date}
                      </div>
                    </div>
                    <div className="font-semibold text-[#D4AF37]">
                      {currency(l.monthly_payment)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message="No payments scheduled" />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function KpiCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="relative group">
      {highlight && (
        <div className="pointer-events-none absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-[#D4AF37]/40 to-transparent blur opacity-0 group-hover:opacity-100 transition duration-500" />
      )}
      <div className="relative bg-[#0d0d0d] p-6 rounded-2xl border border-white/5 shadow-2xl overflow-hidden">
        {highlight && (
          <div className="pointer-events-none absolute -right-4 -top-4 w-20 h-20 bg-[#D4AF37]/10 rounded-full blur-2xl" />
        )}
        <p
          className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${
            highlight ? "text-[#D4AF37]" : "text-white/40"
          }`}
        >
          {label}
        </p>
        <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
      </div>
    </div>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-[#0d0d0d] rounded-2xl border border-white/5 shadow-xl overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

function PanelHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="p-6 border-b border-white/5 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-white/80">{title}</h3>
      {right}
    </div>
  );
}

function EmptyState({ message, icon }: { message: string; icon?: ReactNode }) {
  return (
    <div className="p-12 flex flex-col items-center justify-center text-center">
      {icon && (
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 text-white/20">
          {icon}
        </div>
      )}
      <p className="text-sm text-white/30">{message}</p>
    </div>
  );
}
