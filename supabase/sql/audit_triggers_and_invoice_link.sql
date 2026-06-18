
-- Run in Supabase SQL Editor (Lovable)
-- Links invoice items to source transactions, adds audit triggers, ensures storage buckets.

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

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
    ELSIF TG_TABLE_NAME IN ('companies') THEN
      v_company_id := OLD.id;
      v_client_id := OLD.client_id;
    ELSIF TG_TABLE_NAME IN ('transactions','invoices','credentials','funding_applications','loans','calendar_events','documents') THEN
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
    ELSIF TG_TABLE_NAME IN ('transactions','invoices','credentials','funding_applications','loans','calendar_events','documents') THEN
      v_company_id := NEW.company_id;
    ELSIF TG_TABLE_NAME = 'invoice_items' THEN
      SELECT i.company_id INTO v_company_id FROM public.invoices i WHERE i.id = NEW.invoice_id;
    END IF;
  END IF;

  INSERT INTO public.activity_logs (actor_id, actor_name, action, entity_type, entity_id, company_id, client_id, summary, metadata)
  VALUES (v_actor_id, v_actor_name, v_action, v_entity_type, v_entity_id, v_company_id, v_client_id, v_summary, v_metadata);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_log_mutation() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients','companies','credentials','transactions','invoices',
    'invoice_items','funding_applications','loans','calendar_events','documents'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%s ON public.%s', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%s FOR EACH ROW EXECUTE FUNCTION public.audit_log_mutation()',
      t, t
    );
  END LOOP;
END;
$$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false), ('invoices', 'invoices', false), ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
