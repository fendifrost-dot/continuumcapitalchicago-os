/** Firm staff — always treated as internal operators, not clients. */
export const OWNER_EMAILS = ["info@continuumcapitalchicago.com"] as const;

export const INTERNAL_EMAIL_DOMAINS = ["continuumcapitalchicago.com"] as const;

export function isInternalEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  if (OWNER_EMAILS.includes(lower as (typeof OWNER_EMAILS)[number])) return true;
  return INTERNAL_EMAIL_DOMAINS.some((d) => lower.endsWith(`@${d}`));
}

export const INTERNAL_ONLY_PATHS = ["/clients", "/transactions", "/activity", "/loans"] as const;

export function isInternalOnlyPath(path: string): boolean {
  return INTERNAL_ONLY_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}
