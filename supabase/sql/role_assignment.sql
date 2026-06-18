-- Run in Supabase SQL Editor (Lovable)
-- Fixes role assignment: firm staff vs client portal users

-- 1) Promote firm owner/staff immediately
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role
FROM auth.users
WHERE lower(email) IN ('info@continuumcapitalchicago.com')
   OR lower(email) LIKE '%@continuumcapitalchicago.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Remove client role from firm staff if mis-assigned
DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id
  AND ur.role = 'client'
  AND (lower(u.email) LIKE '%@continuumcapitalchicago.com'
       OR lower(u.email) = 'info@continuumcapitalchicago.com');

-- 2) Replace signup role trigger — do NOT give every Google user consultant access
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_email TEXT;
BEGIN
  user_email := lower(coalesce(NEW.email, ''));

  IF user_email IN ('info@continuumcapitalchicago.com')
     OR user_email LIKE '%@continuumcapitalchicago.com' THEN
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
  -- Otherwise: no role until admin links client or sends invitation

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
