import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/lib/use-current-user";

export function WorkspaceBadge() {
  const { data: user } = useCurrentUser();
  if (!user) return null;

  if (user.isInternal) {
    return (
      <Badge className="hidden sm:inline-flex bg-sidebar-primary/15 text-sidebar-primary border-sidebar-primary/30 hover:bg-sidebar-primary/15">
        Operations
      </Badge>
    );
  }

  if (user.isClient) {
    return (
      <Badge variant="secondary" className="hidden sm:inline-flex">
        Client portal
      </Badge>
    );
  }

  return null;
}
