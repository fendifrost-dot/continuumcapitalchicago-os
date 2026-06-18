
-- Internal users full access to documents and invoices
CREATE POLICY "Internal docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('documents','invoices') AND public.is_internal(auth.uid()));
CREATE POLICY "Internal docs insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('documents','invoices') AND public.is_internal(auth.uid()));
CREATE POLICY "Internal docs update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('documents','invoices') AND public.is_internal(auth.uid()));
CREATE POLICY "Internal docs delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('documents','invoices') AND public.is_internal(auth.uid()));

-- Avatars: each user can manage their own avatar at avatars/<uid>/...
CREATE POLICY "Avatars own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_internal(auth.uid())));
CREATE POLICY "Avatars own write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Avatars own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
