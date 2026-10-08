-- Published customer credit file. This is a copy for one Continuum OS client.
-- It is not a live query of the Credit Guardian ledger. Drafts and raw_line
-- are not columns on these tables.

CREATE TABLE public.credit_file_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  status_sentence TEXT NOT NULL,
  next_date DATE,
  waiting_on TEXT NOT NULL CHECK (waiting_on IN ('bureau', 'furnisher', 'you')),
  waiting_on_name TEXT,
  needs_from_you TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.credit_mailings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  recipient_line1 TEXT NOT NULL,
  recipient_line2 TEXT,
  recipient_city TEXT NOT NULL,
  recipient_state TEXT NOT NULL,
  recipient_zip TEXT NOT NULL,
  page_count INTEGER NOT NULL CHECK (page_count BETWEEN 1 AND 6),
  postage_cents INTEGER NOT NULL CHECK (postage_cents >= 0),
  certified_cents INTEGER NOT NULL CHECK (certified_cents >= 0),
  electronic_receipt_cents INTEGER NOT NULL CHECK (electronic_receipt_cents >= 0),
  handling_fee_cents INTEGER NOT NULL CHECK (handling_fee_cents = 500),
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'awaiting_payment', 'paid', 'printing', 'in_transit', 'delivered', 'payment_failed', 'cancelled'
  )),
  customer_sentence TEXT NOT NULL DEFAULT '',
  mailed_on DATE,
  tracking_number TEXT,
  delivered_on DATE,
  response_due_on DATE,
  proof_on_file BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_mailings_total_chk CHECK (
    total_cents = postage_cents + certified_cents + electronic_receipt_cents + handling_fee_cents
  )
);

CREATE INDEX credit_mailings_client_idx ON public.credit_mailings(client_id, created_at DESC);

-- Brand and last4 only. Payment method ids live in credit_billing_vault.
CREATE TABLE public.credit_saved_cards (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  brand TEXT,
  last4 TEXT,
  exp_month INTEGER,
  exp_year INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.credit_mail_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailing_id UUID REFERENCES public.credit_mailings(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  actor_id UUID,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX credit_mail_audit_client_idx ON public.credit_mail_audit(client_id, created_at DESC);

-- Server only. No grant to the browser roles.
CREATE TABLE public.credit_billing_vault (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  stripe_payment_method_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.credit_mailing_fulfillment (
  mailing_id UUID PRIMARY KEY REFERENCES public.credit_mailings(id) ON DELETE CASCADE,
  letter_html TEXT NOT NULL,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  lob_letter_id TEXT,
  lob_proof_url TEXT,
  lob_submitted_at TIMESTAMPTZ,
  released_by UUID,
  invoice_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.credit_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.credit_file_publications TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.credit_file_publications TO authenticated;
GRANT SELECT ON public.credit_mailings TO authenticated;
GRANT SELECT ON public.credit_saved_cards TO authenticated;
GRANT SELECT ON public.credit_mail_audit TO authenticated;
GRANT ALL ON public.credit_file_publications TO service_role;
GRANT ALL ON public.credit_mailings TO service_role;
GRANT ALL ON public.credit_saved_cards TO service_role;
GRANT ALL ON public.credit_mail_audit TO service_role;
GRANT ALL ON public.credit_billing_vault TO service_role;
GRANT ALL ON public.credit_mailing_fulfillment TO service_role;
GRANT ALL ON public.credit_webhook_events TO service_role;

REVOKE ALL ON public.credit_billing_vault FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.credit_mailing_fulfillment FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.credit_webhook_events FROM PUBLIC, anon, authenticated;

ALTER TABLE public.credit_file_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_mailings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_saved_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_mail_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_billing_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_mailing_fulfillment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_webhook_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.credit_billing_vault FORCE ROW LEVEL SECURITY;
ALTER TABLE public.credit_mailing_fulfillment FORCE ROW LEVEL SECURITY;
ALTER TABLE public.credit_webhook_events FORCE ROW LEVEL SECURITY;

CREATE POLICY "Read own published credit file"
  ON public.credit_file_publications FOR SELECT TO authenticated
  USING (public.user_can_access_client(auth.uid(), client_id));

CREATE POLICY "Staff publish credit file"
  ON public.credit_file_publications FOR ALL TO authenticated
  USING (public.is_internal(auth.uid()))
  WITH CHECK (public.is_internal(auth.uid()));

CREATE POLICY "Read own credit mailings"
  ON public.credit_mailings FOR SELECT TO authenticated
  USING (public.user_can_access_client(auth.uid(), client_id));

CREATE POLICY "Staff read all credit mailings"
  ON public.credit_mailings FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));

CREATE POLICY "Read own saved card display"
  ON public.credit_saved_cards FOR SELECT TO authenticated
  USING (public.user_can_access_client(auth.uid(), client_id));

CREATE POLICY "Staff read credit mail audit"
  ON public.credit_mail_audit FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()));

-- No policies on the vault, fulfillment, or webhook tables. Authenticated
-- and anon have no grant. Service role bypasses row security.

CREATE TRIGGER credit_file_publications_updated
  BEFORE UPDATE ON public.credit_file_publications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER credit_mailings_updated
  BEFORE UPDATE ON public.credit_mailings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER credit_saved_cards_updated
  BEFORE UPDATE ON public.credit_saved_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
