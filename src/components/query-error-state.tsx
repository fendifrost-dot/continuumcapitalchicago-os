import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";

export function QueryErrorState({ message }: { message: string }) {
  return (
    <Card className="flex items-start gap-3 border-destructive/30 bg-destructive/5 p-4 text-sm">
      <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
      <div>
        <p className="font-medium text-destructive">Could not load data</p>
        <p className="mt-1 text-muted-foreground">{message}</p>
      </div>
    </Card>
  );
}
