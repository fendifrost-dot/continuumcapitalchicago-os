import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout for /companies and /companies/$id. The list is companies.index.tsx.
// A child route only mounts where this renders <Outlet />.
export const Route = createFileRoute("/_authenticated/companies")({
  component: Outlet,
});
