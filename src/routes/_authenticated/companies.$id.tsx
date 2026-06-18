import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Upload, Mail, Phone, MapPin, Globe } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";

export const Route = createFileRoute("/_authenticated/companies/$id")({
  component: CompanyDetail,
});

function CompanyDetail() {
  const { id } = Route.useParams();
  const { data: user } = useCurrentUser();
  const canSeeCredentials = user?.isInternal && !user.roles.includes("bookkeeper");

  const { data: company } = useQuery({
    queryKey: ["company", id],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("*, clients(name)").eq("id", id).maybeSingle();
      return data;
    },
  });

  return (
    <>
      <PageHeader
        title={company?.legal_name ?? "Company"}
        description={company?.clients?.name ? `Client: ${company.clients.name}` : ""}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/companies"><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
        }
      />
      <div className="p-6">
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {canSeeCredentials && <TabsTrigger value="credentials">Credentials</TabsTrigger>}
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="funding">Funding</TabsTrigger>
            <TabsTrigger value="loans">Loans</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <InfoCard label="Entity type" value={(company?.entity_type ?? "—").toString().toUpperCase()} />
              <InfoCard label="EIN" value={company?.ein ?? "—"} mono />
              <InfoCard label="Industry" value={company?.industry ?? "—"} />
              <InfoCard label="Business email" value={company?.business_email ?? "—"} icon={Mail} />
              <InfoCard label="Business phone" value={company?.business_phone ?? "—"} icon={Phone} />
              <InfoCard label="Website" value={company?.website ?? "—"} icon={Globe} />
              <Card className="md:col-span-2">
                <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Address</CardTitle></CardHeader>
                <CardContent className="text-sm flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    {company?.address_line1 ? (
                      <>
                        <div>{company.address_line1}</div>
                        {company.address_line2 && <div>{company.address_line2}</div>}
                        <div className="text-muted-foreground">
                          {[company.city, company.state, company.postal_code].filter(Boolean).join(", ")}
                        </div>
                      </>
                    ) : "—"}
                  </div>
                </CardContent>
              </Card>
              <InfoCard label="Office lease" value={company?.lease_status ?? "—"} />
            </div>

            <Card>
              <CardHeader className="border-b"><CardTitle className="text-sm font-semibold">Quick actions</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2 p-4">
                <Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Add transaction</Button>
                <Button size="sm" variant="outline"><Upload className="h-4 w-4" /> Upload document</Button>
                <Button size="sm" variant="outline"><Plus className="h-4 w-4" /> New funding application</Button>
                <Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Add loan account</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {canSeeCredentials && (
            <TabsContent value="credentials">
              <Card className="p-4">
                <div className="text-sm text-muted-foreground mb-3">
                  Metadata only — passwords are stored in your external vault. Click "Open vault" to retrieve.
                </div>
                <CredentialsList companyId={id} />
              </Card>
            </TabsContent>
          )}

          <TabsContent value="transactions"><EmptyTab message="Transactions for this company appear here." /></TabsContent>
          <TabsContent value="funding"><EmptyTab message="Funding applications appear here." /></TabsContent>
          <TabsContent value="loans"><EmptyTab message="Loan accounts appear here." /></TabsContent>
          <TabsContent value="calendar"><EmptyTab message="Calendar events appear here." /></TabsContent>
          <TabsContent value="documents"><EmptyTab message="Documents appear here." /></TabsContent>
          <TabsContent value="audit"><EmptyTab message="Full audit trail appears here." /></TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function InfoCard({ label, value, icon: Icon, mono }: { label: string; value: string; icon?: any; mono?: boolean }) {
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

  if (!data?.length) return <div className="py-10 text-center text-sm text-muted-foreground">No credentials yet</div>;

  return (
    <table className="w-full text-sm">
      <thead className="text-xs uppercase tracking-wider text-muted-foreground">
        <tr className="border-b">
          <th className="text-left px-2 py-2 font-medium">Label</th>
          <th className="text-left px-2 py-2 font-medium">Category</th>
          <th className="text-left px-2 py-2 font-medium">Provider</th>
          <th className="text-left px-2 py-2 font-medium">Updated</th>
          <th className="text-right px-2 py-2 font-medium">Vault</th>
        </tr>
      </thead>
      <tbody>
        {data.map((c: any) => (
          <tr key={c.id} className="border-b last:border-0">
            <td className="px-2 py-2.5 font-medium">{c.label}</td>
            <td className="px-2 py-2.5"><Badge variant="secondary" className="capitalize">{c.category}</Badge></td>
            <td className="px-2 py-2.5 text-muted-foreground">{c.provider ?? "—"}</td>
            <td className="px-2 py-2.5 text-xs text-muted-foreground">{new Date(c.last_updated_at).toLocaleDateString()}</td>
            <td className="px-2 py-2.5 text-right">
              <Button size="sm" variant="outline" className="h-7 text-xs">Open vault</Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyTab({ message }: { message: string }) {
  return <Card className="p-10 text-center text-sm text-muted-foreground">{message}</Card>;
}