import { addDays, addMonths, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";

export type Frequency = "weekly" | "biweekly" | "semimonthly" | "monthly" | "quarterly";

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semimonthly: "Twice a month (1st & 15th)",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

function toDate(d: string | Date): Date {
  return typeof d === "string" ? parseISO(d) : d;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Compute the next run date after a given date for a cadence. Income-independent. */
export function nextRunDate(from: string | Date, frequency: Frequency): string {
  const d = toDate(from);
  switch (frequency) {
    case "weekly":
      return fmt(addDays(d, 7));
    case "biweekly":
      return fmt(addDays(d, 14));
    case "semimonthly": {
      const day = d.getUTCDate();
      if (day < 15) {
        const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 15));
        return fmt(n);
      }
      const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      return fmt(n);
    }
    case "quarterly":
      return fmt(addMonths(d, 3));
    case "monthly":
    default:
      return fmt(addMonths(d, 1));
  }
}

export interface PaymentScheduleRow {
  id: string;
  company_id: string;
  name: string;
  payee: string | null;
  amount: number;
  frequency: Frequency;
  method: string | null;
  category: string;
  next_run_date: string;
  active: boolean;
  memo: string | null;
  last_posted_on: string | null;
}

/**
 * Record a scheduled payment as a clean owner-draw (or chosen category) transaction
 * and advance the schedule to its next run date. This DOES NOT move money — it keeps
 * the books accurate. The actual transfer is executed by the operator in Melio/Square/Stripe.
 */
export async function recordScheduledPayment(schedule: PaymentScheduleRow) {
  const occurredOn = schedule.next_run_date;

  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert({
      company_id: schedule.company_id,
      occurred_on: occurredOn,
      payee: schedule.payee ?? schedule.name,
      category: schedule.category as "owner_draw",
      amount: schedule.amount,
      description: schedule.memo ?? `Scheduled: ${schedule.name}`,
      billable: false,
    })
    .select("id")
    .single();
  if (txErr) throw txErr;

  const next = nextRunDate(occurredOn, schedule.frequency);
  const { error: schErr } = await supabase
    .from("payment_schedules")
    .update({ next_run_date: next, last_posted_on: occurredOn })
    .eq("id", schedule.id);
  if (schErr) throw schErr;

  await logActivity({
    action: "payment_recorded",
    summary: `Recorded ${schedule.name} (${schedule.payee ?? "payee"})`,
    entityType: "payment_schedule",
    entityId: schedule.id,
    companyId: schedule.company_id,
    metadata: { amount: schedule.amount, method: schedule.method, posted_on: occurredOn },
  });

  return { transactionId: tx.id, nextRunDate: next };
}
