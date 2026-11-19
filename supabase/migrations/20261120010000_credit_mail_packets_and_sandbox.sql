-- Packet PDFs for certified dispute letters, and a flag for staff sandbox sends.
-- Apply in the Lovable SQL editor. The app does not apply this file itself.
--
-- credit-mail-packets is private. Internal staff may upload. Clients have no
-- policy on the bucket. The service role reads the object to sign a short URL
-- for Lob. Lob address placement is top_first_page (not insert_blank_page):
-- page 1 of a packet leaves the top blank, and postage follows the PDF page
-- count. An inserted blank page would add a billed sheet.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'credit-mail-packets',
  'credit-mail-packets',
  false,
  20971520,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Staff read credit mail packets" ON storage.objects;
CREATE POLICY "Staff read credit mail packets"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'credit-mail-packets' AND public.is_internal(auth.uid()));

DROP POLICY IF EXISTS "Staff insert credit mail packets" ON storage.objects;
CREATE POLICY "Staff insert credit mail packets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'credit-mail-packets' AND public.is_internal(auth.uid()));

DROP POLICY IF EXISTS "Staff update credit mail packets" ON storage.objects;
CREATE POLICY "Staff update credit mail packets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'credit-mail-packets' AND public.is_internal(auth.uid()))
  WITH CHECK (bucket_id = 'credit-mail-packets' AND public.is_internal(auth.uid()));

DROP POLICY IF EXISTS "Staff delete credit mail packets" ON storage.objects;
CREATE POLICY "Staff delete credit mail packets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'credit-mail-packets' AND public.is_internal(auth.uid()));

ALTER TABLE public.credit_mailings
  ADD COLUMN IF NOT EXISTS packet_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.credit_mailings.packet_storage_path IS
  'Object path in the private credit-mail-packets bucket. Null when the letter is inline HTML.';
COMMENT ON COLUMN public.credit_mailings.is_test IS
  'Staff sandbox send. Hidden from client reads. The live prepare path never sets this.';

ALTER TABLE public.credit_mailings
  DROP CONSTRAINT IF EXISTS credit_mailings_packet_path_chk;
ALTER TABLE public.credit_mailings
  ADD CONSTRAINT credit_mailings_packet_path_chk CHECK (
    packet_storage_path IS NULL
    OR (
      char_length(packet_storage_path) > 8
      AND packet_storage_path !~ '\.\.'
      AND packet_storage_path !~ '^\s'
      AND packet_storage_path ~ '\.pdf$'
    )
  );

-- Table-level SELECT would still expose a new column. Grant every client-visible
-- column and leave packet_storage_path to the service role.
REVOKE ALL ON public.credit_mailings FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id,
  client_id,
  recipient_name,
  recipient_line1,
  recipient_line2,
  recipient_city,
  recipient_state,
  recipient_zip,
  return_name,
  return_line1,
  return_line2,
  return_city,
  return_state,
  return_zip,
  page_count,
  postage_cents,
  certified_cents,
  electronic_receipt_cents,
  handling_fee_cents,
  total_cents,
  status,
  customer_sentence,
  mailed_on,
  tracking_number,
  delivered_on,
  response_due_on,
  proof_on_file,
  created_at,
  updated_at,
  is_test
) ON public.credit_mailings TO authenticated;

ALTER TABLE public.credit_mail_audit
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.credit_mail_audit.is_test IS
  'True for a staff sandbox action. A live client confirmation writes false.';

ALTER TABLE public.credit_mailing_fulfillment
  ALTER COLUMN letter_html DROP NOT NULL;

ALTER TABLE public.credit_mailing_fulfillment
  DROP CONSTRAINT IF EXISTS credit_mailing_fulfillment_letter_html_chk;
ALTER TABLE public.credit_mailing_fulfillment
  ADD CONSTRAINT credit_mailing_fulfillment_letter_html_chk CHECK (
    letter_html IS NULL OR char_length(btrim(letter_html)) >= 20
  );

COMMENT ON COLUMN public.credit_mailing_fulfillment.letter_html IS
  'Inline letter HTML. Null when the mailing is only a packet PDF.';

DROP POLICY IF EXISTS "Read own credit mailings" ON public.credit_mailings;
CREATE POLICY "Read own credit mailings"
  ON public.credit_mailings FOR SELECT TO authenticated
  USING (
    is_test = FALSE
    AND public.user_can_access_client(auth.uid(), client_id)
  );
