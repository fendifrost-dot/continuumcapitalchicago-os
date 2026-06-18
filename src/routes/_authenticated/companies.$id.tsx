import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, Upload, FileText } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CredentialFormDialog } from "@/components/credential-form-dialog";
import { TransactionFormDialog } from "@/components/transaction-form-dialog";
import { FundingFormDialog } from "@/components/funding-form-dialog";
import { LoanFormDialog } from "@/components/loan-form-dialog";
import { DocumentUpload, getDocumentUrl } from "@/components/document-upload";
import { ActivityTimeline } from "@/components/activity-timeline";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";
import { canViewCredentials, canGenerateInvoices } from "@/lib/permissions";
import { currency, formatDate, formatDateTime } from "@/lib/format";
import { generateInvoiceFromTransactions } from "@/lib/invoices";
import { Mail, Phone, MapPin, Globe } from "lucide-react";

export const Route = createFileRoute("/_authenticated/companies/$id")({
  component: CompanyDetail,
});

function CompanyDetail() {
  const { id } = Route.useParams();
  const { data: user } = useCurrentUser();
  const canSeeCredentials = user && canViewCredentials(user.roles);
  const canInvoice = user && canGenerateInvoices(user.roles);
  const isStaff = user?.isInternal;

  const [txDialog, setTxDialog] = useState(false);
  const [credDialog, setCredDialog] = useState(false);
  const [fundDialog, setFundDialog] = useState(false);
  const [loanDialog, setLoanDialog] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const { data: company } = useQuery({
    queryKey: ["company", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("*, clients(name, id)")
        .eq("id", id)
        .maybeSingle();
      return data;
    },
  });

  const { data: transactions } = useQuery({
    queryKey: ["company-transactions", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, occurred_on, payee, category, amount, description, billable, invoice_id")
        .eq("company_id", id)
        .order("occurred_on", { ascending: false });
      return data ?? [];
    },
  });

  const { data: funding } = useQuery({
    queryKey: ["company-funding", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("funding_applications")
        .select("id, lender, stage, requested_amount, approved_amount")
        .eq("company_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: loans } = useQuery({
    queryKey: ["company-loans", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("loans")
        .select("id, lender, balance, monthly_payment, next_due_date, autopay")
        .eq("company_id", id);
      return data ?? [];
    },
  });

  const { data: calendarEvents } = useQuery({
    queryKey: ["company-calendar", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("calendar_events")
        .select("id, title, event_type, starts_at")
        .eq("company_id", id)
        .order("starts_at", { ascending: true });
      return data ?? [];
    },
  });

  const { data: documents, refetch: refetchDocs } = useQuery({
    queryKey: ["company-documents", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, folder, file_name, file_path, created_at")
        .eq("company_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const billableUninvoiced = (transactions ?? []).filter((t) => t.billable && !t.invoice_id);

  const handleGenerateInvoice = async () => {
    if (selectedTx.size === 0) {
      toast.error("Select billable transactions");
      return;
    }
    try {
      const invoice = await generateInvoiceFromTransactions(id, Array.from(selectedTx));
      toast.success(`Invoice ${invoice.invoice_number} created`);
      setSelectedTx(new Set());
      qc.invalidateQueries({ queryKey: ["company-transactions", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <>
      <PageHeader
        title={company?.legal_name ?? "Company"}
        description={company?.clients?.name ? `Client: ${company.clients.name}` : ""}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/companies">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />
      <div className="p-6">
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {canSeeCredentials && <TabsTrigger value="credentials">Credentials</TabsTrigger>}
            {isStaff && <TabsTrigger value="transactions">Transactions</TabsTrigger>}
            <TabsTrigger value="funding">Funding</TabsTrigger>
            {isStaff && <TabsTrigger value="loans">Loans</TabsTrigger>}
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            {isStaff && <TabsTrigger value="audit">Audit Trail</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <InfoCard
                label="Entity type"
                value={(company?.entity_type ?? "—").toString().toUpperCase()}
              />
              <InfoCard label="EIN" value={company?.ein ?? "—"} mono />
              <InfoCard label="Industry" value={company?.industry ?? "—"} />
              <InfoCard label="Business email" value={company?.business_email ?? "—"} icon={Mail} />
              <InfoCard
                label="Business phone"
                value={company?.business_phone ?? "—"}
                icon={Phone}
              />
              <InfoCard label="Website" value={company?.website ?? "—"} icon={Globe} />
              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Address
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    {company?.address_line1 ? (
                      <>
                        <div>{company.address_line1}</div>
                        {company.address_line2 && <div>{company.address_line2}</div>}
                        <div className="text-muted-foreground">
                          {[company.city, company.state, company.postal_code]
                            .filter(Boolean)
                            .join(", ")}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                </CardContent>
              </Card>
              <InfoCard label="Office lease" value={company?.lease_status ?? "—"} />
            </div>
            {isStaff && (
              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-sm font-semibold">Quick actions</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 p-4">
                  <Button size="sm" variant="outline" onClick={() => setTxDialog(true)}>
                    <Plus className="h-4 w-4" /> Add transaction
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => refetchDocs()}>
                    <Upload className="h-4 w-4" /> Upload document
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setFundDialog(true)}>
                    <Plus className="h-4 w-4" /> New funding application
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setLoanDialog(true)}>
                    <Plus className="h-4 w-4" /> Add loan account
                  </Button>
                  {canSeeCredentials && (
                    <Button size="sm" variant="outline" onClick={() => setCredDialog(true)}>
                      <Plus className="h-4 w-4" /> Add vault reference
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {canSeeCredentials && (
            <TabsContent value="credentials">
              <Card className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Metadata only — passwords are stored in your external vault.
                  </p>
                  <Button size="sm" onClick={() => setCredDialog(true)}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
                <CredentialsList companyId={id} />
              </Card>
            </TabsContent>
          )}

          <TabsContent value="transactions">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b px-4 py-2">
                <span className="text-sm font-medium">Transactions</span>
                <div className="flex gap-2">
                  {canInvoice && selectedTx.size > 0 && (
                    <Button size="sm" variant="outline" onClick={handleGenerateInvoice}>
                      <FileText className="h-4 w-4" /> Generate invoice ({selectedTx.size})
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setTxDialog(true)}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-10 px-4 py-2" />
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-left px-4 py-2 font-medium">Payee</th>
                    <th className="text-right px-4 py-2 font-medium">Amount</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {!transactions?.length ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        No transactions
                      </td>
                    </tr>
                  ) : (
                    transactions.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="px-4 py-2">
                          {t.billable && !t.invoice_id && (
                            <Checkbox
                              checked={selectedTx.has(t.id)}
                              onCheckedChange={() =>
                                setSelectedTx((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(t.id)) next.delete(t.id);
                                  else next.add(t.id);
                                  return next;
                                })
                              }
                            />
                          )}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {formatDate(t.occurred_on)}
                        </td>
                        <td className="px-4 py-2">{t.payee ?? t.description ?? "—"}</td>
                        <td className="px-4 py-2 text-right font-medium">{currency(t.amount)}</td>
                        <td className="px-4 py-2">
                          {t.invoice_id ? (
                            <Badge variant="secondary">Invoiced</Badge>
                          ) : t.billable ? (
                            <Badge>Billable</Badge>
                          ) : (
                            <Badge variant="outline">Recorded</Badge>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          </TabsContent>

          <TabsContent value="funding">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b px-4 py-2">
                <span className="text-sm font-medium">Funding applications</span>
                {isStaff && (
                  <Button size="sm" onClick={() => setFundDialog(true)}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                )}
              </div>
              {!funding?.length ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No funding applications
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Lender</th>
                      <th className="text-left px-4 py-2 font-medium">Stage</th>
                      <th className="text-right px-4 py-2 font-medium">Requested</th>
                      <th className="text-right px-4 py-2 font-medium">Approved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funding.map((f) => (
                      <tr key={f.id} className="border-t">
                        <td className="px-4 py-2 font-medium">{f.lender}</td>
                        <td className="px-4 py-2">
                          <Badge className="capitalize">{f.stage.replace("_", " ")}</Badge>
                        </td>
                        <td className="px-4 py-2 text-right">{currency(f.requested_amount)}</td>
                        <td className="px-4 py-2 text-right">{currency(f.approved_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="loans">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b px-4 py-2">
                <span className="text-sm font-medium">Loan accounts</span>
                <Button size="sm" onClick={() => setLoanDialog(true)}>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
              {!loans?.length ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No loan accounts
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Lender</th>
                      <th className="text-right px-4 py-2 font-medium">Balance</th>
                      <th className="text-right px-4 py-2 font-medium">Payment</th>
                      <th className="text-left px-4 py-2 font-medium">Next due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="px-4 py-2 font-medium">{l.lender}</td>
                        <td className="px-4 py-2 text-right">{currency(l.balance)}</td>
                        <td className="px-4 py-2 text-right">{currency(l.monthly_payment)}</td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {formatDate(l.next_due_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="calendar">
            <Card className="overflow-hidden">
              {!calendarEvents?.length ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No calendar events
                </div>
              ) : (
                <ul className="divide-y">
                  {calendarEvents.map((e) => (
                    <li key={e.id} className="px-4 py-3 flex items-center justify-between text-sm">
                      <div>
                        <div className="font-medium">{e.title}</div>
                        <Badge variant="secondary" className="mt-1 capitalize text-[10px]">
                          {e.event_type.replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">{formatDateTime(e.starts_at)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <Card className="p-4 space-y-4">
              {isStaff && <DocumentUpload companyId={id} onUploaded={() => refetchDocs()} />}
              {!documents?.length ? (
                <div className="py-10 text-center text-sm text-muted-foreground">No documents</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b">
                      <th className="text-left px-2 py-2 font-medium">File</th>
                      <th className="text-left px-2 py-2 font-medium">Folder</th>
                      <th className="text-left px-2 py-2 font-medium">Uploaded</th>
                      <th className="text-right px-2 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((d) => (
                      <tr key={d.id} className="border-b last:border-0">
                        <td className="px-2 py-2.5">{d.file_name}</td>
                        <td className="px-2 py-2.5">
                          <Badge variant="secondary">{d.folder}</Badge>
                        </td>
                        <td className="px-2 py-2.5 text-muted-foreground">
                          {formatDateTime(d.created_at)}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={async () => {
                              const url = await getDocumentUrl(d.file_path);
                              if (url) window.open(url, "_blank");
                            }}
                          >
                            Download
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <ActivityTimeline companyId={id} limit={100} />
          </TabsContent>
        </Tabs>
      </div>

      <TransactionFormDialog open={txDialog} onOpenChange={setTxDialog} defaultCompanyId={id} />
      <CredentialFormDialog open={credDialog} onOpenChange={setCredDialog} companyId={id} />
      <FundingFormDialog open={fundDialog} onOpenChange={setFundDialog} defaultCompanyId={id} />
      <LoanFormDialog open={loanDialog} onOpenChange={setLoanDialog} defaultCompanyId={id} />
    </>
  );
}

function InfoCard({
  label,
  value,
  icon: Icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: typeof Mail;
  mono?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5 space-y-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-sm flex items-center gap-1.5 ${mono ? "font-mono" : ""}`}>
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function CredentialsList({ companyId }: { companyId: string }) {
  const { data } = useQuery({
    queryKey: ["credentials", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("credentials")
        .select("id, label, category, provider, last_updated_at, vault_reference")
        .eq("company_id", companyId)
        .order("label");
      return data ?? [];
    },
  });

  if (!data?.length)
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">No credentials yet</div>
    );

  return (
    <table className="w-full text-sm">
      <thead className="text-xs uppercase tracking-wider text-muted-foreground">
        <tr className="border-b">
          <th className="text-left px-2 py-2 font-medium">Label</th>
          <th className="text-left px-2 py-2 font-medium">Category</th>
          <th className="text-left px-2 py-2 font-medium">Provider</th>
          <th className="text-left px-2 py-2 font-medium">Vault ref</th>
          <th className="text-right px-2 py-2 font-medium">Action</th>
        </tr>
      </thead>
      <tbody>
        {data.map((c) => (
          <tr key={c.id} className="border-b last:border-0">
            <td className="px-2 py-2.5 font-medium">{c.label}</td>
            <td className="px-2 py-2.5">
              <Badge variant="secondary" className="capitalize">
                {c.category}
              </Badge>
            </td>
            <td className="px-2 py-2.5 text-muted-foreground">{c.provider ?? "—"}</td>
            <td className="px-2 py-2.5 font-mono text-xs text-muted-foreground truncate max-w-[200px]">
              {c.vault_reference ?? "—"}
            </td>
            <td className="px-2 py-2.5 text-right">
              {c.vault_reference && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(c.vault_reference!);
                    toast.success("Vault reference copied");
                  }}
                >
                  Copy ref
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
