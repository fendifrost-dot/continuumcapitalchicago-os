import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { ActivityTimeline } from "@/components/activity-timeline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompanySelect } from "@/components/company-select";

export const Route = createFileRoute("/_authenticated/activity")({
  component: ActivityPage,
});

function ActivityPage() {
  const [companyId, setCompanyId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  return (
    <>
      <PageHeader
        title="Activity Feed"
        description="Chronological timeline of every auditable event"
      />
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1.5 min-w-[200px]">
            <Label>Filter by company</Label>
            <CompanySelect value={companyId} onChange={setCompanyId} className="w-full" />
          </div>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-40"
            />
          </div>
        </div>
        <ActivityTimeline companyId={companyId || undefined} limit={100} />
      </div>
    </>
  );
}
