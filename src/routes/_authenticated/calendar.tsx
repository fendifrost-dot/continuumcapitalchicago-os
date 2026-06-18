import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompanySelect } from "@/components/company-select";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

const eventTypes = ["loan_payment", "follow_up", "renewal", "filing_deadline", "meeting", "other"];

function CalendarPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("other");
  const [startsAt, setStartsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["calendar-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("id, title, event_type, starts_at, company_id, companies(legal_name)")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleSave = async () => {
    if (!title.trim() || !startsAt) {
      toast.error("Title and date are required");
      return;
    }
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("calendar_events")
      .insert({
        company_id: companyId || null,
        title: title.trim(),
        event_type: eventType as "other",
        starts_at: new Date(startsAt).toISOString(),
        created_by: user.user?.id,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }
    await logActivity({
      action: "calendar_event_created",
      summary: `Scheduled: ${title}`,
      entityType: "calendar_event",
      entityId: data.id,
      companyId: companyId || undefined,
    });
    qc.invalidateQueries({ queryKey: ["calendar-events"] });
    toast.success("Event created");
    setSaving(false);
    setDialogOpen(false);
  };

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Deadlines, payments, renewals, follow-ups"
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> New event
          </Button>
        }
      />
      <div className="p-6">
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Due date</th>
                <th className="text-left px-4 py-2.5 font-medium">Title</th>
                <th className="text-left px-4 py-2.5 font-medium">Type</th>
                <th className="text-left px-4 py-2.5 font-medium">Company</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : !data?.length ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No upcoming events
                  </td>
                </tr>
              ) : (
                data.map(
                  (e: {
                    id: string;
                    title: string;
                    event_type: string;
                    starts_at: string;
                    companies?: { legal_name: string } | null;
                  }) => (
                    <tr key={e.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {formatDateTime(e.starts_at)}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{e.title}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className="capitalize">
                          {e.event_type.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {e.companies?.legal_name ?? "—"}
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New calendar event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Company (optional)</Label>
              <CompanySelect value={companyId} onChange={setCompanyId} />
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypes.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
