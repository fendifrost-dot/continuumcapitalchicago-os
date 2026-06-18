import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { formatSupabaseError } from "@/lib/supabase-errors";

const folders = [
  "Formation",
  "Funding",
  "Tax",
  "Invoices",
  "Leases",
  "Contracts",
  "Compliance",
  "Other",
];

export function DocumentUpload({
  companyId,
  clientId,
  onUploaded,
}: {
  companyId?: string;
  clientId?: string;
  onUploaded?: () => void;
}) {
  const qc = useQueryClient();
  const [folder, setFolder] = useState("Other");
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!companyId && !clientId) {
      toast.error("Company or client required");
      return;
    }
    setUploading(true);
    const path = `${companyId ?? clientId}/${folder}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);
    if (uploadError) {
      toast.error(formatSupabaseError(uploadError.message));
      setUploading(false);
      return;
    }
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("documents")
      .insert({
        company_id: companyId ?? null,
        client_id: clientId ?? null,
        folder,
        file_name: file.name,
        file_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: user.user?.id,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(formatSupabaseError(error.message));
      setUploading(false);
      return;
    }
    await logActivity({
      action: "document_uploaded",
      summary: `Uploaded document: ${file.name}`,
      entityType: "document",
      entityId: data.id,
      companyId,
      clientId,
      metadata: { folder, file_name: file.name },
    });
    qc.invalidateQueries({ queryKey: ["documents"] });
    toast.success("Document uploaded");
    setUploading(false);
    onUploaded?.();
    e.target.value = "";
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label>Folder</Label>
        <Select value={folder} onValueChange={setFolder}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {folders.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Input
          type="file"
          id="doc-upload"
          className="hidden"
          onChange={handleUpload}
          disabled={uploading}
        />
        <Button asChild size="sm" disabled={uploading}>
          <label htmlFor="doc-upload" className="cursor-pointer">
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading…" : "Upload"}
          </label>
        </Button>
      </div>
    </div>
  );
}

export async function getDocumentUrl(filePath: string) {
  const { data } = await supabase.storage.from("documents").createSignedUrl(filePath, 3600);
  return data?.signedUrl;
}
