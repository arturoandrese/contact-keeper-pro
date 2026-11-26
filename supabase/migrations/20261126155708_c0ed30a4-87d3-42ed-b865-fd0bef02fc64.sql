CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION private.is_agent_base(_base_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _base_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.agent_prospects WHERE base_id = _base_id)
    OR EXISTS (SELECT 1 FROM public.agent_import_runs WHERE base_id = _base_id))
$$;
REVOKE ALL ON FUNCTION private.is_agent_base(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_agent_base(uuid) TO anon, authenticated, service_role;
DROP POLICY "hide agent bases" ON public.bases;
DROP POLICY "hide agent contacts" ON public.contacts;
CREATE POLICY "hide agent bases" ON public.bases AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (NOT private.is_agent_base(id)) WITH CHECK (NOT private.is_agent_base(id));
CREATE POLICY "hide agent contacts" ON public.contacts AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (NOT private.is_agent_base(base_id)) WITH CHECK (NOT private.is_agent_base(base_id));
DROP FUNCTION public.is_agent_base(uuid);