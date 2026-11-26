CREATE TABLE public.ccp_pin_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  salt text, hash text, pin_version text, owner_user_id uuid,
  failed_count int NOT NULL DEFAULT 0, locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ccp_pin_state TO service_role;
ALTER TABLE public.ccp_pin_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.ccp_pin_state FOR ALL TO service_role USING (true) WITH CHECK (true);
INSERT INTO public.ccp_pin_state (id) VALUES (1);

CREATE TABLE public.ccp_sessions (
  session_id uuid PRIMARY KEY, user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL, revoked_at timestamptz
);
GRANT ALL ON public.ccp_sessions TO service_role;
ALTER TABLE public.ccp_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.ccp_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Atomic attempt reservation: counts the attempt before verifying, locks at 5.
CREATE OR REPLACE FUNCTION public.ccp_pin_begin()
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s ccp_pin_state;
BEGIN
  SELECT * INTO s FROM ccp_pin_state WHERE id = 1 FOR UPDATE;
  IF s.locked_until IS NOT NULL AND s.locked_until > now() THEN
    RETURN jsonb_build_object('locked', true, 'locked_until', s.locked_until);
  END IF;
  IF s.locked_until IS NOT NULL THEN s.failed_count := 0; END IF;
  UPDATE ccp_pin_state SET failed_count = s.failed_count + 1,
    locked_until = CASE WHEN s.failed_count + 1 >= 5 THEN now() + interval '15 minutes' END,
    updated_at = now() WHERE id = 1;
  RETURN jsonb_build_object('locked', false, 'attempts_left', greatest(0, 5 - (s.failed_count + 1)));
END $$;
CREATE OR REPLACE FUNCTION public.ccp_pin_success()
RETURNS void LANGUAGE sql SET search_path = public AS $$
  UPDATE ccp_pin_state SET failed_count = 0, locked_until = NULL, updated_at = now() WHERE id = 1;
$$;
REVOKE ALL ON FUNCTION public.ccp_pin_begin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ccp_pin_success() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ccp_pin_begin() TO service_role;
GRANT EXECUTE ON FUNCTION public.ccp_pin_success() TO service_role;

CREATE OR REPLACE FUNCTION private.is_ccp_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ccp_sessions s JOIN public.ccp_pin_state p ON p.id = 1 AND p.owner_user_id = s.user_id
    WHERE s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      AND s.user_id = auth.uid() AND s.revoked_at IS NULL AND s.expires_at > now())
$$;
REVOKE ALL ON FUNCTION private.is_ccp_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_ccp_owner() TO authenticated, service_role;

DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['bases','bounced_emails','company_industries','contacts','delivered_contacts','domain_patterns','licitaciones','prospects','replied_contacts','scheduled_reminders'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "ccp owner session" ON public.%I FOR ALL TO authenticated USING (private.is_ccp_owner()) WITH CHECK (private.is_ccp_owner())', t);
  END LOOP;
END $$;
REVOKE USAGE ON SCHEMA private FROM anon;