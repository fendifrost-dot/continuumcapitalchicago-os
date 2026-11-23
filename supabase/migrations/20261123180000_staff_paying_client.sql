-- Staff-controlled paying-client flag.
-- This is a record staff set at their discretion. It does not read or
-- change charges, mailings, or invoices.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_paying_client boolean;

ALTER TABLE public.clients
  ALTER COLUMN is_paying_client SET DEFAULT false;

UPDATE public.clients
SET is_paying_client = false
WHERE is_paying_client IS NULL;

ALTER TABLE public.clients
  ALTER COLUMN is_paying_client SET NOT NULL;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS paying_marked_by uuid;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS paying_marked_at timestamptz;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS paying_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clients_paying_marked_by_fkey'
      AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_paying_marked_by_fkey
      FOREIGN KEY (paying_marked_by)
      REFERENCES auth.users (id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.clients.is_paying_client IS
  'Staff discretion flag. Independent of card charges and letter payment.';
COMMENT ON COLUMN public.clients.paying_marked_by IS
  'Internal staff user who last changed the paying flag or note.';
COMMENT ON COLUMN public.clients.paying_marked_at IS
  'When an internal staff user last changed the paying flag or note.';
COMMENT ON COLUMN public.clients.paying_note IS
  'Optional staff note about the paying-client flag.';

-- Staff and portal users share the authenticated role, so a column GRANT
-- cannot tell them apart. The existing UPDATE policy is already internal-only.
-- This trigger is the column guard: a later policy that lets a portal user
-- update their own client row still cannot write these four columns.
-- Anon has no table grant. service_role and the SQL editor (no JWT) may write
-- the columns; an internal user who changes them is stamped over whatever
-- paying_marked_by / paying_marked_at the request sent.

CREATE OR REPLACE FUNCTION public.guard_client_paying_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paying_changed boolean;
  jwt_role text;
BEGIN
  IF NEW.paying_note IS NOT NULL THEN
    NEW.paying_note := NULLIF(btrim(NEW.paying_note), '');
  END IF;

  IF TG_OP = 'INSERT' THEN
    paying_changed :=
      COALESCE(NEW.is_paying_client, false)
      OR NEW.paying_note IS NOT NULL
      OR NEW.paying_marked_by IS NOT NULL
      OR NEW.paying_marked_at IS NOT NULL;
  ELSE
    paying_changed :=
      NEW.is_paying_client IS DISTINCT FROM OLD.is_paying_client
      OR NEW.paying_note IS DISTINCT FROM OLD.paying_note
      OR NEW.paying_marked_by IS DISTINCT FROM OLD.paying_marked_by
      OR NEW.paying_marked_at IS DISTINCT FROM OLD.paying_marked_at;
  END IF;

  IF NOT paying_changed THEN
    RETURN NEW;
  END IF;

  jwt_role := COALESCE(auth.role(), '');

  IF auth.uid() IS NOT NULL AND public.is_internal(auth.uid()) THEN
    NEW.paying_marked_by := auth.uid();
    NEW.paying_marked_at := now();
    RETURN NEW;
  END IF;

  -- No JWT: migration / SQL editor. service_role: trusted backend.
  IF auth.uid() IS NULL AND jwt_role IN ('', 'service_role') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only internal staff can update paying client fields'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS tg_clients_paying_flag ON public.clients;
CREATE TRIGGER tg_clients_paying_flag
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_client_paying_flag();

COMMENT ON FUNCTION public.guard_client_paying_flag() IS
  'Rejects portal and anon writes to paying-client columns. Stamps the staff user who changed them.';

REVOKE ALL ON FUNCTION public.guard_client_paying_flag() FROM PUBLIC, anon, authenticated;

-- Keep the explicit internal check on the row policy. WITH CHECK matches USING
-- for this policy today; restating it keeps a portal user from writing the row
-- back if a future change splits the two expressions.
DROP POLICY IF EXISTS "Internal update clients" ON public.clients;
CREATE POLICY "Internal update clients"
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (public.is_internal(auth.uid()))
  WITH CHECK (public.is_internal(auth.uid()));

-- Do not grant these columns, or the table, to anon. Direct grants to
-- authenticated and service_role are left in place.
REVOKE ALL ON TABLE public.clients FROM anon;
REVOKE ALL ON TABLE public.clients FROM PUBLIC;
