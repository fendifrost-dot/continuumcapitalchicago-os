import { classifyLobKey, classifyStripeKey, type RailMode } from "./credit-mail-policy.ts";

/** Modes only. The key strings are not returned. */
export function sandboxKeyModes(): { stripe: RailMode; lob: RailMode } {
  return {
    stripe: classifyStripeKey(Deno.env.get("STRIPE_RESTRICTED_KEY") ?? ""),
    lob: classifyLobKey(Deno.env.get("LOB_API_KEY") ?? ""),
  };
}
