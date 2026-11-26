DO $do$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.agent007_import_prospects(jsonb,boolean,date)'::regprocedure);
  n := replace(d, 'SELECT pattern, coalesce(confidence, 1) INTO r_pat, r_conf FROM domain_patterns',
    'SELECT pattern, coalesce(confidence, 1) + CASE WHEN example_email IS NOT NULL AND EXISTS (SELECT 1 FROM delivered_contacts dc WHERE lower(dc.mail) = lower(domain_patterns.example_email)) AND NOT EXISTS (SELECT 1 FROM bounced_emails b WHERE lower(b.mail) = lower(domain_patterns.example_email)) THEN 1 ELSE 0 END INTO r_pat, r_conf FROM domain_patterns');
  IF n = d THEN RAISE EXCEPTION 'patrón no encontrado'; END IF;
  EXECUTE n;
END $do$;
REVOKE ALL ON FUNCTION public.agent007_import_prospects(jsonb, boolean, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent007_import_prospects(jsonb, boolean, date) TO service_role;