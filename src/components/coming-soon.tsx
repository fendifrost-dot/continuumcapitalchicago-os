import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="p-6">
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Construction className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold">Module scaffolded</h3>
          <p className="max-w-md text-sm text-muted-foreground px-4">
            The data layer, permissions, and navigation for this module are ready. Full UI ships in
            the next iteration.
          </p>
        </Card>
      </div>
    </>
  );
}
