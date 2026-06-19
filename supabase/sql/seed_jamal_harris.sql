-- Run in Supabase SQL Editor (Lovable) — AFTER accounts_payments_secrets.sql
-- Test data: Jamal Harris (Buzz Genius Inc., Advisors List, Market Mingle)

-- =====================================================================
-- Seed / test data: Jamal Harris and his businesses
--   Buzz Genius Inc., Advisors List, Market Mingle
-- Each gets Melio / Stripe / Square account logins (encrypted placeholder
-- passwords) and a recurring owner-draw schedule that runs independent of
-- the business's income. Idempotent: safe to run more than once.
-- NOTE: passwords are placeholders ('Continuum#Setup2026') — update them
-- in the app once real logins are confirmed.
-- =====================================================================

-- Temporary helper: insert an account/login with an encrypted password.
CREATE OR REPLACE FUNCTION public._seed_account(
  _company UUID, _provider TEXT, _user TEXT, _url TEXT, _key TEXT, _pw TEXT
) RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, extensions
AS $fn$
DECLARE
  _label TEXT := _provider || ' – ' || (SELECT legal_name FROM public.companies WHERE id = _company);
BEGIN
  IF EXISTS (SELECT 1 FROM public.credentials WHERE company_id = _company AND label = _label) THEN
    RETURN;
  END IF;
  INSERT INTO public.credentials (
    company_id, label, category, provider, login_url, username, status,
    secret_ciphertext, has_secret
  )
  VALUES (
    _company, _label, 'payment', _provider, _url, _user, 'active',
    encode(pgp_sym_encrypt(_pw, _key), 'base64'), TRUE
  );
END
$fn$;

DO $seed$
DECLARE
  v_client_id   UUID;
  v_buzz_id     UUID;
  v_advisors_id UUID;
  v_mingle_id   UUID;
  v_key         TEXT;
  v_pw          TEXT := 'Continuum#Setup2026';
  v_next        DATE := (date_trunc('month', now())::date + INTERVAL '1 month')::date;
BEGIN
  SELECT key INTO v_key FROM public.app_secrets WHERE id = 1;

  -- ---- Client -------------------------------------------------------
  SELECT id INTO v_client_id FROM public.clients WHERE name = 'Jamal Harris' LIMIT 1;
  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (name, email, status, notes)
    VALUES (
      'Jamal Harris', '[email protected]', 'active',
      'Multi-entity owner. Historically paid himself cash from each business — moving to scheduled owner draws through Melio for clean records.'
    )
    RETURNING id INTO v_client_id;
  END IF;

  -- ---- Companies ----------------------------------------------------
  SELECT id INTO v_buzz_id FROM public.companies
    WHERE client_id = v_client_id AND legal_name = 'Buzz Genius Inc.' LIMIT 1;
  IF v_buzz_id IS NULL THEN
    INSERT INTO public.companies (client_id, legal_name, entity_type, industry, business_email)
    VALUES (v_client_id, 'Buzz Genius Inc.', 'c_corp', 'Marketing & Advertising', '[email protected]')
    RETURNING id INTO v_buzz_id;
  END IF;

  SELECT id INTO v_advisors_id FROM public.companies
    WHERE client_id = v_client_id AND legal_name = 'Advisors List' LIMIT 1;
  IF v_advisors_id IS NULL THEN
    INSERT INTO public.companies (client_id, legal_name, entity_type, industry, business_email)
    VALUES (v_client_id, 'Advisors List', 'llc', 'Business Consulting', '[email protected]')
    RETURNING id INTO v_advisors_id;
  END IF;

  SELECT id INTO v_mingle_id FROM public.companies
    WHERE client_id = v_client_id AND legal_name = 'Market Mingle' LIMIT 1;
  IF v_mingle_id IS NULL THEN
    INSERT INTO public.companies (client_id, legal_name, entity_type, industry, business_email)
    VALUES (v_client_id, 'Market Mingle', 'llc', 'Events & Networking', '[email protected]')
    RETURNING id INTO v_mingle_id;
  END IF;

  -- ---- Accounts / logins (Melio, Stripe, Square per company) --------
  PERFORM public._seed_account(v_buzz_id,     'Melio',  '[email protected]', 'https://app.melio.com',        v_key, v_pw);
  PERFORM public._seed_account(v_buzz_id,     'Stripe', '[email protected]', 'https://dashboard.stripe.com', v_key, v_pw);
  PERFORM public._seed_account(v_buzz_id,     'Square', '[email protected]', 'https://squareup.com/login',   v_key, v_pw);

  PERFORM public._seed_account(v_advisors_id, 'Melio',  '[email protected]', 'https://app.melio.com',        v_key, v_pw);
  PERFORM public._seed_account(v_advisors_id, 'Stripe', '[email protected]', 'https://dashboard.stripe.com', v_key, v_pw);
  PERFORM public._seed_account(v_advisors_id, 'Square', '[email protected]', 'https://squareup.com/login',   v_key, v_pw);

  PERFORM public._seed_account(v_mingle_id,   'Melio',  '[email protected]', 'https://app.melio.com',        v_key, v_pw);
  PERFORM public._seed_account(v_mingle_id,   'Stripe', '[email protected]', 'https://dashboard.stripe.com', v_key, v_pw);
  PERFORM public._seed_account(v_mingle_id,   'Square', '[email protected]', 'https://squareup.com/login',   v_key, v_pw);

  -- ---- Owner-draw payment schedules (income-independent) ------------
  IF NOT EXISTS (SELECT 1 FROM public.payment_schedules WHERE company_id = v_buzz_id AND name = 'Owner draw') THEN
    INSERT INTO public.payment_schedules (company_id, name, payee, amount, frequency, method, category, next_run_date, memo)
    VALUES (v_buzz_id, 'Owner draw', 'Jamal Harris', 2500.00, 'monthly', 'Melio ACH', 'owner_draw', v_next, 'Fixed monthly owner compensation — independent of revenue');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_schedules WHERE company_id = v_advisors_id AND name = 'Owner draw') THEN
    INSERT INTO public.payment_schedules (company_id, name, payee, amount, frequency, method, category, next_run_date, memo)
    VALUES (v_advisors_id, 'Owner draw', 'Jamal Harris', 1500.00, 'monthly', 'Melio ACH', 'owner_draw', v_next, 'Fixed monthly owner compensation — independent of revenue');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_schedules WHERE company_id = v_mingle_id AND name = 'Owner draw') THEN
    INSERT INTO public.payment_schedules (company_id, name, payee, amount, frequency, method, category, next_run_date, memo)
    VALUES (v_mingle_id, 'Owner draw', 'Jamal Harris', 1500.00, 'monthly', 'Melio ACH', 'owner_draw', v_next, 'Fixed monthly owner compensation — independent of revenue');
  END IF;
END
$seed$;

-- Drop the temporary helper used above.
DROP FUNCTION IF EXISTS public._seed_account(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
