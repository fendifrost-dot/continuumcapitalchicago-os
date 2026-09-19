
-- Storage buckets for documents and invoices
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('documents', 'documents', false, 52428800, NULL),
  ('invoices', 'invoices', false, 10485760, NULL),
  ('avatars', 'avatars', false, 2097152, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Central audit logging via triggers
CREATE OR REPLACE FUNCTION public.audit_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action TEXT;
  v_summary TEXT;
  v_entity_id UUID;
  v_company_id UUID;
  v_client_id UUID;
  v_metadata JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := lower(TG_TABLE_NAME) || '.created';
    v_entity_id := NEW.id;
    v_summary := 'Created ' || TG_TABLE_NAME || ' record';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := lower(TG_TABLE_NAME) || '.updated';
    v_entity_id := NEW.id;
    v_summary := 'Updated ' || TG_TABLE_NAME || ' record';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := lower(TG_TABLE_NAME) || '.deleted';
    v_entity_id := OLD.id;
    v_summary := 'Deleted ' || TG_TABLE_NAME || ' record';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'companies' THEN
      v_company_id := OLD.id;
      v_client_id := OLD.client_id;
    ELSIF TG_TABLE_NAME = 'clients' THEN
      v_company_id := NULL;
      v_client_id := OLD.id;
    ELSE
      v_company_id := OLD.company_id;
      v_client_id := (SELECT client_id FROM public.companies WHERE id = OLD.company_id);
    END IF;
    v_metadata := to_jsonb(OLD);
  ELSE
    IF TG_TABLE_NAME = 'companies' THEN
      v_company_id := NEW.id;
      v_client_id := NEW.client_id;
    ELSIF TG_TABLE_NAME = 'clients' THEN
      v_company_id := NULL;
      v_client_id := NEW.id;
    ELSE
      v_company_id := NEW.company_id;
      v_client_id := (SELECT client_id FROM public.companies WHERE id = NEW.company_id);
    END IF;
    v_metadata := to_jsonb(NEW);
  END IF;

  INSERT INTO public.activity_logs (actor_id, actor_name, action, entity_type, entity_id, company_id, client_id, summary, metadata)
  VALUES (
    auth.uid(),
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
    v_action,
    TG_TABLE_NAME,
    v_entity_id,
    v_company_id,
    v_client_id,
    v_summary,
    v_metadata
  );

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
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_log_mutation()',
      t, t
    );
  END LOOP;
END $$;
