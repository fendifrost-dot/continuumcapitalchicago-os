import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export function CompanySelect({
  value,
  onChange,
  clientId,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  clientId?: string;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["companies-select", clientId],
    queryFn: async () => {
      let q = supabase
        .from("companies")
        .select("id, legal_name, client_id, clients(name)")
        .order("legal_name");
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select company" />
      </SelectTrigger>
      <SelectContent>
        {(data ?? []).map(
          (c: { id: string; legal_name: string; clients?: { name: string } | null }) => (
            <SelectItem key={c.id} value={c.id}>
              {c.legal_name}
              {c.clients?.name ? ` (${c.clients.name})` : ""}
            </SelectItem>
          ),
        )}
      </SelectContent>
    </Select>
  );
}
