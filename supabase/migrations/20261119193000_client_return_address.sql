-- Certified dispute letters are mailed from the client, not from Continuum.
-- The client record holds the consumer mailing address. Preparing a quote
-- copies it onto the mailing so the envelope return address is auditable
-- even if the client record changes later.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS mailing_line1 TEXT,
  ADD COLUMN IF NOT EXISTS mailing_line2 TEXT,
  ADD COLUMN IF NOT EXISTS mailing_city TEXT,
  ADD COLUMN IF NOT EXISTS mailing_state TEXT,
  ADD COLUMN IF NOT EXISTS mailing_zip TEXT;

COMMENT ON COLUMN public.clients.mailing_line1 IS
  'Consumer mailing street. Dispute letters use this as the envelope return address.';
COMMENT ON COLUMN public.clients.mailing_city IS
  'Consumer mailing city.';
COMMENT ON COLUMN public.clients.mailing_state IS
  'Consumer mailing state. Two letters.';
COMMENT ON COLUMN public.clients.mailing_zip IS
  'Consumer mailing ZIP.';

ALTER TABLE public.credit_mailings
  ADD COLUMN IF NOT EXISTS return_name TEXT,
  ADD COLUMN IF NOT EXISTS return_line1 TEXT,
  ADD COLUMN IF NOT EXISTS return_line2 TEXT,
  ADD COLUMN IF NOT EXISTS return_city TEXT,
  ADD COLUMN IF NOT EXISTS return_state TEXT,
  ADD COLUMN IF NOT EXISTS return_zip TEXT;

COMMENT ON COLUMN public.credit_mailings.return_name IS
  'Client name copied at quote time. Lob from.name.';
COMMENT ON COLUMN public.credit_mailings.return_line1 IS
  'Client street copied at quote time. Lob from.address_line1.';

ALTER TABLE public.credit_mailings
  DROP CONSTRAINT IF EXISTS credit_mailings_return_address_chk;

-- Older rows may have no snapshot. A new snapshot is complete or absent.
ALTER TABLE public.credit_mailings
  ADD CONSTRAINT credit_mailings_return_address_chk CHECK (
    (
      return_name IS NULL
      AND return_line1 IS NULL
      AND return_line2 IS NULL
      AND return_city IS NULL
      AND return_state IS NULL
      AND return_zip IS NULL
    )
    OR (
      char_length(btrim(return_name)) >= 2
      AND char_length(btrim(return_line1)) >= 4
      AND char_length(btrim(return_city)) >= 2
      AND btrim(return_state) ~ '^[A-Z]{2}$'
      AND btrim(return_zip) ~ '^[0-9]{5}(-[0-9]{4})?$'
      AND (return_line2 IS NULL OR char_length(btrim(return_line2)) > 0)
    )
  );
