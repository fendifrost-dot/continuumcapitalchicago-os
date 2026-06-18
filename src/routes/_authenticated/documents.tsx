import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentUpload, getDocumentUrl } from "@/components/document-upload";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";

export const Route = createFileRoute("/_authenticated/documents")({
  component: DocumentsPage,
});

function DocumentsPage() {
  const { data: user } = useCurrentUser();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select(
          "id, folder, file_name, file_path, mime_type, size_bytes, created_at, company_id, companies(legal_name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleDownload = async (filePath: string) => {
    const url = await getDocumentUrl(filePath);
    if (url) window.open(url, "_blank");
  };

  return (
    <>
      <PageHeader
        title="Documents"
        description={
          user?.isClient
            ? "Your uploaded files and records"
            : "Formation, funding, tax, invoices, contracts, leases, compliance"
        }
      />
      <div className="p-6 space-y-4">
        {user?.isInternal && <DocumentUpload onUploaded={() => refetch()} />}
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">File</th>
                <th className="text-left px-4 py-2.5 font-medium">Folder</th>
                <th className="text-left px-4 py-2.5 font-medium">Company</th>
                <th className="text-left px-4 py-2.5 font-medium">Uploaded</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : !data?.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No documents yet
                  </td>
                </tr>
              ) : (
                data.map(
                  (d: {
                    id: string;
                    folder: string;
                    file_name: string;
                    file_path: string;
                    created_at: string;
                    company_id: string | null;
                    companies?: { legal_name: string } | null;
                  }) => (
                    <tr key={d.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{d.file_name}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary">{d.folder}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {d.company_id ? (
                          <Link
                            to="/companies/$id"
                            params={{ id: d.company_id }}
                            className="hover:text-accent"
                          >
                            {d.companies?.legal_name ?? "—"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {formatDateTime(d.created_at)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleDownload(d.file_path)}
                        >
                          Download
                        </Button>
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
