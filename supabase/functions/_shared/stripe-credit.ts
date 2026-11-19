import Stripe from "npm:stripe@23.0.0";

import { classifyStripeKey } from "./credit-mail-policy.ts";

const API_VERSION = "2026-09-30.endive";

function stripeKey(): string {
  return Deno.env.get("STRIPE_RESTRICTED_KEY") ?? "";
}

/** Restricted key only. A secret key is treated as not configured. */
export function createStripeClient(): Stripe | null {
  const key = stripeKey();
  if (!key.startsWith("rk_")) return null;
  return new Stripe(key, { apiVersion: API_VERSION });
}

/**
 * Webhook client. Accepts a restricted key, or a test secret key so a sandbox
 * PaymentIntent can be confirmed. A live secret key is ignored.
 */
export function createWebhookStripeClient(): Stripe | null {
  const key = stripeKey();
  if (key.startsWith("rk_") || classifyStripeKey(key) === "test") {
    return new Stripe(key, { apiVersion: API_VERSION });
  }
  return null;
}

/** Sandbox payments. Refuses unless the key in use is sk_test_ or rk_test_. */
export function createSandboxStripeClient(): Stripe | null {
  const key = stripeKey();
  if (classifyStripeKey(key) !== "test") return null;
  return new Stripe(key, { apiVersion: API_VERSION });
}

export function webhookSecret(): string | null {
  const secret = Deno.env.get("STRIPE_CREDIT_WEBHOOK_SECRET") ?? "";
  if (!secret.startsWith("whsec_")) return null;
  return secret;
}
