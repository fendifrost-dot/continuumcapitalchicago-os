import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, Phone, Building2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

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
        supabase.from("companies").select("id, legal_name, entity_type, industry, ein").eq("client_id", id),
      ]);
      return { client: client.data, companies: companies.data ?? [] };
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
            <Link to="/clients"><ArrowLeft className="h-4 w-4" /> Back</Link>
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
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Status</div>
                  <Badge className="capitalize">{client?.status ?? "—"}</Badge>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 space-y-1">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Email</div>
                  <div className="text-sm flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{client?.email ?? "—"}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 space-y-1">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Phone</div>
                  <div className="text-sm flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{client?.phone ?? "—"}</div>
                </CardContent>
              </Card>
            </div>
            {client?.notes && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground whitespace-pre-line">{client.notes}</CardContent>
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
                    {data.companies.map((co: any) => (
                      <tr key={co.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-medium">
                          <Link to="/companies/$id" params={{ id: co.id }} className="hover:text-accent flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />{co.legal_name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 uppercase text-xs">{co.entity_type}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{co.industry ?? "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{co.ein ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-10 text-center text-sm text-muted-foreground">No companies yet</div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="documents"><EmptyTab message="Documents tab coming soon" /></TabsContent>
          <TabsContent value="invoices"><EmptyTab message="Invoices tab coming soon" /></TabsContent>
          <TabsContent value="timeline"><EmptyTab message="Timeline tab coming soon" /></TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function EmptyTab({ message }: { message: string }) {
  return <Card className="p-10 text-center text-sm text-muted-foreground">{message}</Card>;
}