import Stripe from "npm:stripe@23.0.0";

const API_VERSION = "2026-09-30.endive";

/** Restricted key only. A secret key is treated as not configured. */
export function createStripeClient(): Stripe | null {
  const key = Deno.env.get("STRIPE_RESTRICTED_KEY") ?? "";
  if (!key.startsWith("rk_")) return null;
  return new Stripe(key, { apiVersion: API_VERSION });
}

export function webhookSecret(): string | null {
  const secret = Deno.env.get("STRIPE_CREDIT_WEBHOOK_SECRET") ?? "";
  if (!secret.startsWith("whsec_")) return null;
  return secret;
}
