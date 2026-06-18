import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, Phone, Building2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DocumentUpload, getDocumentUrl } from "@/components/document-upload";
import { ActivityTimeline } from "@/components/activity-timeline";
import { supabase } from "@/integrations/supabase/client";
import { currency, formatDate, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = Route.useParams();

  const { data } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const [client, companies] = await Promise.all([
        supabase.from("clients").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("companies")
          .select("id, legal_name, entity_type, industry, ein")
          .eq("client_id", id),
      ]);
      return { client: client.data, companies: companies.data ?? [] };
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["client-invoices", id],
    queryFn: async () => {
      const companyIds = (data?.companies ?? []).map((c: { id: string }) => c.id);
      if (!companyIds.length) return [];
      const { data: inv } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, total, issue_date, company_id, companies(legal_name)")
        .in("company_id", companyIds)
        .order("created_at", { ascending: false });
      return inv ?? [];
    },
    enabled: !!data?.companies?.length,
  });

  const { data: documents, refetch: refetchDocs } = useQuery({
    queryKey: ["client-documents", id],
    queryFn: async () => {
      const { data: docs } = await supabase
        .from("documents")
        .select("id, folder, file_name, file_path, created_at")
        .eq("client_id", id)
        .order("created_at", { ascending: false });
      return docs ?? [];
    },
  });

  const client = data?.client;

  return (
    <>
      <PageHeader
        title={client?.name ?? "Client"}
        description={client?.email ?? ""}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/clients">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />
      <div className="p-6">
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="companies">Companies</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-5 space-y-1">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Status
                  </div>
                  <Badge className="capitalize">{client?.status ?? "—"}</Badge>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 space-y-1">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Email
                  </div>
                  <div className="text-sm flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    {client?.email ?? "—"}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 space-y-1">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Phone
                  </div>
                  <div className="text-sm flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {client?.phone ?? "—"}
                  </div>
                </CardContent>
              </Card>
            </div>
            {client?.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Notes</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground whitespace-pre-line">
                  {client.notes}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="companies">
            <Card className="overflow-hidden">
              {data?.companies.length ? (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">Legal name</th>
                      <th className="text-left px-4 py-2.5 font-medium">Entity</th>
                      <th className="text-left px-4 py-2.5 font-medium">Industry</th>
                      <th className="text-left px-4 py-2.5 font-medium">EIN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.companies.map(
                      (co: {
                        id: string;
                        legal_name: string;
                        entity_type: string;
                        industry: string | null;
                        ein: string | null;
                      }) => (
                        <tr key={co.id} className="border-t hover:bg-muted/30">
                          <td className="px-4 py-2.5 font-medium">
                            <Link
                              to="/companies/$id"
                              params={{ id: co.id }}
                              className="hover:text-accent flex items-center gap-1.5"
                            >
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              {co.legal_name}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 uppercase text-xs">{co.entity_type}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {co.industry ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                            {co.ein ?? "—"}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              ) : (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No companies yet
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <Card className="p-4 space-y-4">
              <DocumentUpload clientId={id} onUploaded={() => refetchDocs()} />
              {!documents?.length ? (
                <div className="py-10 text-center text-sm text-muted-foreground">No documents</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {documents.map((d) => (
                      <tr key={d.id} className="border-t">
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

          <TabsContent value="invoices">
            <Card className="overflow-hidden">
              {!invoices?.length ? (
                <div className="p-10 text-center text-sm text-muted-foreground">No invoices</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">Invoice</th>
                      <th className="text-left px-4 py-2.5 font-medium">Company</th>
                      <th className="text-left px-4 py-2.5 font-medium">Date</th>
                      <th className="text-right px-4 py-2.5 font-medium">Total</th>
                      <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(
                      (inv: {
                        id: string;
                        invoice_number: string;
                        status: string;
                        total: number;
                        issue_date: string;
                        companies?: { legal_name: string } | null;
                      }) => (
                        <tr key={inv.id} className="border-t">
                          <td className="px-4 py-2.5 font-mono text-xs">{inv.invoice_number}</td>
                          <td className="px-4 py-2.5">{inv.companies?.legal_name}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {formatDate(inv.issue_date)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">
                            {currency(inv.total)}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge className="capitalize">{inv.status}</Badge>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="timeline">
            <ActivityTimeline clientId={id} limit={100} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
