CREATE TABLE public.company_industries (
  empresa_short text PRIMARY KEY,
  industry text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_industries TO anon, authenticated;
GRANT ALL ON public.company_industries TO service_role;
ALTER TABLE public.company_industries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on company_industries" ON public.company_industries FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivered_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domain_patterns TO authenticated;
CREATE POLICY "Allow all for authenticated" ON public.delivered_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON public.domain_patterns FOR ALL TO authenticated USING (true) WITH CHECK (true);