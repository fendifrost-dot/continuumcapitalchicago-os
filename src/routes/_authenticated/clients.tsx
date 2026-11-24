import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout for /clients and /clients/$id. The list is clients.index.tsx.
// A child route only mounts where this renders <Outlet />.
export const Route = createFileRoute("/_authenticated/clients")({
  component: Outlet,
});
