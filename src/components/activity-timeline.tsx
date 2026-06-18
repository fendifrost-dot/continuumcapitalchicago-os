import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";

export function ActivityTimeline({
  companyId,
  clientId,
  limit = 50,
}: {
  companyId?: string;
  clientId?: string;
  limit?: number;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["activity-timeline", companyId, clientId, limit],
    queryFn: async () => {
      let q = supabase
        .from("activity_logs")
        .select("id, action, summary, actor_name, entity_type, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (companyId) q = q.eq("company_id", companyId);
      else if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">Loading timeline…</Card>
    );
  }

  if (!data?.length) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">No activity yet</Card>;
  }

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y">
        {data.map((a) => (
          <li key={a.id} className="px-4 py-3.5 flex gap-3">
            <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
            <div className="flex-1 min-w-0">
              <div className="text-sm">{a.summary}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{a.actor_name ?? "System"}</span>
                <span>·</span>
                <span>{formatDateTime(a.created_at)}</span>
                {a.entity_type && (
                  <Badge variant="outline" className="text-[10px] h-5">
                    {a.entity_type}
                  </Badge>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
