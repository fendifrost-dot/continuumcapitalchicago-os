-- M3: Portal clients can read document rows (documents table RLS) but the
-- storage.objects policy for the 'documents' bucket was is_internal-only, so
-- createSignedUrl() failed for them and the client document view was broken.
--
-- Document object paths are laid out as `<company_id | client_id>/<folder>/<file>`
-- (see src/components/document-upload.tsx). Grant a portal client SELECT on an
-- object when the leading path segment is a company/client they can access.

CREATE POLICY "Client docs read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND (
      public.user_can_access_company(auth.uid(), ((storage.foldername(name))[1])::uuid)
      OR public.user_can_access_client(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );
