ALTER TABLE public.autosend_templates
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS base_kind text,
  ADD COLUMN IF NOT EXISTS match_terms text[] NOT NULL DEFAULT '{}';
UPDATE public.autosend_templates SET base_kind = kind, label = CASE kind WHEN 'presentacion' THEN 'Presentación (general)' ELSE 'Reactivación (general)' END WHERE base_kind IS NULL;