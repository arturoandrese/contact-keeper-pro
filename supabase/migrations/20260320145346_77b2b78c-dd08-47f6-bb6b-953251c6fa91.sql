CREATE TABLE public.prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  email text DEFAULT '',
  status text NOT NULL DEFAULT 'no_response',
  note text DEFAULT '',
  industry text DEFAULT '',
  referred_by text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on prospects" ON public.prospects
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);

CREATE UNIQUE INDEX prospects_email_unique ON public.prospects (email) WHERE email IS NOT NULL AND email != '';