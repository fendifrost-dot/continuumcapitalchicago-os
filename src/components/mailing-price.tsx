import { currency } from "@/lib/format";

export interface PriceParts {
  page_count: number;
  postage_cents: number;
  certified_cents: number;
  electronic_receipt_cents: number;
  handling_fee_cents: number;
  total_cents: number;
}

export function MailingPrice({ quote }: { quote: PriceParts }) {
  const lines = [
    ["Pages", String(quote.page_count)],
    ["Print and postage", currency(quote.postage_cents / 100)],
    ["Certified mail", currency(quote.certified_cents / 100)],
    ["Electronic return receipt", currency(quote.electronic_receipt_cents / 100)],
    ["Continuum handling fee", currency(quote.handling_fee_cents / 100)],
  ];

  return (
    <div className="space-y-2 text-sm">
      {lines.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{label}</span>
          <span>{value}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 border-t border-border pt-2 font-medium">
        <span>Total</span>
        <span>{currency(quote.total_cents / 100)}</span>
      </div>
    </div>
  );
}
