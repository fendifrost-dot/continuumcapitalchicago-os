
-- =====================================================================
-- ENUMS
-- =====================================================================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'consultant', 'assistant', 'bookkeeper', 'client');
CREATE TYPE public.client_status AS ENUM ('active', 'prospect', 'inactive', 'archived');
CREATE TYPE public.entity_type AS ENUM ('llc', 'c_corp', 's_corp', 'sole_prop', 'partnership', 'nonprofit', 'other');
CREATE TYPE public.transaction_category AS ENUM ('revenue', 'cogs', 'operating', 'payroll', 'tax', 'loan_payment', 'owner_draw', 'other');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'void');
CREATE TYPE public.funding_stage AS ENUM ('researching', 'applied', 'under_review', 'approved', 'funded', 'denied', 'closed');
CREATE TYPE public.event_type AS ENUM ('loan_payment', 'follow_up', 'renewal', 'filing_deadline', 'meeting', 'other');
CREATE TYPE public.credential_category AS ENUM ('banking', 'irs', 'state', 'payroll', 'software', 'utility', 'other');

-- =====================================================================
-- PROFILES + ROLES
-- =====================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_internal(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin','consultant','assistant','bookkeeper')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
$$;

-- =====================================================================
-- CLIENTS / COMPANIES
-- =====================================================================
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status public.client_status NOT NULL DEFAULT 'prospect',
  assigned_consultant UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.client_portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, client_id)
);
GRANT SELECT ON public.client_portal_users TO authenticated;
GRANT ALL ON public.client_portal_users TO service_role;
ALTER TABLE public.client_portal_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  dba TEXT,
  ein TEXT,
  entity_type public.entity_type DEFAULT 'llc',
  industry TEXT,
  business_email TEXT,
  business_phone TEXT,
  website TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  lease_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.companies(client_id);

-- Access helper: can the user see this company?
CREATE OR REPLACE FUNCTION public.user_can_access_company(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_internal(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.companies c
      JOIN public.client_portal_users cpu ON cpu.client_id = c.client_id
      WHERE c.id = _company_id AND cpu.user_id = _user_id
    )
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_client(_user_id UUID, _client_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_internal(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.client_portal_users
      WHERE user_id = _user_id AND client_id = _client_id
    )
$$;

-- =====================================================================
-- CREDENTIALS (metadata only)
-- =====================================================================
CREATE TABLE public.credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  category public.credential_category NOT NULL DEFAULT 'other',
  provider TEXT,
  username_hint TEXT,
  vault_reference TEXT,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credentials TO authenticated;
GRANT ALL ON public.credentials TO service_role;
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.credentials(company_id);

-- =====================================================================
-- TRANSACTIONS / INVOICES
-- =====================================================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  occurred_on DATE NOT NULL,
  payee TEXT,
  category public.transaction_category NOT NULL DEFAULT 'operating',
  amount NUMERIC(14,2) NOT NULL,
  description TEXT,
  billable BOOLEAN NOT NULL DEFAULT FALSE,
  invoice_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.transactions(company_id);
CREATE INDEX ON public.transactions(occurred_on);

CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  pdf_path TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.invoices(company_id);

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.invoice_items(invoice_id);

-- =====================================================================
-- FUNDING / LOANS
-- =====================================================================
CREATE TABLE public.funding_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lender TEXT NOT NULL,
  stage public.funding_stage NOT NULL DEFAULT 'researching',
  requested_amount NUMERIC(14,2),
  approved_amount NUMERIC(14,2),
  apr NUMERIC(6,3),
  term_months INTEGER,
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funding_applications TO authenticated;
GRANT ALL ON public.funding_applications TO service_role;
ALTER TABLE public.funding_applications ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.funding_applications(company_id);

CREATE TABLE public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lender TEXT NOT NULL,
  account_number TEXT,
  original_amount NUMERIC(14,2),
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  apr NUMERIC(6,3),
  monthly_payment NUMERIC(14,2),
  next_due_date DATE,
  autopay BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;
GRANT ALL ON public.loans TO service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.loans(company_id);

-- =====================================================================
-- CALENDAR / DOCUMENTS / ACTIVITY / NOTIFICATIONS / INVITES
-- =====================================================================
CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_type public.event_type NOT NULL DEFAULT 'other',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.calendar_events(company_id);
CREATE INDEX ON public.calendar_events(starts_at);

CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  folder TEXT NOT NULL DEFAULT 'Other',
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.documents(company_id);

CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.activity_logs(created_at DESC);
CREATE INDEX ON public.activity_logs(company_id);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.notifications(user_id, created_at DESC);

CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role public.app_role NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- updated_at trigger
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER tg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tg_clients_updated BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tg_companies_updated BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tg_invoices_updated BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tg_funding_updated BEFORE UPDATE ON public.funding_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tg_loans_updated BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- Auto-create profile on signup
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- RLS POLICIES
-- =====================================================================
-- profiles
CREATE POLICY "View own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_internal(auth.uid()));
CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- user_roles
CREATE POLICY "View own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- clients
CREATE POLICY "Internal can view clients" ON public.clients FOR SELECT TO authenticated
  USING (public.is_internal(auth.uid()) OR public.user_can_access_client(auth.uid(), id));
CREATE POLICY "Internal manage clients" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.is_internal(auth.uid()));
CREATE POLICY "Internal update clients" ON public.clients FOR UPDATE TO authenticated
  USING (public.is_internal(auth.uid()));
CREATE POLICY "Admin delete clients" ON public.clients FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- client_portal_users
CREATE POLICY "View own portal links" ON public.client_portal_users FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_internal(auth.uid()));
CREATE POLICY "Admin manage portal links" ON public.client_portal_users FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- companies
CREATE POLICY "Access companies" ON public.companies FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), id));
CREATE POLICY "Internal manage companies" ON public.companies FOR ALL TO authenticated
  USING (public.is_internal(auth.uid())) WITH CHECK (public.is_internal(auth.uid()));

-- credentials: only internal, and bookkeepers excluded
CREATE POLICY "Credentials internal non-bookkeeper" ON public.credentials FOR SELECT TO authenticated
  USING (
    public.is_internal(auth.uid())
    AND NOT public.has_role(auth.uid(), 'bookkeeper')
  );
CREATE POLICY "Credentials manage" ON public.credentials FOR ALL TO authenticated
  USING (
    public.is_internal(auth.uid()) AND NOT public.has_role(auth.uid(), 'bookkeeper')
  ) WITH CHECK (
    public.is_internal(auth.uid()) AND NOT public.has_role(auth.uid(), 'bookkeeper')
  );

-- transactions / invoices / invoice_items
CREATE POLICY "View transactions" ON public.transactions FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY "Internal manage transactions" ON public.transactions FOR ALL TO authenticated
  USING (public.is_internal(auth.uid())) WITH CHECK (public.is_internal(auth.uid()));

CREATE POLICY "View invoices" ON public.invoices FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY "Internal manage invoices" ON public.invoices FOR ALL TO authenticated
  USING (public.is_internal(auth.uid())) WITH CHECK (public.is_internal(auth.uid()));

CREATE POLICY "View invoice items" ON public.invoice_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND public.user_can_access_company(auth.uid(), i.company_id)
  ));
CREATE POLICY "Internal manage invoice items" ON public.invoice_items FOR ALL TO authenticated
  USING (public.is_internal(auth.uid())) WITH CHECK (public.is_internal(auth.uid()));

-- funding / loans
CREATE POLICY "View funding" ON public.funding_applications FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY "Internal manage funding" ON public.funding_applications FOR ALL TO authenticated
  USING (public.is_internal(auth.uid())) WITH CHECK (public.is_internal(auth.uid()));

CREATE POLICY "View loans" ON public.loans FOR SELECT TO authenticated
  USING (public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY "Internal manage loans" ON public.loans FOR ALL TO authenticated
  USING (public.is_internal(auth.uid())) WITH CHECK (public.is_internal(auth.uid()));

-- calendar / documents
CREATE POLICY "View calendar" ON public.calendar_events FOR SELECT TO authenticated
  USING (company_id IS NULL OR public.user_can_access_company(auth.uid(), company_id));
CREATE POLICY "Internal manage calendar" ON public.calendar_events FOR ALL TO authenticated
  USING (public.is_internal(auth.uid())) WITH CHECK (public.is_internal(auth.uid()));

CREATE POLICY "View documents" ON public.documents FOR SELECT TO authenticated
  USING (
    (company_id IS NOT NULL AND public.user_can_access_company(auth.uid(), company_id))
    OR (client_id IS NOT NULL AND public.user_can_access_client(auth.uid(), client_id))
  );
CREATE POLICY "Internal manage documents" ON public.documents FOR ALL TO authenticated
  USING (public.is_internal(auth.uid())) WITH CHECK (public.is_internal(auth.uid()));

-- activity
CREATE POLICY "View activity for accessible companies" ON public.activity_logs FOR SELECT TO authenticated
  USING (
    public.is_internal(auth.uid())
    OR (company_id IS NOT NULL AND public.user_can_access_company(auth.uid(), company_id))
    OR (client_id IS NOT NULL AND public.user_can_access_client(auth.uid(), client_id))
  );
CREATE POLICY "Insert activity" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR public.is_internal(auth.uid()));

-- notifications
CREATE POLICY "View own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- invitations: admin-only
CREATE POLICY "Admin manage invitations" ON public.invitations FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- =====================================================================
-- Realtime
-- =====================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.funding_applications;
