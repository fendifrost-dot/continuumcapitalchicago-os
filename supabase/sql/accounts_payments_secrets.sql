-- Run in Supabase SQL Editor (Lovable)
-- Accounts & Logins (encrypted passwords) + Payment Schedules

-- =====================================================================
-- Continuum Capital OS — Accounts & Logins (encrypted) + Payment Schedules
-- =====================================================================
-- Adds:
--   * Encrypted, revealable secrets on credentials (pgcrypto, DB-held key)
--   * Account/login fields on credentials (login_url, username, status)
--   * Client read access to their own companies' credentials
--   * payment_schedules table for recurring owner-draw / payout tracking
-- Money is never moved by this system — schedules only record + remind.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- Encryption key (random per deployment, never in source control)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_secrets (
  id INT PRIMARY KEY DEFAULT 1,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_secrets_single_row CHECK (id = 1)
);
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_secrets FROM PUBLIC, anon, authenticated;
-- No RLS policies → only SECURITY DEFINER functions (running as owner) can read.

INSERT INTO public.app_secrets (id, key)
VALUES (1, encode(extensions.gen_random_bytes(32), 'base64'))
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Account / login fields on credentials
-- ---------------------------------------------------------------------
ALTER TYPE public.credential_category ADD VALUE IF NOT EXISTS 'payment';

ALTER TABLE public.credentials
  ADD COLUMN IF NOT EXISTS login_url TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS account_identifier TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS secret_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS has_secret BOOLEAN NOT NULL DEFAULT FALSE;

-- vault_reference was previously required by app code; make it optional now
ALTER TABLE public.credentials ALTER COLUMN vault_reference DROP NOT NULL;

-- ---------------------------------------------------------------------
-- Let portal clients READ credentials for companies they're linked to.
-- (Existing internal-non-bookkeeper SELECT policy stays; policies are OR'd.)
-- Plaintext is never exposed here — only opaque ciphertext + reveal RPC.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Clients read own company credentials" ON public.credentials;
CREATE POLICY "Clients read own company credentials" ON public.credentials
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.companies c
      JOIN public.client_portal_users cpu ON cpu.client_id = c.client_id
      WHERE c.id = credentials.company_id
        AND cpu.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Encrypt / decrypt RPCs (access-checked, key never leaves the database)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_credential_secret(_credential_id UUID, _plaintext TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  k TEXT;
  cid UUID;
BEGIN
  SELECT company_id INTO cid FROM public.credentials WHERE id = _credential_id;
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Credential not found';
  END IF;
  -- Only internal staff (excluding bookkeepers) may set/clear secrets.
  IF NOT (public.is_internal(auth.uid()) AND NOT public.has_role(auth.uid(), 'bookkeeper')) THEN
    RAISE EXCEPTION 'Not authorized to set credential secrets';
  END IF;

  IF _plaintext IS NULL OR length(_plaintext) = 0 THEN
    UPDATE public.credentials
      SET secret_ciphertext = NULL, has_secret = FALSE, last_updated_at = now()
      WHERE id = _credential_id;
    RETURN;
  END IF;

  SELECT key INTO k FROM public.app_secrets WHERE id = 1;
  UPDATE public.credentials
    SET secret_ciphertext = encode(pgp_sym_encrypt(_plaintext, k), 'base64'),
        has_secret = TRUE,
        last_updated_at = now()
    WHERE id = _credential_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reveal_credential_secret(_credential_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  k TEXT;
  ct TEXT;
  cid UUID;
BEGIN
  SELECT company_id, secret_ciphertext INTO cid, ct
    FROM public.credentials WHERE id = _credential_id;
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Credential not found';
  END IF;
  -- Staff (not bookkeepers) OR a portal client linked to the company may reveal.
  IF public.has_role(auth.uid(), 'bookkeeper') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT public.user_can_access_company(auth.uid(), cid) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF ct IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT key INTO k FROM public.app_secrets WHERE id = 1;
  RETURN pgp_sym_decrypt(decode(ct, 'base64'), k);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_credential_secret(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reveal_credential_secret(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_credential_secret(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_credential_secret(UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- Payment schedules (recurring owner-draw / payouts, income-independent)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.schedule_frequency AS ENUM
    ('weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  payee TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  frequency public.schedule_frequency NOT NULL DEFAULT 'monthly',
  method TEXT,                                   -- e.g. 'Melio ACH', 'Square', 'Stripe payout'
  credential_id UUID REFERENCES public.credentials(id) ON DELETE SET NULL,
  category public.transaction_category NOT NULL DEFAULT 'owner_draw',
  next_run_date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  auto_post BOOLEAN NOT NULL DEFAULT FALSE,
  memo TEXT,
  last_posted_on DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_schedules TO authenticated;
GRANT ALL ON public.payment_schedules TO service_role;
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS payment_schedules_company_idx ON public.payment_schedules(company_id);
CREATE INDEX IF NOT EXISTS payment_schedules_next_run_idx ON public.payment_schedules(next_run_date);

DROP POLICY IF EXISTS "View payment schedules" ON public.payment_schedules;
CREATE POLICY "View payment schedules" ON public.payment_schedules FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));
DROP POLICY IF EXISTS "Internal manage payment schedules" ON public.payment_schedules;
CREATE POLICY "Internal manage payment schedules" ON public.payment_schedules FOR ALL TO authenticated
  USING (public.is_internal(auth.uid())) WITH CHECK (public.is_internal(auth.uid()));

DROP TRIGGER IF EXISTS tg_payment_schedules_updated ON public.payment_schedules;
CREATE TRIGGER tg_payment_schedules_updated BEFORE UPDATE ON public.payment_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Extend central audit logging to cover payment_schedules
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action TEXT;
  v_summary TEXT;
  v_entity_type TEXT;
  v_entity_id UUID;
  v_company_id UUID;
  v_client_id UUID;
  v_actor_id UUID;
  v_actor_name TEXT;
  v_metadata JSONB;
BEGIN
  v_entity_type := TG_TABLE_NAME;
  v_actor_id := auth.uid();
  IF v_actor_id IS NOT NULL THEN
    SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_actor_id;
  END IF;
  v_actor_name := COALESCE(v_actor_name, 'System');
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_entity_id := NEW.id;
    v_summary := 'Created ' || TG_TABLE_NAME || ' record';
    v_metadata := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'updated';
    v_entity_id := NEW.id;
    v_summary := 'Updated ' || TG_TABLE_NAME || ' record';
    v_metadata := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_entity_id := OLD.id;
    v_summary := 'Deleted ' || TG_TABLE_NAME || ' record';
    v_metadata := to_jsonb(OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'clients' THEN
      v_client_id := OLD.id;
    ELSIF TG_TABLE_NAME = 'companies' THEN
      v_company_id := OLD.id;
      v_client_id := OLD.client_id;
    ELSIF TG_TABLE_NAME IN ('transactions','invoices','credentials','funding_applications','loans','calendar_events','documents','payment_schedules') THEN
      v_company_id := OLD.company_id;
    ELSIF TG_TABLE_NAME = 'invoice_items' THEN
      SELECT i.company_id INTO v_company_id FROM public.invoices i WHERE i.id = OLD.invoice_id;
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'clients' THEN
      v_client_id := NEW.id;
    ELSIF TG_TABLE_NAME = 'companies' THEN
      v_company_id := NEW.id;
      v_client_id := NEW.client_id;
    ELSIF TG_TABLE_NAME IN ('transactions','invoices','credentials','funding_applications','loans','calendar_events','documents','payment_schedules') THEN
      v_company_id := NEW.company_id;
    ELSIF TG_TABLE_NAME = 'invoice_items' THEN
      SELECT i.company_id INTO v_company_id FROM public.invoices i WHERE i.id = NEW.invoice_id;
    END IF;
  END IF;
  -- never persist plaintext/ciphertext secrets into the audit log
  IF TG_TABLE_NAME = 'credentials' AND v_metadata IS NOT NULL THEN
    v_metadata := v_metadata #- '{secret_ciphertext}' #- '{new,secret_ciphertext}' #- '{old,secret_ciphertext}';
  END IF;
  INSERT INTO public.activity_logs (actor_id, actor_name, action, entity_type, entity_id, company_id, client_id, summary, metadata)
  VALUES (v_actor_id, v_actor_name, v_action, v_entity_type, v_entity_id, v_company_id, v_client_id, v_summary, v_metadata);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_log_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_payment_schedules ON public.payment_schedules;
CREATE TRIGGER audit_payment_schedules
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_schedules
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_mutation();
