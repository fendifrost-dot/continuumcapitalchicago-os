import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, CalendarClock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { PaymentScheduleDialog } from "@/components/payment-schedule-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { currency, formatDate } from "@/lib/format";
import {
  FREQUENCY_LABELS,
  recordScheduledPayment,
  type Frequency,
  type PaymentScheduleRow,
} from "@/lib/payments";

export const Route = createFileRoute("/_authenticated/payments")({
  component: PaymentsPage,
});

type Row = PaymentScheduleRow & { companies?: { legal_name: string } | null };

function PaymentsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [recording, setRecording] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["payment-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_schedules")
        .select(
          "id, company_id, name, payee, amount, frequency, method, category, next_run_date, active, memo, last_posted_on, companies(legal_name)",
        )
        .order("next_run_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const dueNow = (data ?? []).filter((s) => s.active && s.next_run_date <= today);
  const monthlyOutflow = (data ?? [])
    .filter((s) => s.active)
    .reduce((sum, s) => sum + normalizeMonthly(Number(s.amount), s.frequency), 0);

  const record = async (s: Row) => {
    setRecording(s.id);
    try {
      const res = await recordScheduledPayment(s);
      toast.success(`Recorded ${currency(s.amount)} · next run ${formatDate(res.nextRunDate)}`);
      qc.invalidateQueries({ queryKey: ["payment-schedules"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to record payment");
    } finally {
      setRecording(null);
    }
  };

  const toggleActive = async (s: Row) => {
    const { error } = await supabase
      .from("payment_schedules")
      .update({ active: !s.active })
      .eq("id", s.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["payment-schedules"] });
  };

  return (
    <>
      <PageHeader
        title="Payments"
        description="Recurring owner draws & payouts that run independent of income"
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> New schedule
          </Button>
        }
      />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Kpi label="Active schedules" value={String((data ?? []).filter((s) => s.active).length)} />
          <Kpi label="Due now" value={String(dueNow.length)} accent />
          <Kpi label="Est. monthly outflow" value={currency(monthlyOutflow)} />
        </div>

        {dueNow.length > 0 && (
          <Card className="overflow-hidden border-accent/40">
            <div className="flex items-center gap-2 border-b bg-accent/5 px-4 py-2.5">
              <CalendarClock className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold">Due now</span>
              <Badge variant="secondary">{dueNow.length}</Badge>
            </div>
            <ul className="divide-y">
              {dueNow.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {s.name} <span className="text-muted-foreground">· {s.companies?.legal_name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.payee ?? "—"} · {s.method ?? "no method"} · due {formatDate(s.next_run_date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold">{currency(s.amount)}</span>
                    <Button size="sm" onClick={() => record(s)} disabled={recording === s.id}>
                      <CheckCircle2 className="h-4 w-4" />
                      {recording === s.id ? "Recording…" : "Record"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="overflow-hidden">
          <div className="border-b px-4 py-2.5 text-sm font-semibold">All schedules</div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Schedule</th>
                <th className="text-left px-4 py-2.5 font-medium">Company</th>
                <th className="text-left px-4 py-2.5 font-medium">Cadence</th>
                <th className="text-left px-4 py-2.5 font-medium">Method</th>
                <th className="text-right px-4 py-2.5 font-medium">Amount</th>
                <th className="text-left px-4 py-2.5 font-medium">Next run</th>
                <th className="text-center px-4 py-2.5 font-medium">Active</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
              ) : !data?.length ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No payment schedules yet</td></tr>
              ) : (
                data.map((s) => (
                  <tr key={s.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium">
                      {s.name}
                      <div className="text-xs text-muted-foreground">{s.payee ?? "—"}</div>
                    </td>
                    <td className="px-4 py-2.5">{s.companies?.legal_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {FREQUENCY_LABELS[s.frequency]}
                    </td>
                    <td className="px-4 py-2.5">{s.method ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{currency(s.amount)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDate(s.next_run_date)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <Switch checked={s.active} onCheckedChange={() => toggleActive(s)} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => record(s)} disabled={recording === s.id}>
                        Record
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <PaymentScheduleDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

function normalizeMonthly(amount: number, frequency: Frequency): number {
  switch (frequency) {
    case "weekly":
      return (amount * 52) / 12;
    case "biweekly":
      return (amount * 26) / 12;
    case "semimonthly":
      return amount * 2;
    case "quarterly":
      return amount / 3;
    case "monthly":
    default:
      return amount;
  }
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight ${accent ? "text-accent" : ""}`}>
        {value}
      </div>
    </Card>
  );
}
