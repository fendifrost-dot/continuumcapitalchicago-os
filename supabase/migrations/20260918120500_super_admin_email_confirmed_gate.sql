-- H1 (defense-in-depth): do not grant firm-domain super_admin until the account
-- has a confirmed email. OAuth (Google) accounts are created already-confirmed,
-- so firm staff signing in with Google are unaffected. Password signups get the
-- role only after confirming (applied on first sign-in by ensure-user-role).
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_email TEXT;
BEGIN
  user_email := lower(coalesce(NEW.email, ''));
  IF (user_email = 'info@continuumcapitalchicago.com'
      OR user_email LIKE '%@continuumcapitalchicago.com')
     AND NEW.email_confirmed_at IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF EXISTS (
    SELECT 1 FROM public.invitations
    WHERE lower(email) = user_email
      AND accepted_at IS NULL
      AND expires_at > now()
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT NEW.id, role FROM public.invitations
    WHERE lower(email) = user_email
      AND accepted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF EXISTS (
    SELECT 1 FROM public.client_portal_users WHERE user_id = NEW.id
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'client')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
