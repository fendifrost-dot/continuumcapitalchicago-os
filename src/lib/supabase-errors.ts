/** User-friendly message when Supabase RLS or permissions block an action. */
export function formatSupabaseError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("row-level security") || lower.includes("policy")) {
    return "Permission denied. Your account may not have the required staff role in Supabase yet.";
  }
  if (lower.includes("jwt") || lower.includes("not authenticated")) {
    return "Session expired. Please sign in again.";
  }
  return message;
}
