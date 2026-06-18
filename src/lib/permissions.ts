import type { AppRole } from "@/lib/use-current-user";

export function canViewCredentials(roles: AppRole[]) {
  const isInternal = roles.some((r) =>
    ["super_admin", "consultant", "assistant", "bookkeeper"].includes(r),
  );
  return isInternal && !roles.includes("bookkeeper");
}

export function canGenerateInvoices(roles: AppRole[]) {
  return roles.some((r) => ["super_admin", "consultant"].includes(r));
}

export function canAddTransactions(roles: AppRole[]) {
  return roles.some((r) => ["super_admin", "consultant", "assistant"].includes(r));
}

export function canViewInternalNotes(roles: AppRole[]) {
  return roles.some((r) => ["super_admin", "consultant", "assistant"].includes(r));
}
